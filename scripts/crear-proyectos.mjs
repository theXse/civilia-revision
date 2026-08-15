#!/usr/bin/env node
/**
 * crear-proyectos.mjs — Crea en lote los proyectos de la plataforma Civilia,
 * cada uno en su región.
 *
 * Hace lo mismo que el botón "+ Nuevo proyecto" del dashboard (app/page.tsx),
 * pero para muchos proyectos de una vez y a partir de una lista en JSON.
 *
 * Uso:
 *   node scripts/crear-proyectos.mjs proyectos.json          # PLAN (dry-run)
 *   node scripts/crear-proyectos.mjs proyectos.json --si     # ejecuta de verdad
 *
 * Formato del JSON — un objeto con una llave por región:
 *   {
 *     "Osorno":     ["Portal Baquedano", "Jardines de Bellavista"],
 *     "Valdivia":   ["Circunvalación Sur CS1"],
 *     "Concepción": ["Green"],
 *     "Santiago":   ["Jardín del Norte"],
 *     "Temuco":     ["..."]
 *   }
 *
 * Es idempotente: si un proyecto ya existe en esa región (comparando sin
 * tildes ni mayúsculas) lo omite, no lo duplica. Correrlo dos veces es seguro.
 *
 * Al final imprime el link admin (/a/{admin_token}) de cada proyecto creado.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fail(msg) {
  console.error(`\n❌  ${msg}\n`)
  process.exit(1)
}

// Igual que en app/import/page.tsx: NFC + trim + colapsar espacios
const norm = (s) => s.normalize('NFC').trim().replace(/\s+/g, ' ')
// Clave de comparación: sin tildes, sin mayúsculas
const normKey = (s) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local')
  const env = { ...process.env }
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) fail('No encontré NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (revisa .env.local en la raíz del repo).')
  return { url: url.replace(/\/$/, ''), key }
}

function makeApi({ url, key }) {
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  async function rest(method, pathAndQuery, body, extraHeaders = {}) {
    const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
      method, headers: { ...headers, ...extraHeaders },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`${method} ${pathAndQuery} → ${res.status}: ${text}`)
    return text ? JSON.parse(text) : null
  }
  return {
    get: (q) => rest('GET', q),
    insert: (table, row) => rest('POST', table, row, { Prefer: 'return=representation' }).then(r => r[0]),
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2)
  const si = argv.includes('--si')
  const file = argv.find(a => !a.startsWith('--'))

  if (!file) fail('Falta el JSON con los proyectos (ej: node scripts/crear-proyectos.mjs proyectos.json)')
  if (!existsSync(file)) fail(`No existe el archivo "${file}"`)

  let lista
  try {
    lista = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    fail(`El JSON no se pudo leer: ${e.message}`)
  }
  if (!lista || typeof lista !== 'object' || Array.isArray(lista)) {
    fail('El JSON debe ser un objeto { "Región": ["Proyecto", ...] }')
  }

  const api = makeApi(loadEnv())

  // Regiones canónicas de la BD (no inventamos nombres de región)
  const regionsDb = await api.get('regions?select=name')
  const resolveRegion = (nombre) => regionsDb.find(r => normKey(r.name) === normKey(nombre))?.name ?? null

  // Validar todas las regiones ANTES de escribir nada
  const desconocidas = Object.keys(lista).filter(r => !resolveRegion(r))
  if (desconocidas.length > 0) {
    fail(
      `Estas regiones no existen en la BD: ${desconocidas.map(r => `"${r}"`).join(', ')}\n` +
      `    Regiones disponibles: ${regionsDb.map(r => r.name).join(', ')}`
    )
  }

  // Armar el plan región por región
  const plan = []
  for (const [regionInput, nombres] of Object.entries(lista)) {
    if (!Array.isArray(nombres)) fail(`El valor de "${regionInput}" debe ser una lista de nombres de proyecto`)
    const region = resolveRegion(regionInput)
    const existentes = await api.get(`projects?select=id,name,archived&region=eq.${encodeURIComponent(region)}`)

    for (const nombreRaw of nombres) {
      const nombre = norm(String(nombreRaw))
      if (!nombre) continue
      const yaExiste = existentes.find(p => normKey(p.name) === normKey(nombre))
      // Nombre parecido pero no idéntico → aviso, para no duplicar por un typo
      const parecido = yaExiste ? null : existentes.find(p =>
        normKey(p.name).includes(normKey(nombre)) || normKey(nombre).includes(normKey(p.name))
      )
      plan.push({ region, nombre, yaExiste, parecido })
    }
  }

  // Mostrar el plan
  const porCrear = plan.filter(p => !p.yaExiste)
  const omitidos = plan.filter(p => p.yaExiste)

  console.log(`\n═══ PLAN ═══════════════════════════════════════`)
  for (const region of [...new Set(plan.map(p => p.region))]) {
    console.log(`\n  ${region}`)
    for (const p of plan.filter(x => x.region === region)) {
      if (p.yaExiste) {
        console.log(`    · ${p.nombre}  (ya existe${p.yaExiste.archived ? ' — archivado' : ''}, se omite)`)
      } else {
        console.log(`    + ${p.nombre}  (SE CREARÁ)`)
        if (p.parecido) {
          console.log(`      ⚠️  Ojo: ya hay "${p.parecido.name}" en ${region}. Si es el mismo, corrige el nombre en el JSON.`)
        }
      }
    }
  }
  console.log(`\n  Total: ${porCrear.length} por crear · ${omitidos.length} ya existentes`)
  console.log(`════════════════════════════════════════════════`)

  if (!si) {
    console.log(`\n(dry-run: no se escribió nada. Agrega --si para ejecutar.)\n`)
    return
  }
  if (porCrear.length === 0) {
    console.log(`\n✅  No hay nada que crear.\n`)
    return
  }

  // Ejecutar
  console.log('')
  const creados = []
  let errores = 0
  for (const p of porCrear) {
    try {
      const proyecto = await api.insert('projects', {
        name: p.nombre,
        region: p.region,
        admin_token: crypto.randomUUID(),
      })
      creados.push(proyecto)
      console.log(`✨  ${p.region} → ${proyecto.name}`)
    } catch (e) {
      errores++
      console.error(`❌  ${p.region} → ${p.nombre}: ${e.message}`)
    }
  }

  console.log(`\n✅  Listo: ${creados.length} creados · ${omitidos.length} omitidos · ${errores} errores\n`)
  console.log(`Links admin:`)
  for (const p of creados) console.log(`  ${p.region} · ${p.name}  →  /a/${p.admin_token}`)
  console.log('')
  if (errores > 0) process.exit(1)
}

main().catch(e => fail(e.message))
