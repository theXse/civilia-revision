#!/usr/bin/env node
/**
 * subir-material.mjs — Sube material (rar/zip/carpeta) a la plataforma Civilia.
 *
 * Replica el flujo de app/import/page.tsx pero desde la terminal, y además
 * crea el proyecto si no existe (igual que createProject() en app/page.tsx).
 *
 * Uso:
 *   node scripts/subir-material.mjs <archivo.rar|.zip|carpeta> --region <Región> --proyecto <Nombre> [opciones]
 *
 * Opciones:
 *   --region <nombre>     Región destino (Osorno, Santiago, Valdivia, Concepción). Obligatoria.
 *   --proyecto <nombre>   Nombre del proyecto. Obligatorio (salvo que el material traiga estructura Región/Proyecto/...).
 *   --prefijo <texto>     Antepone el texto a cada carpeta (ej: --prefijo STORIES → "STORIES GENERAL").
 *   --reusar              Fuerza usar el proyecto existente más reciente con ese nombre
 *                         (aunque sea de un mes anterior). Por defecto CADA MES = PROYECTO NUEVO.
 *   --si                  Ejecuta de verdad. Sin este flag solo muestra el PLAN (dry-run).
 *   --scan-only           Solo analiza el material local, sin tocar la red (para debug).
 *   --duplicar            Sube imágenes aunque ya exista una con el mismo nombre en la carpeta.
 *
 * Flujo:
 *   1. Si es .rar/.zip lo descomprime a una carpeta temporal (unrar / 7zz / 7z / bsdtar / unzip).
 *   2. Detecta las carpetas de primer nivel → cada una es una "carpeta" (delivery) del proyecto.
 *   3. Muestra el plan. Con --si: crea proyecto si falta, crea carpetas, sube imágenes al
 *      bucket "images" y registra cada fila en la tabla images.
 *   4. Al final imprime el link de admin del proyecto (/a/{admin_token}).
 */

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

// ── Configuración ─────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const REGIONES_CONOCIDAS = ['Osorno', 'Santiago', 'Valdivia', 'Concepción']

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fail(msg) {
  console.error(`\n❌  ${msg}\n`)
  process.exit(1)
}

// Igual que en app/import/page.tsx: NFC + trim + colapsar espacios
const norm = (s) => s.normalize('NFC').trim().replace(/\s+/g, ' ')
const normKey = (s) => norm(s).toLowerCase()

// Nombre seguro para el path de storage (la URL pública no necesita encoding)
function sanitizeForStorage(name) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // sin tildes
    .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
}

function which(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'pipe' }); return true } catch { return false }
}

// ── Descompresión ─────────────────────────────────────────────────────────────

function extractArchive(archivePath) {
  const dest = mkdtempSync(path.join(tmpdir(), 'civilia-material-'))
  const ext = path.extname(archivePath).toLowerCase()
  console.log(`📦  Descomprimiendo ${path.basename(archivePath)} ...`)

  if (ext === '.rar') {
    if (which('unrar')) execFileSync('unrar', ['x', '-o+', '-idq', archivePath, dest + path.sep])
    else if (which('7zz')) execFileSync('7zz', ['x', `-o${dest}`, '-y', archivePath], { stdio: 'pipe' })
    else if (which('7z')) execFileSync('7z', ['x', `-o${dest}`, '-y', archivePath], { stdio: 'pipe' })
    else if (which('bsdtar')) execFileSync('bsdtar', ['-xf', archivePath, '-C', dest])
    else fail('No hay herramienta para .rar. Instala una:\n    Mac:   brew install sevenzip   (o: brew install carlocab/personal/unrar)\n    Linux: sudo apt-get install unrar')
  } else if (ext === '.zip') {
    if (which('unzip')) execFileSync('unzip', ['-q', '-o', archivePath, '-d', dest])
    else if (which('bsdtar')) execFileSync('bsdtar', ['-xf', archivePath, '-C', dest])
    else fail('No hay herramienta para .zip (instala unzip).')
  } else {
    fail(`Formato no soportado: ${ext} (usa .rar, .zip o una carpeta ya descomprimida).`)
  }
  return dest
}

