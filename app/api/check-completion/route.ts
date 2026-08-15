import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SHEET_ID = '1q-QxZ1kfe8fAwxiMC7s4fIHJ3Lzg8d0n_N7Rl6a6ia8'

const MONTH_NAMES_ES: Record<number, string> = {
  1: 'ENERO', 2: 'FEBRERO', 3: 'MARZO', 4: 'ABRIL', 5: 'MAYO',
  6: 'JUNIO', 7: 'JULIO', 8: 'AGOSTO', 9: 'SEPTIEMBRE',
  10: 'OCTUBRE', 11: 'NOVIEMBRE', 12: 'DICIEMBRE',
}

// Mapea nombre de región en DB → prefijo de pestaña en Google Sheets
const REGION_SHEET_MAP: Record<string, string> = {
  'Osorno': 'OSORNO',
  'Valdivia': 'VALDIVIA',
  'Concepción': 'CONCEPCION',
  'Santiago': 'JDN',
  'Temuco': 'TEMUCO',
}

// Palabras clave que identifican un delivery type (campañas) — no un nombre de proyecto
const DELIVERY_KEYWORDS = [
  'carrusel general',
  'carrusel',
  'retargeting',
  'espacios comunes',
  'espacios',
  'padres universitarios',
  'padres',
  'inversionista',
  'base de datos lookalike',
  'lookalike',
]

function normalizeStr(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

function isDeliveryType(text: string): boolean {
  const norm = normalizeStr(text)
  return DELIVERY_KEYWORDS.some(kw => norm === kw || norm.startsWith(kw + ' '))
}

function isHeaderOrMonthRow(text: string): boolean {
  const norm = normalizeStr(text)
  const monthNames = Object.values(MONTH_NAMES_ES).map(m => m.toLowerCase())
  if (monthNames.some(m => norm === m)) return true
  if (['texto', 'textos', 'comentario', 'comentarios', 'formato', 'formatos'].some(w => norm.startsWith(w))) return true
  return false
}

function isContentRow(text: string): boolean {
  // Las filas de contenido son oraciones largas (copy de marketing)
  return text.length > 55 || (text.includes('.') && text.length > 20)
}

interface SheetProject {
  name: string
  deliveries: string[]
}

function parseSheetCSV(csv: string): SheetProject[] {
  const projects: SheetProject[] = []

  // Extraer primera columna de cada fila CSV (respetando comillas)
  const rows = csv.split('\n').map(line => {
    const match = line.match(/^"((?:[^"\\]|\\.|"")*)"/)
    if (match) return match[1].replace(/""/g, '"').trim()
    return line.split(',')[0].replace(/^"|"$/g, '').trim()
  }).filter(Boolean)

  let currentProject: string | null = null
  let currentDeliveries: string[] = []
  let headersFound = false

  for (const row of rows) {
    if (!row) continue

    // Saltar filas de encabezado (mes, columnas)
    if (isHeaderOrMonthRow(row)) {
      headersFound = true
      continue
    }
    if (!headersFound) {
      headersFound = true
      continue
    }

    // Saltar filas de contenido (copy largo)
    if (isContentRow(row)) continue

    if (isDeliveryType(row)) {
      // Es un tipo de campaña/delivery
      if (currentProject) {
        currentDeliveries.push(row)
      }
    } else {
      // Es un nombre de proyecto
      if (currentProject && currentDeliveries.length > 0) {
        projects.push({ name: currentProject, deliveries: [...currentDeliveries] })
      }
      currentProject = row
      currentDeliveries = []
    }
  }

  // Último proyecto
  if (currentProject && currentDeliveries.length > 0) {
    projects.push({ name: currentProject, deliveries: currentDeliveries })
  }

  return projects
}

async function fetchSheetProjects(region: string, month: number): Promise<SheetProject[]> {
  const monthName = MONTH_NAMES_ES[month]
  const regionCode = REGION_SHEET_MAP[region] || region.toUpperCase()
  const sheetName = `${regionCode} ${monthName}`

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`

  try {
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store' })
    if (!res.ok) return []
    const csv = await res.text()
    return parseSheetCSV(csv)
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  const { region } = await req.json()
  if (!region) return NextResponse.json({ error: 'region required' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const monthKey = `${now.getFullYear()}-${String(currentMonth).padStart(2, '0')}`

  // ¿Ya se envió una revisión este mes para esta región?
  const { data: existingReview } = await supabase
    .from('ai_reviews')
    .select('id')
    .eq('region', region)
    .eq('month', monthKey)
    .maybeSingle()

  if (existingReview) {
    return NextResponse.json({
      complete: true,
      alreadyReviewed: true,
      message: `Ya se envió la revisión de IA para ${region} en ${monthKey}`,
    })
  }

  // Obtener proyectos esperados del Google Sheet
  const expectedProjects = await fetchSheetProjects(region, currentMonth)
  if (expectedProjects.length === 0) {
    return NextResponse.json({
      complete: false,
      message: `No se encontró la pestaña del sheet para ${region} en ${MONTH_NAMES_ES[currentMonth]}`,
    })
  }

  // Obtener proyectos y deliveries reales del DB (solo no archivados)
  const { data: dbProjects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('region', region)
    .eq('archived', false)

  if (!dbProjects?.length) {
    return NextResponse.json({ complete: false, message: 'No hay proyectos activos en la región' })
  }

  const projectIds = dbProjects.map(p => p.id)
  const { data: dbDeliveries } = await supabase
    .from('deliveries')
    .select('id, project_id, name')
    .in('project_id', projectIds)

  // Comparar: para cada proyecto esperado, verificar que exista con todos sus deliveries
  const missing: string[] = []

  for (const expected of expectedProjects) {
    const normExpected = normalizeStr(expected.name)

    // Buscar proyecto en DB con nombre normalizado
    const dbProject = dbProjects.find(p => normalizeStr(p.name) === normExpected)

    if (!dbProject) {
      missing.push(`Proyecto no encontrado: "${expected.name}"`)
      continue
    }

    const projectDeliveries = dbDeliveries?.filter(d => d.project_id === dbProject.id) || []

    for (const expectedDelivery of expected.deliveries) {
      const normDelivery = normalizeStr(expectedDelivery)
      const found = projectDeliveries.some(d => {
        const nd = normalizeStr(d.name)
        // Match exacto o si uno contiene al otro (maneja "Carrusel general" vs "Carrusel")
        return nd === normDelivery || nd.startsWith(normDelivery) || normDelivery.startsWith(nd)
      })
      if (!found) {
        missing.push(`"${expected.name}" → delivery faltante: "${expectedDelivery}"`)
      }
    }
  }

  const isComplete = missing.length === 0

  if (isComplete) {
    // Disparar revisión en background (sin esperar respuesta)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://civilia-revision.vercel.app'
    fetch(`${baseUrl}/api/review-images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region, monthKey }),
    }).catch(() => {
      // Silenciar errores de red; la revisión se puede reintentar
    })

    return NextResponse.json({
      complete: true,
      message: `¡Completo! Revisión de IA iniciada para ${region}`,
      expected: expectedProjects,
    })
  }

  return NextResponse.json({
    complete: false,
    missing,
    expectedCount: expectedProjects.reduce((sum, p) => sum + p.deliveries.length, 0),
    message: `Faltan ${missing.length} deliveries por subir`,
  })
}
