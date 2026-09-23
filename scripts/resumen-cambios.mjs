#!/usr/bin/env node
/**
 * resumen-cambios.mjs — Documento resumen de lo que el cliente pidió cambiar.
 *
 * Recorre la plataforma Civilia (Supabase) y arma un Markdown organizado por
 * Mes de campaña → Región → Proyecto → Entrega → Lámina, con cada comentario
 * del cliente, la respuesta del admin y si quedó resuelto.
 *
 * Uso:
 *   node scripts/resumen-cambios.mjs                       # mes actual
 *   node scripts/resumen-cambios.mjs --ultimos 3           # sept + agosto + julio
 *   node scripts/resumen-cambios.mjs --mes 2026-09 --ultimos 4
 *   node scripts/resumen-cambios.mjs --mes 2026-09 --region Osorno
 *   node scripts/resumen-cambios.mjs --ultimos 3 --out resumen.md
 *   node scripts/resumen-cambios.mjs --todo                # todo el historial
 *
 * Opciones:
 *   --mes <YYYY-MM>    Mes de campaña más reciente a incluir. Default: mes actual.
 *   --ultimos <N>      Incluye N meses hacia atrás desde --mes. Default: 1.
 *   --todo             Ignora el filtro de mes (todo el historial).
 *   --solo-archivados  Solo proyectos archivados (como el historial del dashboard).
 *   --region <nombre>  Filtra por región (Osorno, Santiago, Valdivia, Concepción).
 *   --proyecto <nom>   Filtra por proyecto (coincidencia parcial, sin acentos).
 *   --out <archivo>    Archivo de salida. Default: resumen-cambios-<rango>.md
 *   --stdout           Imprime en pantalla en vez de escribir archivo.
 *
 * Qué cuenta como "proyecto del mes":
 *   El mismo criterio que el "Historial de campañas" del dashboard
 *   (app/page.tsx): la campaña de un proyecto es el mes de archived_at, o de
 *   created_at si todavía no está archivado. Entran los proyectos archivados y
 *   los activos; cada uno se marca como Archivado / Activo.
 *
 *   Dentro de esos proyectos se lista TODO: cada lámina con cambios pedidos y
 *   cada comentario, sin importar la fecha del comentario.
 *
 * Ficha vigente:
 *   El documento abre con la última vez que el cliente dijo cada dato que
 *   cambia entre campañas (dirección de sala de ventas, pie, precio, stock,
 *   FOGAES, estado de entrega, legales), por proyecto. Eso manda sobre lo que
 *   quedó en la lámina del mes anterior. Esa sección mira todo el historial,
 *   no solo los meses del filtro.
 *
 * Recurrente vs puntual (con --ultimos N):
 *   El documento separa los temas que aparecen en 2 o más meses — error de
 *   criterio nuestro, hay que corregirlo de raíz — de los que aparecen en un
 *   solo mes: esos suelen ser datos que cambian campaña a campaña (cuotas,
 *   pie, precios, fechas) y hay que verificarlos contra el brief de CADA mes,
 *   nunca copiarlos del mes anterior.
 *
 *   La clasificación es por palabras clave: es una ayuda para leer, no un
 *   veredicto. El detalle completo y textual está más abajo en el documento.
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

/**
 * Temas para clasificar comentarios. `volatil: true` marca los que por
 * naturaleza cambian cada campaña — si uno de esos se repite mes a mes, no es
 * "ya lo sabemos", es que hay que ir a buscar el dato nuevo cada vez.
 */
/**
 * Temas calibrados sobre los 199 comentarios reales de marzo–septiembre 2026.
 * `volatil: true` marca los datos que cambian cada campaña: para esos vale
 * siempre la última vez que el cliente lo dijo, nunca lo que quedó en la
 * lámina del mes anterior.
 *
 * `strip` quita "sala de venta(s)" antes de buscar espacios comunes, para que
 * "sala de ventas" no se cuente como espacio común del proyecto.
 */
