#!/usr/bin/env node
/**
 * resumen-cambios.mjs — Documento resumen de todo lo que el cliente pidió cambiar.
 *
 * Recorre la plataforma Civilia (Supabase) y arma un Markdown organizado por
 * Región → Proyecto → Entrega → Lámina con cada comentario del cliente, la
 * respuesta del admin (si la hay) y si quedó resuelto.
 *
 * Uso:
 *   node scripts/resumen-cambios.mjs                      # mes actual
 *   node scripts/resumen-cambios.mjs --mes 2026-09
 *   node scripts/resumen-cambios.mjs --mes 2026-09 --region Osorno
 *   node scripts/resumen-cambios.mjs --mes 2026-09 --out resumen.md
 *   node scripts/resumen-cambios.mjs --todo                # sin filtro de mes
 *
 * Opciones:
 *   --mes <YYYY-MM>    Mes de campaña a resumir. Default: mes actual.
 *   --todo             Ignora el filtro de mes (todo el historial).
 *   --solo-archivados  Solo proyectos archivados (como el historial del dashboard).
 *   --region <nombre>  Filtra por región (Osorno, Santiago, Valdivia, Concepción).
 *   --proyecto <nom>   Filtra por proyecto (coincidencia parcial, sin acentos).
 *   --out <archivo>    Archivo de salida. Default: resumen-cambios-<mes>.md
 *   --stdout           Imprime en pantalla en vez de escribir archivo.
 *
 * Qué cuenta como "proyecto del mes":
 *   El mismo criterio que el "Historial de campañas" del dashboard
 *   (app/page.tsx): la campaña de un proyecto es el mes de archived_at, o de
 *   created_at si todavía no está archivado. Entran los proyectos archivados y
 *   los activos de ese mes; cada uno se marca como Archivado / Activo.
 *
 *   Dentro de esos proyectos se lista TODO: cada lámina con cambios pedidos y
 *   cada comentario, sin importar la fecha del comentario.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// ── Config / credenciales ─────────────────────────────────────────────────────

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
  if (!url || !key) {
    fail('No encontré NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (revisa .env.local en la raíz del repo).')
  }
  return { url: url.replace(/\/$/, ''), key }
}

function fail(msg) {
  console.error(`\n❌  ${msg}\n`)
  process.exit(1)
}

const REGIONES = ['Osorno', 'Santiago', 'Valdivia', 'Concepción']

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// ── Argumentos ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { mes: null, todo: false, region: null, proyecto: null, out: null, stdout: false, soloArchivados: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--todo') args.todo = true
    else if (a === '--solo-archivados') args.soloArchivados = true
    else if (a === '--stdout') args.stdout = true
    else if (a === '--mes') args.mes = argv[++i]
    else if (a === '--region') args.region = argv[++i]
    else if (a === '--proyecto') args.proyecto = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '-h' || a === '--help') { printHelp(); process.exit(0) }
    else fail(`Opción desconocida: ${a}`)
  }
  if (!args.todo && !args.mes) {
    const now = new Date()
    args.mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }
  if (args.mes && !/^\d{4}-\d{2}$/.test(args.mes)) fail(`--mes debe ser YYYY-MM (ej: 2026-09), recibí "${args.mes}"`)
  if (args.region) {
    const match = REGIONES.find(r => sinAcentos(r) === sinAcentos(args.region))
    if (!match) fail(`Región desconocida: ${args.region}. Opciones: ${REGIONES.join(', ')}`)
    args.region = match
  }
  return args
}

function printHelp() {
  console.log(readFileSync(new URL(import.meta.url)).toString().split('\n')
    .filter(l => l.startsWith(' *') || l.startsWith('/**')).map(l => l.replace(/^\s*\/?\*+ ?/, '')).join('\n'))
}

const sinAcentos = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

// ── Supabase (REST, sin dependencias) ─────────────────────────────────────────

async function fetchAll({ url, key }, table, select = '*') {
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const res = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + pageSize - 1}`,
        'Range-Unit': 'items',
      },
    })
    if (!res.ok) fail(`Error leyendo "${table}": ${res.status} ${await res.text()}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

// ── Formato ───────────────────────────────────────────────────────────────────

const fecha = (iso) => iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

function nombreMes(mes) {
  if (!mes) return 'todo el historial'
  const [y, m] = mes.split('-')
  return `${MESES[Number(m) - 1]} ${y}`
}

const ESTADO = {
  approved: '✓ Aprobada',
  changes_requested: '✏️ Cambios pedidos',
  revised: '↩️ Revisada (cambios aplicados)',
  pending: '⏳ Pendiente',
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const mes = args.todo ? null : args.mes
  const cfg = loadEnv()

  console.error(`Leyendo plataforma Civilia… (${nombreMes(mes)})`)
  const [projects, deliveries, images, comments, projectComments] = await Promise.all([
    fetchAll(cfg, 'projects'),
    fetchAll(cfg, 'deliveries'),
    fetchAll(cfg, 'images'),
    fetchAll(cfg, 'comments'),
    fetchAll(cfg, 'project_comments'),
  ])

  const byDelivery = new Map()
  for (const i of images) {
    if (!byDelivery.has(i.delivery_id)) byDelivery.set(i.delivery_id, [])
    byDelivery.get(i.delivery_id).push(i)
  }
  for (const arr of byDelivery.values()) arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const byImage = new Map()
  for (const c of comments) {
    if (!byImage.has(c.image_id)) byImage.set(c.image_id, [])
    byImage.get(c.image_id).push(c)
  }
  for (const arr of byImage.values()) arr.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))

  // El filtro de mes se aplica al PROYECTO (mes de campaña), igual que el
  // "Historial de campañas" del dashboard. Dentro de un proyecto del mes entra
  // toda lámina con cambios pedidos/revisada y toda lámina con comentarios.
  const mesCampania = (p) => (p.archived_at || p.created_at || '').slice(0, 7)

  const relevante = (img) => {
    const cs = byImage.get(img.id) || []
    const pidioCambios = img.status === 'changes_requested' || img.status === 'revised'
    if (cs.length > 0 || pidioCambios) return cs
    return null
  }

  const L = []
  const pendientes = []   // comentarios sin responder
  const sinObservaciones = []  // proyectos del mes sin ningún comentario ni cambio
  let totCambios = 0, totRevisadas = 0, totComentarios = 0, totProyectos = 0

  const cuerpo = []

  for (const region of REGIONES) {
    if (args.region && region !== args.region) continue

    const bloqueRegion = []
    let cambiosRegion = 0

    const projs = projects
      .filter(p => p.region === region)
      .filter(p => !mes || mesCampania(p) === mes)
      .filter(p => !args.soloArchivados || p.archived)
      .filter(p => !args.proyecto || sinAcentos(p.name).includes(sinAcentos(args.proyecto)))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))

    for (const project of projs) {
      const bloqueProyecto = []
      let cambiosProyecto = 0, comentariosProyecto = 0

      const dels = deliveries
        .filter(d => d.project_id === project.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

      for (const delivery of dels) {
        const imgs = byDelivery.get(delivery.id) || []
        const bloqueEntrega = []

        for (const img of imgs) {
          const cs = relevante(img)
          if (cs === null) continue
          if (img.status === 'approved' && cs.length === 0) continue

          if (img.status === 'changes_requested') { cambiosProyecto++; totCambios++ }
          if (img.status === 'revised') totRevisadas++

          bloqueEntrega.push(`- **${img.name || 'Lámina sin nombre'}** — ${ESTADO[img.status] || img.status}`)
          for (const c of cs) {
            comentariosProyecto++; totComentarios++
            bloqueEntrega.push(`  - 💬 *${c.author || 'Cliente'}* (${fecha(c.created_at)}): ${limpiar(c.content)}`)
            if (c.reply?.trim()) {
              bloqueEntrega.push(`    - ↳ **Respuesta:** ${limpiar(c.reply)}${c.replied_at ? ` _(${fecha(c.replied_at)})_` : ''}`)
            }
            if (c.resolved) bloqueEntrega.push(`    - ✅ Resuelto`)
            else if (!c.reply?.trim()) {
              pendientes.push({ region, proyecto: project.name, entrega: delivery.name, lamina: img.name, estado: ESTADO[img.status] || img.status, comentario: limpiar(c.content), fecha: fecha(c.created_at) })
            }
          }
          if (cs.length === 0) {
            bloqueEntrega.push(`  - _(marcada con cambios, sin comentario escrito)_`)
          }
        }

        if (bloqueEntrega.length > 0) {
          bloqueProyecto.push(``, `#### ${delivery.name}`, ...bloqueEntrega)
        }
      }

      // Comentarios generales del proyecto
      const pcs = projectComments
        .filter(c => c.project_id === project.id)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
      if (pcs.length > 0) {
        bloqueProyecto.push(``, `#### Comentarios generales del proyecto`)
        for (const c of pcs) {
          comentariosProyecto++; totComentarios++
          bloqueProyecto.push(`- 💬 *${c.author || 'Cliente'}* (${fecha(c.created_at)}): ${limpiar(c.content)}`)
        }
      }

      if (bloqueProyecto.length === 0) { sinObservaciones.push(`${region} · ${project.name}`); continue }
      totProyectos++
      cambiosRegion += cambiosProyecto

      const link = project.admin_token ? ` · [ver en la plataforma](/a/${project.admin_token})` : ''
      const estadoProy = project.archived ? `Archivado ${fecha(project.archived_at)}` : 'Activo'
      bloqueRegion.push(
        ``,
        `### ${project.name}`,
        `${estadoProy} · ${cambiosProyecto} lámina(s) con cambios pedidos · ${comentariosProyecto} comentario(s)${link}`,
        ...bloqueProyecto,
      )
    }

    if (bloqueRegion.length > 0) {
      cuerpo.push(``, `---`, ``, `## ${region} — ${cambiosRegion} lámina(s) con cambios`, ...bloqueRegion)
    }
  }

  // ── Encabezado y resumen ejecutivo ─────────────────────────────────────────
  L.push(`# Cambios pedidos por el cliente — campañas de ${nombreMes(mes)}`)
  L.push(``)
  L.push(`Plataforma Civilia · La Ruta · generado el ${fecha(new Date().toISOString())}`)
  if (args.region) L.push(`Filtro: región ${args.region}`)
  if (args.proyecto) L.push(`Filtro: proyecto "${args.proyecto}"`)
  L.push(``)
  L.push(`## Resumen`)
  L.push(``)
  L.push(`| | |`)
  L.push(`|---|---|`)
  L.push(`| Proyectos con observaciones | ${totProyectos} |`)
  L.push(`| Láminas con cambios pedidos | ${totCambios} |`)
  L.push(`| Láminas ya corregidas (revisadas) | ${totRevisadas} |`)
  L.push(`| Comentarios del cliente | ${totComentarios} |`)
  L.push(`| Comentarios sin responder | ${pendientes.length} |`)
  L.push(`| Proyectos del mes sin observaciones | ${sinObservaciones.length} |`)
  L.push(``)

  if (pendientes.length > 0) {
    L.push(`## ⚠️ Sin responder (${pendientes.length})`)
    L.push(``)
    for (const p of pendientes) {
      L.push(`- **${p.region} · ${p.proyecto}** — ${p.entrega} / ${p.lamina || 'lámina'} · ${p.estado} (${p.fecha}): ${p.comentario}`)
    }
    L.push(``)
  }

  if (cuerpo.length === 0) {
    L.push(`_No hay cambios ni comentarios registrados en ${nombreMes(mes)}._`)
  } else {
    L.push(`## Detalle por región`)
    L.push(...cuerpo)
  }

  if (sinObservaciones.length > 0) {
    L.push(``, `## Proyectos del mes sin observaciones (${sinObservaciones.length})`, ``)
    for (const n of sinObservaciones) L.push(`- ${n}`)
  }

  L.push(``, `---`, `_Generado desde la plataforma de revisión Civilia._`)

  const md = L.join('\n')
  if (args.stdout) {
    console.log(md)
  } else {
    const out = args.out || `resumen-cambios-${mes || 'historial'}.md`
    writeFileSync(out, md, 'utf8')
    console.error(`\n✅  ${out}`)
    console.error(`   ${totProyectos} proyecto(s) · ${totCambios} lámina(s) con cambios · ${totComentarios} comentario(s) · ${pendientes.length} sin responder\n`)
  }
}

const limpiar = (s) => (s || '').replace(/\s+/g, ' ').trim()

main().catch(e => fail(e.stack || e.message))
