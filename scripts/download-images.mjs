#!/usr/bin/env node
/**
 * Descarga masiva de láminas desde Supabase.
 *
 * Filtra por región y por mes (created_at) y descarga cada imagen a:
 *   descargas/<region-slug>-<YYYY-MM>/<proyecto>/<delivery>/<archivo>
 *
 * Uso:
 *   node scripts/download-images.mjs                       # Concepción, mes actual
 *   node scripts/download-images.mjs --region Concepción --month 2026-07
 *   node scripts/download-images.mjs --region Santiago --month 2026-06 --out /ruta/salida
 *
 * Credenciales: usa NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 * si están en el entorno; si no, cae a los valores del proyecto (anon key pública).
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jgxzjswqgmghlmmrvbhm.supabase.co'
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_OBbKpkzwZyDPn2KPYVjnUQ_ee-oLjd1'

// ---- args ----
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const now = new Date()
const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

const REGION = arg('region', 'Concepción')
const MONTH = arg('month', defaultMonth) // formato YYYY-MM
const OUT_BASE = arg('out', 'descargas')

// rango [inicio, fin) del mes en UTC
const [year, mon] = MONTH.split('-').map(Number)
if (!year || !mon || mon < 1 || mon > 12) {
  console.error(`❌ --month inválido: "${MONTH}" (usa formato YYYY-MM, ej. 2026-07)`)
  process.exit(1)
}
const start = new Date(Date.UTC(year, mon - 1, 1)).toISOString()
const end = new Date(Date.UTC(year, mon, 1)).toISOString()

const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }

function slug(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'sin-nombre'
}

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers })
  if (!res.ok) {
    throw new Error(`REST ${res.status} en ${path}: ${(await res.text()).slice(0, 200)}`)
  }
  return res.json()
}

// PostgREST filtro IN: in.(a,b,c) con valores entre comillas dobles
function inList(values) {
  return `in.(${values.map((v) => `"${v}"`).join(',')})`
}

async function main() {
  console.log(`📍 Región: ${REGION}`)
  console.log(`🗓️  Mes: ${MONTH}  (${start} → ${end})`)

  // 1) Proyectos de la región
  const projects = await rest(
    `projects?select=id,name,region&region=eq.${encodeURIComponent(REGION)}`,
  )
  if (!projects.length) {
    console.log(`⚠️  No hay proyectos para la región "${REGION}".`)
    return
  }
  console.log(`📁 Proyectos en ${REGION}: ${projects.length}`)
  const projectById = new Map(projects.map((p) => [p.id, p]))

  // 2) Deliveries de esos proyectos
  const deliveries = await rest(
    `deliveries?select=id,name,project_id&project_id=${inList(projects.map((p) => p.id))}`,
  )
  const deliveryById = new Map(deliveries.map((d) => [d.id, d]))
  if (!deliveries.length) {
    console.log('⚠️  No hay deliveries para esos proyectos.')
    return
  }

  // 3) Imágenes del mes en esos deliveries
  const images = await rest(
    `images?select=id,name,url,delivery_id,created_at` +
      `&delivery_id=${inList(deliveries.map((d) => d.id))}` +
      `&created_at=gte.${start}&created_at=lt.${end}` +
      `&order=created_at`,
  )

  if (!images.length) {
    console.log(`⚠️  No hay imágenes de ${REGION} creadas en ${MONTH}.`)
    return
  }
  console.log(`🖼️  Imágenes a descargar: ${images.length}\n`)

  const outRoot = join(OUT_BASE, `${slug(REGION)}-${MONTH}`)

  let ok = 0
  let fail = 0
  const failures = []

  // descarga con concurrencia limitada
  const CONCURRENCY = 6
  let idx = 0
  async function worker() {
    while (idx < images.length) {
      const i = idx++
      const img = images[i]
      const d = deliveryById.get(img.delivery_id)
      const p = d ? projectById.get(d.project_id) : null
      const dir = join(
        outRoot,
        slug(p?.name || 'proyecto'),
        slug(d?.name || 'delivery'),
      )
      const fname = img.name || `${img.id}.jpg`
      const dest = join(dir, fname)
      try {
        const res = await fetch(img.url, { headers })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        await mkdir(dir, { recursive: true })
        await writeFile(dest, buf)
        ok++
        console.log(`  ✅ [${ok + fail}/${images.length}] ${dest}`)
      } catch (e) {
        fail++
        failures.push({ url: img.url, name: fname, error: String(e.message || e) })
        console.log(`  ❌ [${ok + fail}/${images.length}] ${fname} — ${e.message || e}`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  console.log(`\n✔️  Descargadas: ${ok}   ❌ Fallidas: ${fail}`)
  console.log(`📂 Carpeta: ${outRoot}`)
  if (failures.length) {
    const logPath = join(outRoot, '_fallidas.json')
    await writeFile(logPath, JSON.stringify(failures, null, 2))
    console.log(`📝 Detalle de fallos: ${logPath}`)
  }
}

main().catch((e) => {
  console.error('\n💥 Error:', e.message || e)
  process.exit(1)
})