const TEMAS = [
  { tag: 'espacios',   label: 'Espacios comunes mal nombrados', volatil: false, strip: true,
    re: /(salon|salones|multiuso|multiple|múltiple|quincho|cowork|gimnasio|\bgym\b|piscina|padel|pádel|sala gamer|sala de juegos|pet ?(spa|zone)|hall de acceso)/ },
  { tag: 'imagen',     label: 'Foto o render equivocado',       volatil: false,
    re: /(\bfoto|\brender|montaje|pixel|generada por ia|\bbruma\b|fotografia|fotografía)/ },
  { tag: 'logo',       label: 'Logo o marca ausente',           volatil: false,
    re: /(\blogo|civilia|\bmarca\b|isotipo|imagotipo)/ },
  { tag: 'direccion',  label: 'Dirección / sala de ventas',     volatil: true,
    re: /(sala de vent|salas de vent|direccion|dirección)/ },
  { tag: 'entrega',    label: 'Estado de entrega',              volatil: true,
    re: /(entrega inmediata|entrega futura|pronto piloto|preventa|obra en curso|entrega)/ },
  { tag: 'precio',     label: 'Precio o UF desactualizado',     volatil: true,
    re: /(\buf ?\d|\d ?uf\b|\bprecio|valor desde|desde de|liquidacion|liquidación|descuento)/ },
  { tag: 'pie',        label: 'Pie / cuotas',                   volatil: true,
    re: /(\bpie\b|cuotas?\b|dividendo|sin interes|sin interés)/ },
  { tag: 'stock',      label: 'Stock / unidades',               volatil: true,
    re: /(unidades|quedan \d|ultima unidad|última unidad|ultimas \d|últimas \d|\bstock\b)/ },
  { tag: 'subsidio',   label: 'Subsidio a la tasa / FOGAES',    volatil: true,
    re: /(fogaes|foages|subsidio a la ta|rebaja a la tasa)/ },
  { tag: 'legal',      label: 'Legal / letra chica',            volatil: true,
    re: /(\blegal\b|letra chica|global complementario|140 m|90 m2|12 meses|referencial)/ },
  { tag: 'ortografia', label: 'Ortografía y mayúsculas',        volatil: false,
    re: /(mayuscula|mayúscula|ortograf|cursiva|signos de exclam|tilde|mal escrit)/ },
  { tag: 'contraste',  label: 'Contraste / no se lee',          volatil: false,
    re: /(contraste|no se lee|no se leen|ilegible|letras blanc|fondo blanc)/ },
  { tag: 'layout',     label: 'Diagramación / orden',           volatil: false,
    re: /(orden|mover|centrar|alinea|margen|encim|tapa|corrid|diagrama|composicion|composición)/ },
  { tag: 'copy',       label: 'Textos / mensaje',               volatil: false,
    re: /(\btexto|copy|titular|bajada|mensaje|frase|claim|slogan|eslogan)/ },
]

// ── Argumentos ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { mes: null, ultimos: 1, todo: false, region: null, proyecto: null, out: null, stdout: false, soloArchivados: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--todo') args.todo = true
    else if (a === '--solo-archivados') args.soloArchivados = true
    else if (a === '--stdout') args.stdout = true
    else if (a === '--mes') args.mes = argv[++i]
    else if (a === '--ultimos') args.ultimos = Number(argv[++i])
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
  if (!Number.isInteger(args.ultimos) || args.ultimos < 1) fail('--ultimos debe ser un entero >= 1')
  if (args.region) {
    const match = REGIONES.find(r => sinAcentos(r) === sinAcentos(args.region))
    if (!match) fail(`Región desconocida: ${args.region}. Opciones: ${REGIONES.join(', ')}`)
    args.region = match
  }
  return args
}

function printHelp() {
  console.log(readFileSync(new URL(import.meta.url)).toString().split('\n')
    .filter(l => l.trimStart().startsWith('*') || l.startsWith('/**'))
    .map(l => l.replace(/^\s*\/?\*+ ?/, '')).join('\n'))
}

