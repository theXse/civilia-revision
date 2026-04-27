import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

// Vercel Pro: hasta 5 minutos para analizar todas las imágenes
export const maxDuration = 300

const REVIEW_RECIPIENTS = 'ximena@laruta.ai'
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ImageRecord {
  id: string
  url: string
  name: string
  delivery_id: string
}

interface DeliveryRecord {
  id: string
  project_id: string
  name: string
}

interface ProjectRecord {
  id: string
  name: string
  region: string
}

interface ProjectReview {
  projectName: string
  issues: string[]
  imageCount: number
}


// Encodifica correctamente una URL de Supabase Storage
// Maneja nombres de archivo con espacios y caracteres especiales
function encodeStorageUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    // Re-encodificar cada segmento del path individualmente
    urlObj.pathname = urlObj.pathname
      .split('/')
      .map(seg => encodeURIComponent(decodeURIComponent(seg)))
      .join('/')
    return urlObj.toString()
  } catch {
    return url
  }
}

// Descarga una imagen con hasta 3 intentos, con pausa entre cada uno
async function fetchImageAsBase64(
  url: string,
  retries = 3
): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' } | null> {
  const cleanUrl = encodeStorageUrl(url)

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)
      const res = await fetch(cleanUrl, { cache: 'no-store', signal: controller.signal })
      clearTimeout(timeout)

      if (!res.ok) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1000 * attempt)); continue }
        return null
      }

      const rawType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase()
      let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' = 'image/jpeg'
      if (rawType === 'image/png') mediaType = 'image/png'
      else if (rawType === 'image/webp') mediaType = 'image/webp'
      else if (rawType === 'image/gif') mediaType = 'image/gif'

      const buffer = await res.arrayBuffer()
      const data = Buffer.from(buffer).toString('base64')
      return { data, mediaType }
    } catch {
      if (attempt < retries) { await new Promise(r => setTimeout(r, 1000 * attempt)); continue }
      return null
    }
  }
  return null
}