/** Si le pasan una carpeta que contiene un .rar/.zip (ej: descarga de WeTransfer), lo encuentra. */
function resolveInput(inputPath) {
  if (!existsSync(inputPath)) fail(`No existe: ${inputPath}`)
  const st = statSync(inputPath)
  if (st.isFile()) return extractArchive(inputPath)
  // Es carpeta: ¿contiene archivos comprimidos?
  const archives = readdirSync(inputPath).filter(f => /\.(rar|zip)$/i.test(f))
  if (archives.length === 1) {
    console.log(`📁  La carpeta contiene: ${archives[0]}`)
    return extractArchive(path.join(inputPath, archives[0]))
  }
  if (archives.length > 1) {
    // Mezclar varios rar confunde las carpetas (cada rar trae su propia estructura).
    // Mejor procesar cada uno por separado, con --prefijo si corresponde.
    fail(`La carpeta contiene ${archives.length} archivos comprimidos:\n` +
      archives.map(a => `      · ${a}`).join('\n') +
      `\n\n    Corre el script UNA VEZ POR CADA ARCHIVO, por ejemplo:\n` +
      archives.map(a => `      node scripts/subir-material.mjs "${path.join(inputPath, a)}" --region ... --proyecto ...`).join('\n') +
      `\n\n    Tip: para un rar de stories puedes usar --prefijo "STORIES" y las carpetas\n` +
      `    quedan como "STORIES GENERAL", separadas de las de los carruseles.`)
  }
  return inputPath
}

// ── Escaneo de estructura ─────────────────────────────────────────────────────

function walkImages(dir, rel = '') {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue
    const full = path.join(dir, entry.name)
    const relPath = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walkImages(full, relPath))
    else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) out.push({ full, rel: relPath })
  }
  return out
}

/** Baja niveles mientras haya exactamente una carpeta "envoltorio" y ninguna imagen.
 *  No baja si la carpeta es una región conocida (sería estructura Región/Proyecto/Categoría). */
function descendWrappers(root) {
  let current = root
  for (let i = 0; i < 5; i++) {
    const entries = readdirSync(current, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && e.name !== '__MACOSX')
    const dirs = entries.filter(e => e.isDirectory())
    const isRegion = (name) => REGIONES_CONOCIDAS.some(r => normKey(r) === normKey(name))
    if (dirs.length === 1 && entries.length === 1 && !isRegion(dirs[0].name)) {
      current = path.join(current, dirs[0].name)
    } else break
  }
  return current
}

/**
 * Agrupa imágenes por carpeta de primer nivel (cada una será un delivery).
 * Si el material trae estructura Región/Proyecto/Categoría, la detecta y la aplana.
 * Imágenes sueltas en la raíz van a una carpeta con el nombre del material.
 */
function buildGroups(root, opts) {
  const images = walkImages(root)
  if (images.length === 0) fail(`No encontré imágenes en ${root}`)

  const groups = new Map() // categoría -> [{full, name}]
  const add = (cat, img) => {
    const key = norm(opts.prefijo ? `${opts.prefijo} ${cat}` : cat)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(img)
  }

  // ¿Primer nivel = una región conocida? → estructura Región/Proyecto/Categoría
  const firstLevels = new Set(images.map(i => i.rel.split('/')[0]))
  const regionLevel = [...firstLevels].every(f => REGIONES_CONOCIDAS.some(r => normKey(r) === normKey(f)))

  for (const img of images) {
    const parts = img.rel.split('/')
    const fileName = parts[parts.length - 1]
    let category
    if (regionLevel && parts.length >= 4) {
      // Región/Proyecto/Categoría/...(subcarpetas)/archivo
      if (!opts.region) opts.region = parts[0]
      if (!opts.proyecto) opts.proyecto = parts[1]
      category = parts[2]
    } else if (parts.length >= 2) {
      category = parts[0] // primer nivel = categoría (subcarpetas más profundas se aplanan)
    } else {
      category = opts.carpetaDefault
    }
    add(category, { full: img.full, name: fileName })
  }

  // Orden natural dentro de cada grupo (para que 01, 02, 10 queden bien)
  const collator = new Intl.Collator('es', { numeric: true })
  for (const files of groups.values()) files.sort((a, b) => collator.compare(a.name, b.name))
  return groups
}