/**
 * Clave de proyecto: la plataforma tiene el mismo proyecto duplicado con
 * distinto nombre (JDB3 / Jardines de Bellavista 3, CS2 / Circunvalación Sur II).
 * Sin esto la ficha vigente parte el historial de un proyecto en dos.
 */
const ALIAS_PROYECTO = {
  'jdb3': 'jardines de bellavista 3', 'jb3': 'jardines de bellavista 3',
  'jdn': 'jardin del norte',
  'cs1': 'circunvalacion sur 1', 'circunvalacion sur i': 'circunvalacion sur 1',
  'circunvalacion sur etapa 1': 'circunvalacion sur 1',
  'cs2': 'circunvalacion sur 2', 'circunvalacion sur ii': 'circunvalacion sur 2',
  'cs3': 'circunvalacion sur 3', 'circunvalacion sur iii': 'circunvalacion sur 3',
  'los jesuitas': 'fundo los jesuitas',
  'vive janequeo - campana extra': 'vive janequeo',
}
const claveProyecto = (nombre) => {
  const n = sinAcentos(nombre)
  return ALIAS_PROYECTO[n] || n
}

const sinAcentos = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** Lista de meses YYYY-MM terminando en `hasta`, N meses hacia atrás. */
function rangoMeses(hasta, n) {
  if (!hasta) return null
  const [y, m] = hasta.split('-').map(Number)
  const out = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out   // más reciente primero
}

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
const limpiar = (s) => (s || '').replace(/\s+/g, ' ').trim()

function nombreMes(mes) {
  if (!mes) return 'todo el historial'
  const [y, m] = mes.split('-')
  return `${MESES[Number(m) - 1]} ${y}`
}

function nombreRango(meses) {
  if (!meses) return 'todo el historial'
  if (meses.length === 1) return nombreMes(meses[0])
  const viejo = meses[meses.length - 1], nuevo = meses[0]
  return `${nombreMes(viejo)} → ${nombreMes(nuevo)}`
}

const ESTADO = {
  approved: '✓ Aprobada',
  changes_requested: '✏️ Cambios pedidos',
  revised: '↩️ Revisada (cambios aplicados)',
  pending: '⏳ Pendiente',
}