// Analiza las imágenes de UN delivery con Claude vision
// Cada delivery se procesa en su propia llamada para que los números de lámina sean exactos
async function reviewDeliveryImages(
  projectName: string,
  deliveryName: string,
  images: ImageRecord[]
): Promise<{ withErrors: { n: number; label: string; errors: string[] }[]; withoutErrors: { n: number; label: string; errors: string[] }[]; failed: string[] }> {
  const failed: string[] = []

  // Descargar todas las imágenes en paralelo
  const results = await Promise.all(
    images.map(async (img, idx) => ({ img, idx: idx + 1, base64: await fetchImageAsBase64(img.url) }))
  )

  const imageContents: Anthropic.ImageBlockParam[] = []
  const labelList: string[] = []

  for (const { img, idx, base64 } of results) {
    if (!base64) {
      failed.push(`${deliveryName} / ${img.name}`)
      continue
    }
    // Etiqueta simple: "Lámina 1", "Lámina 2"… Claude solo ve imágenes de este delivery
    labelList.push(`Lámina ${idx}`)
    imageContents.push({
      type: 'image',
      source: { type: 'base64', media_type: base64.mediaType, data: base64.data },
    })
  }

  if (imageContents.length === 0) {
    return { withErrors: [], withoutErrors: [], failed }
  }

  const labelListText = labelList.map((l, i) => `Imagen ${i + 1}: [${l}]`).join('\n')

  const textPrompt = `Eres un revisor de calidad de material gráfico para una empresa inmobiliaria chilena llamada "La Ruta".

Estás analizando láminas de la categoría "${deliveryName}" del proyecto "${projectName}":
${labelListText}

IMPORTANTE: La imagen 1 corresponde a Lámina 1, imagen 2 a Lámina 2, y así sucesivamente.

Revisa CADA imagen leyendo TODO el texto visible y buscando:
1. **Ortografía**: tildes faltantes, palabras mal escritas
2. **Concordancia gramatical**: género y número deben concordar (ej: "Entorno universitarios" → error, debe ser "Entorno universitario"; "espacios común" → error, debe ser "espacios comunes"; "vida universitarios" → error, debe ser "vida universitaria")
3. **Coherencia**: el texto debe tener sentido (frases completas, sujeto y predicado concordantes)
4. **Puntuación inconsistente**: mezcla de mayúsculas/minúsculas, bullets con/sin punto final

SÉ MUY ESTRICTO con la concordancia de género y número — es el error más común.
IMPORTANTE: Referencias a meses futuros (ej: "en mayo", "en junio") son INTENCIONALES, no las reportes como error.

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional:
[
  {"n": 1, "label": "${deliveryName} — Lámina 1", "errors": ["descripción exacta del error con el texto afectado"]},
  {"n": 2, "label": "${deliveryName} — Lámina 2", "errors": []},
  ...
]

El campo "label" sigue SIEMPRE el formato "${deliveryName} — Lámina N".
Si no hay errores en una imagen, "errors" es [].
Responde en español.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            ...imageContents,
            { type: 'text', text: textPrompt },
          ],
        },
      ],
    })

    const rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => ('text' in b ? b.text : ''))
      .join('').trim()

    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed: { n: number; label: string; errors: string[] }[] = JSON.parse(jsonMatch[0])
      return {
        withErrors: parsed.filter(item => item.errors.length > 0),
        withoutErrors: parsed.filter(item => item.errors.length === 0),
        failed,
      }
    }
  } catch {
    // Si falla silenciosamente, devolver vacío con las imágenes como fallidas
    for (const img of images) failed.push(`${deliveryName} / ${img.name}`)
  }

  return { withErrors: [], withoutErrors: [], failed }
}

// Analiza todas las imágenes de un proyecto, delivery por delivery
async function reviewProjectImages(
  projectName: string,
  images: ImageRecord[],
  deliveries: DeliveryRecord[]
): Promise<string[]> {
  if (images.length === 0) return []

  // Agrupar imágenes por delivery
  const imagesByDelivery: Record<string, ImageRecord[]> = {}
  for (const img of images) {
    if (!imagesByDelivery[img.delivery_id]) imagesByDelivery[img.delivery_id] = []
    imagesByDelivery[img.delivery_id].push(img)
  }

  const allFailedImages: string[] = []

  // Analizar todos los deliveries en paralelo (más rápido que secuencial)
  const deliveryResults = await Promise.all(
    deliveries
      .filter(d => imagesByDelivery[d.id]?.length > 0)
      .map(async d => {
        const result = await reviewDeliveryImages(projectName, d.name, imagesByDelivery[d.id])
        return { deliveryName: d.name, ...result }
      })
  )

  // Acumular resultados de todos los deliveries en un único issue estructurado
  const allWithErrors: { n: number; label: string; errors: string[] }[] = []
  const allWithoutErrors: { n: number; label: string; errors: string[] }[] = []

  for (const result of deliveryResults) {
    allWithErrors.push(...result.withErrors)
    allWithoutErrors.push(...result.withoutErrors)
    allFailedImages.push(...result.failed)
  }

  const allIssues: string[] = []

  if (allWithErrors.length > 0 || allWithoutErrors.length > 0) {
    allIssues.push(JSON.stringify({ withErrors: allWithErrors, withoutErrors: allWithoutErrors }))
  }

  // Si hubo imágenes que no pudieron cargarse, reportarlo como aviso
  if (allFailedImages.length > 0) {
    allIssues.push(
      `⚠️ No se pudieron analizar ${allFailedImages.length} lámina(s) por error de descarga:\n` +
      allFailedImages.map(n => `  • ${n}`).join('\n') +
      `\n\nEstas láminas deben revisarse manualmente.`
    )
  }

  return allIssues
}

function buildEmailHtml(region: string, projectReviews: ProjectReview[]): string {
  const hasIssues = projectReviews.some(p => p.issues.length > 0)

  const projectSections = projectReviews
    .map(pr => {
      const issuesHtml =
        pr.issues.length === 0
          ? '<p style="color:#16a34a;margin:0">✅ Sin errores detectados.</p>'
          : pr.issues.map(issue =>
              `<div style="background:#fefce8;border-left:3px solid #ca8a04;padding:10px 14px;margin-bottom:10px;border-radius:0 6px 6px 0;font-size:14px;line-height:1.6;white-space:pre-wrap">${issue}</div>`
            ).join('')

      return `
        <div style="margin-bottom:28px">
          <h3 style="margin:0 0 10px;font-size:16px;color:#1e293b;border-bottom:1px solid #e2e8f0;padding-bottom:6px">
            📐 ${pr.projectName}
            <span style="font-size:12px;color:#94a3b8;font-weight:400;margin-left:8px">(${pr.imageCount} láminas revisadas)</span>
          </h3>
          ${issuesHtml}
        </div>`
    })
    .join('')

  const summary = hasIssues
    ? '⚠️ Se encontraron observaciones en algunas láminas. Revisa los detalles a continuación.'
    : '🎉 ¡Todo perfecto! No se detectaron errores en las láminas.'

  return `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
      <div style="background:#7c3aed;color:white;padding:16px 20px;border-radius:8px;margin-bottom:20px">
        <h2 style="margin:0;font-size:18px">🤖 Revisión de IA — ${region}</h2>
        <p style="margin:4px 0 0;font-size:13px;opacity:0.85">Láminas del mes actual</p>
      </div>

      <p style="margin:0 0 20px;color:#475569;font-size:14px">${summary}</p>

      ${projectSections}

      <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:14px">
        Revisión automática generada por el agente de IA de La Ruta · civilia-revision.vercel.app
      </p>
    </div>
  `
}

export async function POST(req: NextRequest) {
  // force=true: llamada manual desde el botón — siempre muestra resultados, no bloquea por already_sent
  const { region, monthKey, force } = await req.json()
  if (!region) return NextResponse.json({ error: 'region required' }, { status: 400 })

  const user = process.env.NOTIFY_GMAIL_USER
  const pass = process.env.NOTIFY_GMAIL_APP_PASSWORD
  if (!user || !pass) {
    return NextResponse.json({ error: 'Email no configurado' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const now = new Date()
  const resolvedMonthKey = monthKey || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Verificar si ya se envió el correo este mes
  const { data: existing } = await supabase
    .from('ai_reviews')
    .select('id')
    .eq('region', region)
    .eq('month', resolvedMonthKey)
    .maybeSingle()

  const alreadySent = !!existing
  // Si no es forzado y ya se envió → bloquear (evita duplicados en trigger automático)
  if (!force && alreadySent) {
    return NextResponse.json({ ok: false, reason: 'already_sent' })
  }

  // Obtener proyectos activos de la región
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, region')
    .eq('region', region)
    .eq('archived', false)

  if (!projects?.length) {
    return NextResponse.json({ ok: false, reason: 'no_projects' })
  }

  const projectIds = projects.map((p: ProjectRecord) => p.id)

  // Obtener deliveries
  const { data: deliveries } = await supabase
    .from('deliveries')
    .select('id, project_id, name')
    .in('project_id', projectIds)

  if (!deliveries?.length) {
    return NextResponse.json({ ok: false, reason: 'no_deliveries' })
  }

  const deliveryIds = deliveries.map((d: DeliveryRecord) => d.id)

  // Obtener TODAS las imágenes activas (sin filtro de mes — revisa todo lo subido en proyectos activos)
  const { data: images } = await supabase
    .from('images')
    .select('id, url, name, delivery_id, created_at')
    .in('delivery_id', deliveryIds)

  if (!images?.length) {
    return NextResponse.json({ ok: false, reason: 'no_images' })
  }

  // Agrupar imágenes por proyecto
  const deliveryToProject: Record<string, string> = {}
  for (const d of deliveries as DeliveryRecord[]) {
    deliveryToProject[d.id] = d.project_id
  }

  const imagesByProject: Record<string, ImageRecord[]> = {}
  for (const img of images as ImageRecord[]) {
    const projectId = deliveryToProject[img.delivery_id]
    if (!projectId) continue
    if (!imagesByProject[projectId]) imagesByProject[projectId] = []
    imagesByProject[projectId].push(img)
  }

  // Revisar cada proyecto con Claude vision
  const projectReviews: ProjectReview[] = []

  for (const project of projects as ProjectRecord[]) {
    const projectImages = imagesByProject[project.id] || []
    const projectDeliveries = (deliveries as DeliveryRecord[]).filter(d => d.project_id === project.id)

    const issues = await reviewProjectImages(project.name, projectImages, projectDeliveries)

    projectReviews.push({
      projectName: project.name,
      issues,
      imageCount: projectImages.length, // total en DB
    })
  }

  // Registrar revisión (solo si es la primera vez este mes)
  if (!alreadySent) {
    await supabase.from('ai_reviews').insert({
      region,
      month: resolvedMonthKey,
      projects_reviewed: projectReviews.map(p => p.projectName),
    })
  }

  // Enviar email solo si es la primera vez (no re-enviar en runs manuales repetidos)
  if (!alreadySent) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  })

  const html = buildEmailHtml(region, projectReviews)
  const hasIssues = projectReviews.some(p => p.issues.length > 0)
  const subject = hasIssues
    ? `⚠️ Revisión IA: se encontraron observaciones en ${region}`
    : `✅ Revisión IA: sin errores en ${region}`

  await transporter.sendMail({
    from: `"Agente IA — La Ruta" <${user}>`,
    to: REVIEW_RECIPIENTS,
    subject,
    html,
  })
  } // fin if (!alreadySent)

  return NextResponse.json({
    ok: true,
    region,
    projectsReviewed: projectReviews.length,
    totalImages: images.length,
    reviews: projectReviews,
    emailSent: !alreadySent,
  })
}