// ── API Supabase (REST, sin dependencias) ─────────────────────────────────────

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
    async uploadImage(storagePath, buffer, contentType) {
      const res = await fetch(`${url}/storage/v1/object/images/${storagePath}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': contentType },
        body: buffer,
      })
      if (!res.ok) throw new Error(`upload ${storagePath} → ${res.status}: ${await res.text()}`)
      return `${url}/storage/v1/object/public/images/${storagePath}`
    },
  }
}

const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2)
  const opts = { si: false, scanOnly: false, duplicar: false, region: null, proyecto: null, prefijo: null }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--si') opts.si = true
    else if (a === '--scan-only') opts.scanOnly = true
    else if (a === '--duplicar') opts.duplicar = true
    else if (a === '--region') opts.region = argv[++i]
    else if (a === '--proyecto') opts.proyecto = argv[++i]
    else if (a === '--prefijo') opts.prefijo = norm(argv[++i] || '')
    else if (a === '--reusar') opts.reusar = true
    else positional.push(a)
  }
  if (positional.length !== 1) fail('Uso: node scripts/subir-material.mjs <archivo.rar|carpeta> --region <Región> --proyecto <Nombre> [--si]')

  const inputPath = positional[0].replace(/^~(?=\/)/, process.env.HOME || '~')
  opts.carpetaDefault = norm(path.basename(inputPath).replace(/\.(rar|zip)$/i, ''))

  // 1. Descomprimir / resolver carpeta
  let root = resolveInput(inputPath)
  root = descendWrappers(root)

  // 2. Escanear estructura
  const groups = buildGroups(root, opts)
  const totalImages = [...groups.values()].reduce((n, f) => n + f.length, 0)

  console.log(`\n🔍  Material encontrado en: ${root}`)
  console.log(`    ${totalImages} imágenes en ${groups.size} carpeta(s):\n`)
  for (const [cat, files] of groups) {
    console.log(`    📂 ${cat}  (${files.length} imágenes)`)
    for (const f of files.slice(0, 3)) console.log(`       · ${f.name}`)
    if (files.length > 3) console.log(`       · ... y ${files.length - 3} más`)
  }

  if (opts.scanOnly) { console.log('\n(scan-only: no se tocó la red)\n'); return }

  if (!opts.region) fail('Falta --region (ej: --region Concepción)')
  if (!opts.proyecto) fail('Falta --proyecto (ej: --proyecto Green)')

  // 3. Conectar y armar plan
  const api = makeApi(loadEnv())

  const regions = await api.get('regions?select=name')
  const regionDb = regions.find(r => normKey(r.name) === normKey(opts.region))
  if (!regionDb) fail(`Región "${opts.region}" no existe. Regiones: ${regions.map(r => r.name).join(', ')}`)
  const region = regionDb.name // valor canónico de la BD

  const projects = await api.get(`projects?select=id,name,region,admin_token,archived,created_at&region=eq.${encodeURIComponent(region)}&order=created_at.desc`)

  // REGLA: cada mes es un proyecto NUEVO. Solo se reutiliza un proyecto con el
  // mismo nombre si es de ESTE MES y no está archivado (ej: el segundo rar de
  // la misma entrega, o un reintento). Los de meses anteriores se dejan intactos.
  const sameName = projects.filter(p => normKey(p.name) === normKey(opts.proyecto))
  const thisMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
  let project = sameName.find(p => !p.archived && p.created_at?.slice(0, 7) === thisMonth) || null
  const oldOnes = sameName.filter(p => p !== project)
  if (!project && opts.reusar && sameName.length > 0) project = sameName[0] // forzado con --reusar

  const deliveries = project ? await api.get(`deliveries?select=id,name&project_id=eq.${project.id}`) : []
  const findDelivery = (cat) => deliveries.find(d => normKey(d.name) === normKey(cat))

  console.log(`\n═══ PLAN ═══════════════════════════════════════`)
  console.log(`  Región:   ${region}`)
  if (project) {
    console.log(`  Proyecto: ${project.name}  (YA EXISTE, creado ${project.created_at?.slice(0, 10)} — se agregan carpetas ahí)`)
  } else {
    console.log(`  Proyecto: ${opts.proyecto}  (SE CREARÁ NUEVO para este mes)`)
  }
  for (const old of oldOnes) {
    console.log(`  ℹ️  Existe un "${old.name}" anterior (${old.created_at?.slice(0, 10)}${old.archived ? ', archivado' : ''}) — NO se toca.`)
  }
  for (const [cat, files] of groups) {
    const existing = project ? findDelivery(cat) : null
    console.log(`    📂 ${cat} → ${existing ? 'carpeta existente' : 'carpeta NUEVA'} · ${files.length} imágenes`)
  }
  console.log(`════════════════════════════════════════════════`)

  if (!opts.si) {
    console.log(`\n👉  Esto fue un simulacro (dry-run). Para ejecutar de verdad, agrega --si\n`)
    return
  }

  // 4. Ejecutar
  console.log('')
  if (!project) {
    project = await api.insert('projects', { name: norm(opts.proyecto), region, admin_token: crypto.randomUUID() })
    console.log(`✨  Proyecto creado: ${project.name} (${region})`)
  }

  let uploaded = 0, skipped = 0, errors = 0
  for (const [cat, files] of groups) {
    let delivery = findDelivery(cat)
    if (!delivery) {
      delivery = await api.insert('deliveries', { project_id: project.id, name: cat })
      deliveries.push(delivery)
      console.log(`📂  Carpeta creada: ${cat}`)
    } else {
      console.log(`📁  Carpeta existente: ${cat}`)
    }

    // nombres ya subidos en esta carpeta (para no duplicar al reintentar)
    const existing = opts.duplicar ? [] : await api.get(`images?select=name&delivery_id=eq.${delivery.id}`)
    const existingNames = new Set(existing.map(i => normKey(i.name)))

    for (const f of files) {
      if (existingNames.has(normKey(f.name))) {
        console.log(`   ⏭️  ${f.name} (ya existe, omitida — usa --duplicar para forzar)`)
        skipped++
        continue
      }
      try {
        const ext = path.extname(f.name).toLowerCase()
        const storagePath = `${delivery.id}/${Date.now()}-${sanitizeForStorage(f.name)}`
        const url = await api.uploadImage(storagePath, readFileSync(f.full), CONTENT_TYPES[ext] || 'application/octet-stream')
        await api.insert('images', { delivery_id: delivery.id, url, name: f.name })
        console.log(`   📸 ${f.name}`)
        uploaded++
      } catch (e) {
        console.log(`   ❌ ${f.name}: ${e.message}`)
        errors++
      }
    }
  }

  console.log(`\n✅  Listo: ${uploaded} subidas · ${skipped} omitidas (duplicadas) · ${errors} errores`)
  console.log(`🔗  Link admin del proyecto:  /a/${project.admin_token}`)
  console.log(`    (ábrelo en tu dominio de la plataforma, ej: https://tu-dominio/a/${project.admin_token})\n`)
  if (errors > 0) process.exit(1)
}

main().catch(e => fail(e.message))