function temasDe(texto) {
  const t = sinAcentos(texto)
  const sinVenta = t.replace(/salas? de vent\w*/g, '')
  const tags = TEMAS.filter(x => x.re.test(x.strip ? sinVenta : t)).map(x => x.tag)
  return tags.length > 0 ? tags : ['otros']
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const meses = args.todo ? null : rangoMeses(args.mes, args.ultimos)
  const cfg = loadEnv()

  console.error(`Leyendo plataforma Civilia… (${nombreRango(meses)})`)
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

  // Mes de campaña del proyecto: mismo criterio que el historial del dashboard.
  const mesCampania = (p) => (p.archived_at || p.created_at || '').slice(0, 7)

  // Una lámina entra si tiene comentarios o si el cliente pidió cambios.
  const relevante = (img) => {
    const cs = byImage.get(img.id) || []
    if (cs.length > 0 || img.status === 'changes_requested' || img.status === 'revised') return cs
    return null
  }

  const pendientes = []        // comentarios sin responder
  const sinObservaciones = []  // proyectos del rango sin comentarios ni cambios
  const temaIndex = new Map()  // tag -> { meses:Set, ejemplos:[] , total }
  let totCambios = 0, totRevisadas = 0, totComentarios = 0, totProyectos = 0

  const registrarTema = (texto, mes, donde) => {
    for (const tag of temasDe(texto)) {
      if (!temaIndex.has(tag)) temaIndex.set(tag, { meses: new Set(), ejemplos: [], total: 0 })
      const e = temaIndex.get(tag)
      e.meses.add(mes)
      e.total++
      if (e.ejemplos.length < 4) e.ejemplos.push({ texto: limpiar(texto), mes, donde })
    }
  }

  // Proyectos agrupados por mes de campaña (más reciente primero)
  const mesesPresentes = meses
    ? meses.filter(m => projects.some(p => mesCampania(p) === m))
    : [...new Set(projects.map(mesCampania).filter(Boolean))].sort().reverse()

  const cuerpo = []

  for (const mesActual of mesesPresentes) {
    const bloqueMes = []

    for (const region of REGIONES) {
      if (args.region && region !== args.region) continue

      const bloqueRegion = []
      let cambiosRegion = 0

      const projs = projects
        .filter(p => p.region === region)
        .filter(p => mesCampania(p) === mesActual)
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
          const bloqueEntrega = []

          for (const img of byDelivery.get(delivery.id) || []) {
            const cs = relevante(img)
            if (cs === null) continue
            if (img.status === 'approved' && cs.length === 0) continue

            if (img.status === 'changes_requested') { cambiosProyecto++; totCambios++ }
            if (img.status === 'revised') totRevisadas++

            bloqueEntrega.push(`- **${img.name || 'Lámina sin nombre'}** — ${ESTADO[img.status] || img.status}`)
            for (const c of cs) {
              comentariosProyecto++; totComentarios++
              registrarTema(c.content, mesActual, `${region} · ${project.name}`)
              bloqueEntrega.push(`  - 💬 *${c.author || 'Cliente'}* (${fecha(c.created_at)}): ${limpiar(c.content)}`)
              if (c.reply?.trim()) {
                bloqueEntrega.push(`    - ↳ **Respuesta:** ${limpiar(c.reply)}${c.replied_at ? ` _(${fecha(c.replied_at)})_` : ''}`)
              }
              if (c.resolved) bloqueEntrega.push(`    - ✅ Resuelto`)
              else if (!c.reply?.trim()) {
                pendientes.push({
                  region, proyecto: project.name, entrega: delivery.name, lamina: img.name,
                  estado: ESTADO[img.status] || img.status, comentario: limpiar(c.content), fecha: fecha(c.created_at),
                })
              }
            }
            if (cs.length === 0) bloqueEntrega.push(`  - _(marcada con cambios, sin comentario escrito)_`)
          }

          if (bloqueEntrega.length > 0) bloqueProyecto.push(``, `##### ${delivery.name}`, ...bloqueEntrega)
        }

        const pcs = projectComments
          .filter(c => c.project_id === project.id)
          .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
        if (pcs.length > 0) {
          bloqueProyecto.push(``, `##### Comentarios generales del proyecto`)
          for (const c of pcs) {
            comentariosProyecto++; totComentarios++
            registrarTema(c.content, mesActual, `${region} · ${project.name}`)
            bloqueProyecto.push(`- 💬 *${c.author || 'Cliente'}* (${fecha(c.created_at)}): ${limpiar(c.content)}`)
          }
        }

        if (bloqueProyecto.length === 0) { sinObservaciones.push(`${nombreMes(mesActual)} · ${region} · ${project.name}`); continue }
        totProyectos++
        cambiosRegion += cambiosProyecto

        const link = project.admin_token ? ` · [ver en la plataforma](/a/${project.admin_token})` : ''
        const estadoProy = project.archived ? `Archivado ${fecha(project.archived_at)}` : 'Activo'
        bloqueRegion.push(
          ``,
          `#### ${project.name}`,
          `${estadoProy} · ${cambiosProyecto} lámina(s) con cambios pedidos · ${comentariosProyecto} comentario(s)${link}`,
          ...bloqueProyecto,
        )
      }

      if (bloqueRegion.length > 0) {
        bloqueMes.push(``, `### ${region} — ${cambiosRegion} lámina(s) con cambios`, ...bloqueRegion)
      }
    }

    if (bloqueMes.length > 0) {
      cuerpo.push(``, `---`, ``, `## ${nombreMes(mesActual).toUpperCase()}`, ...bloqueMes)
    }
  }

  // ── Temas: recurrentes vs puntuales ────────────────────────────────────────
  const temaLabel = (tag) => TEMAS.find(t => t.tag === tag)?.label || 'Otros'
  const esVolatil = (tag) => TEMAS.find(t => t.tag === tag)?.volatil === true

  const temasOrdenados = [...temaIndex.entries()]
    .sort((a, b) => b[1].meses.size - a[1].meses.size || b[1].total - a[1].total)
  const recurrentes = temasOrdenados.filter(([, e]) => e.meses.size >= 2)
  const puntuales = temasOrdenados.filter(([, e]) => e.meses.size === 1)

  // ── Documento ──────────────────────────────────────────────────────────────
  const L = []
  L.push(`# Cambios pedidos por el cliente — campañas ${nombreRango(meses)}`)
  L.push(``)
  L.push(`Plataforma Civilia · La Ruta · generado el ${fecha(new Date().toISOString())}`)
  if (args.region) L.push(`Filtro: región ${args.region}`)
  if (args.proyecto) L.push(`Filtro: proyecto "${args.proyecto}"`)
  L.push(``)
  // ── Ficha vigente: la última vez que el cliente dijo cada dato volátil ────
  // Mira TODO el historial, no solo los meses filtrados: lo más nuevo puede
  // venir de una campaña anterior y sigue siendo lo vigente.
  const proyectoDeImagen = new Map()
  for (const d of deliveries) {
    const proj = projects.find(p => p.id === d.project_id)
    if (!proj) continue
    for (const img of byDelivery.get(d.id) || []) proyectoDeImagen.set(img.id, proj)
  }
  const vigente = new Map()   // `${clave}|${tag}` -> { proj, tag, c }
  const anotarVigente = (proj, texto, created_at, autor) => {
    if (!proj) return
    for (const tag of temasDe(texto)) {
      const tema = TEMAS.find(t => t.tag === tag)
      if (!tema?.volatil) continue
      const k = `${proj.region}|${claveProyecto(proj.name)}|${tag}`
      const prev = vigente.get(k)
      if (!prev || (created_at || '') > (prev.created_at || '')) {
        vigente.set(k, { proj, tag, texto: limpiar(texto), created_at, autor })
      }
    }
  }
  for (const c of comments) anotarVigente(proyectoDeImagen.get(c.image_id), c.content, c.created_at, c.author)
  for (const c of projectComments) anotarVigente(projects.find(p => p.id === c.project_id), c.content, c.created_at, c.author)

  const fichaPorProyecto = new Map()
  for (const v of vigente.values()) {
    const k = `${v.proj.region}|${claveProyecto(v.proj.name)}`
    if (!fichaPorProyecto.has(k)) fichaPorProyecto.set(k, { proj: v.proj, datos: [] })
    fichaPorProyecto.get(k).datos.push(v)
  }

  L.push(`## Resumen`)
  L.push(``)
  L.push(`| | |`)
  L.push(`|---|---|`)
  L.push(`| Meses de campaña incluidos | ${mesesPresentes.map(nombreMes).join(', ') || '—'} |`)
  L.push(`| Proyectos con observaciones | ${totProyectos} |`)
  L.push(`| Láminas con cambios pedidos | ${totCambios} |`)
  L.push(`| Láminas ya corregidas (revisadas) | ${totRevisadas} |`)
  L.push(`| Comentarios del cliente | ${totComentarios} |`)
  L.push(`| Comentarios sin responder | ${pendientes.length} |`)
  L.push(`| Proyectos sin observaciones | ${sinObservaciones.length} |`)
  L.push(``)

  if (fichaPorProyecto.size > 0) {
    L.push(`## Ficha vigente — lo último que dijo el cliente`)
    L.push(``)
    L.push(`> Para cada dato que cambia entre campañas, la **última vez** que el cliente lo dijo.`)
    L.push(`> Esto manda sobre lo que quedó en la lámina del mes anterior. Revisa todo el historial,`)
    L.push(`> no solo los meses del filtro.`)
    L.push(``)
    const orden = [...fichaPorProyecto.values()].sort((a, b) =>
      a.proj.region.localeCompare(b.proj.region, 'es') || a.proj.name.localeCompare(b.proj.name, 'es'))
    for (const { proj, datos } of orden) {
      L.push(`### ${proj.name} — ${proj.region}`)
      datos.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      for (const d of datos) {
        const label = TEMAS.find(t => t.tag === d.tag)?.label || d.tag
        L.push(`- **${label}** _(${fecha(d.created_at)})_: ${d.texto}`)
      }
      L.push(``)
    }
  }

  if (mesesPresentes.length > 1 && temaIndex.size > 0) {
    L.push(`## Qué corregir de raíz y qué revisar cada mes`)
    L.push(``)
    L.push(`> Clasificación automática por palabras clave sobre ${totComentarios} comentario(s).`)
    L.push(`> Un comentario puede caer en más de un tema, así que puede aparecer repetido acá.`)
    L.push(`> Es una guía de lectura, no un veredicto — el detalle textual está más abajo.`)
    L.push(``)

    L.push(`### 🔁 Se repite en varios meses — corregir de raíz (${recurrentes.length})`)
    L.push(``)
    if (recurrentes.length === 0) {
      L.push(`_Ningún tema se repitió en dos o más meses._`)
    } else {
      for (const [tag, e] of recurrentes) {
        const aviso = esVolatil(tag) ? ' ⚠️ **dato que cambia cada campaña: no lo copies del mes anterior, pídelo en el brief**' : ''
        L.push(`- **${temaLabel(tag)}** — ${e.total} comentario(s) en ${e.meses.size} meses (${[...e.meses].sort().reverse().map(nombreMes).join(', ')})${aviso}`)
        for (const ej of e.ejemplos) L.push(`  - _"${ej.texto}"_ — ${ej.donde}, ${nombreMes(ej.mes)}`)
      }
    }
    L.push(``)

    L.push(`### 📌 Apareció en un solo mes (${puntuales.length})`)
    L.push(``)
    if (puntuales.length === 0) {
      L.push(`_Nada exclusivo de un solo mes._`)
    } else {
      for (const [tag, e] of puntuales) {
        const aviso = esVolatil(tag) ? ' ⚠️ **específico de esa campaña**' : ''
        L.push(`- **${temaLabel(tag)}** — ${e.total} comentario(s) en ${nombreMes([...e.meses][0])}${aviso}`)
        for (const ej of e.ejemplos) L.push(`  - _"${ej.texto}"_ — ${ej.donde}`)
      }
    }
    L.push(``)
  }

  if (pendientes.length > 0) {
    L.push(`## ⚠️ Sin responder (${pendientes.length})`)
    L.push(``)
    for (const p of pendientes) {
      L.push(`- **${p.region} · ${p.proyecto}** — ${p.entrega} / ${p.lamina || 'lámina'} · ${p.estado} (${p.fecha}): ${p.comentario}`)
    }
    L.push(``)
  }

  if (cuerpo.length === 0) {
    L.push(`_No hay cambios ni comentarios registrados en ${nombreRango(meses)}._`)
  } else {
    L.push(`## Detalle por mes`)
    L.push(...cuerpo)
  }

  if (sinObservaciones.length > 0) {
    L.push(``, `---`, ``, `## Proyectos sin observaciones (${sinObservaciones.length})`, ``)
    for (const n of sinObservaciones) L.push(`- ${n}`)
  }

  L.push(``, `---`, `_Generado desde la plataforma de revisión Civilia._`)

  const md = L.join('\n')
  if (args.stdout) {
    console.log(md)
  } else {
    const slug = meses ? (meses.length === 1 ? meses[0] : `${meses[meses.length - 1]}_a_${meses[0]}`) : 'historial'
    const out = args.out || `resumen-cambios-${slug}.md`
    writeFileSync(out, md, 'utf8')
    console.error(`\n✅  ${out}`)
    console.error(`   ${totProyectos} proyecto(s) · ${totCambios} lámina(s) con cambios · ${totComentarios} comentario(s) · ${pendientes.length} sin responder\n`)
  }
}

main().catch(e => fail(e.stack || e.message))
