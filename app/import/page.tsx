'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Project, Delivery } from '@/lib/supabase'
import Image from 'next/image'

interface ParsedFile {
  region: string
  project: string
  category: string
  file: File
}

interface PreviewItem {
  region: string
  project: string
  category: string
  files: ParsedFile[]
  projectExists: boolean
  categoryExists: boolean
  projectId?: string
  deliveryId?: string
}

type Status = 'idle' | 'parsing' | 'previewing' | 'importing' | 'done'

export default function ImportPage() {
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [preview, setPreview] = useState<PreviewItem[]>([])
  const [totalFiles, setTotalFiles] = useState(0)
  const [progress, setProgress] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // webkitdirectory no se puede pasar como prop en React — hay que setearlo en el DOM directamente
  useEffect(() => {
    inputRef.current?.setAttribute('webkitdirectory', '')
  }, [])

  // ── Parsing helpers ────────────────────────────────────────────────────────

  function parsePaths(rawFiles: Array<{ file: File; path: string }>): ParsedFile[] {
    const result: ParsedFile[] = []
    for (const { file, path } of rawFiles) {
      if (!file.type.startsWith('image/')) continue
      // Normalizar: quitar barras al inicio/fin, separar por /
      const parts = path.replace(/^\/+/, '').split('/').filter(Boolean)
      // Esperamos mínimo 4 partes: root/Region/Proyecto/Categoría/archivo.jpg
      // o exactamente 3 sin root: Region/Proyecto/Categoría/archivo.jpg
      // El último segmento siempre es el archivo
      if (parts.length < 4) continue // necesitamos al menos root+region+project+category+file
      // Ignorar el primer segmento (carpeta raíz) y el último (archivo)
      // parts: [root, region, project, category, ...subcarpetas, file]
      const [, region, project, category] = parts
      if (region && project && category) result.push({ region, project, category, file })
    }
    return result
  }

  async function traverseEntry(
    entry: FileSystemEntry,
    currentPath: string
  ): Promise<Array<{ file: File; path: string }>> {
    const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name
    if (entry.isFile) {
      const file = await new Promise<File>((ok, err) =>
        (entry as FileSystemFileEntry).file(ok, err)
      )
      return [{ file, path: fullPath }]
    }
    const dir = entry as FileSystemDirectoryEntry
    const reader = dir.createReader()
    const allFiles: Array<{ file: File; path: string }> = []
    const readBatch = (): Promise<FileSystemEntry[]> =>
      new Promise((ok, err) => reader.readEntries(ok, err))
    let batch: FileSystemEntry[]
    do {
      batch = await readBatch()
      for (const child of batch) {
        const sub = await traverseEntry(child, fullPath)
        allFiles.push(...sub)
      }
    } while (batch.length > 0)
    return allFiles
  }

  // ── Build preview ──────────────────────────────────────────────────────────

  async function buildPreview(parsed: ParsedFile[]) {
    setTotalFiles(parsed.length)
    if (parsed.length === 0) { setStatus('idle'); return }

    const { data: projects } = await supabase.from('projects').select('id, name, region')
    const { data: deliveries } = await supabase.from('deliveries').select('id, name, project_id')

    // Normalizar NFC para comparar (macOS usa NFD en nombres de carpeta)
    const nfc = (s: string) => s.normalize('NFC').trim()

    // Group by region+project+category
    const groups = new Map<string, ParsedFile[]>()
    for (const f of parsed) {
      const key = `${nfc(f.region)}|||${nfc(f.project)}|||${nfc(f.category)}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(f)
    }

    const items: PreviewItem[] = []
    for (const [key, files] of groups) {
      const [region, project, category] = key.split('|||')
      const proj = (projects as Project[])?.find(p => nfc(p.name) === nfc(project) && nfc(p.region) === nfc(region))
      const deliv = proj
        ? (deliveries as Delivery[])?.find(d => nfc(d.name) === nfc(category) && d.project_id === proj.id)
        : undefined
      items.push({
        region, project, category, files,
        projectExists: !!proj,
        categoryExists: !!deliv,
        projectId: proj?.id,
        deliveryId: deliv?.id,
      })
    }

    // Sort: errors first, then new categories, then existing
    items.sort((a, b) => {
      const score = (i: PreviewItem) => !i.projectExists ? 0 : !i.categoryExists ? 1 : 2
      return score(a) - score(b)
    })

    setPreview(items)
    setStatus('previewing')
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    setStatus('parsing')
    const raw: Array<{ file: File; path: string }> = []
    for (const item of Array.from(e.dataTransfer.items)) {
      const entry = item.webkitGetAsEntry()
      if (entry) {
        const sub = await traverseEntry(entry, '')
        raw.push(...sub)
      }
    }
    await buildPreview(parsePaths(raw))
  }

  async function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return
    setStatus('parsing')
    const raw = Array.from(e.target.files).map(f => ({ file: f, path: f.webkitRelativePath }))
    await buildPreview(parsePaths(raw))
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  function addLog(msg: string) {
    setLog(prev => {
      const next = [...prev, msg]
      setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50)
      return next
    })
  }

  async function runImport() {
    setStatus('importing')
    setLog([])
    let done = 0

    for (const item of preview) {
      if (!item.projectExists) {
        addLog(`⚠️  Proyecto "${item.project}" (${item.region}) no existe — omitido`)
        done += item.files.length
        setProgress(done)
        continue
      }

      let deliveryId = item.deliveryId
      if (!deliveryId) {
        const { data, error } = await supabase
          .from('deliveries')
          .insert({ project_id: item.projectId, name: item.category })
          .select()
          .single()
        if (error || !data) {
          addLog(`❌  No se pudo crear categoría "${item.category}"`)
          done += item.files.length
          setProgress(done)
          continue
        }
        deliveryId = data.id
        addLog(`📂  Categoría creada: ${item.region} › ${item.project} › ${item.category}`)
      } else {
        addLog(`📁  Categoría existente: ${item.region} › ${item.project} › ${item.category}`)
      }

      for (const { file } of item.files) {
        const path = `${deliveryId}/${Date.now()}-${file.name}`
        const { error } = await supabase.storage.from('images').upload(path, file)
        if (!error) {
          const { data: urlData } = supabase.storage.from('images').getPublicUrl(path)
          await supabase.from('images').insert({
            delivery_id: deliveryId,
            url: urlData.publicUrl,
            name: file.name,
          })
          addLog(`   📸 ${file.name}`)
        } else {
          addLog(`   ❌ Error subiendo ${file.name}: ${error.message}`)
        }
        done++
        setProgress(done)
      }
    }

    addLog('✅  Importación completada')
    setStatus('done')
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  const pct = totalFiles > 0 ? Math.round((progress / totalFiles) * 100) : 0

  return (
    <div className="min-h-screen bg-[#1e2a36] flex flex-col">
      <header className="bg-[#15202b] shadow-md px-4 md:px-8 py-3 flex items-center gap-3">
        <div className="bg-white rounded-lg px-2.5 py-1">
          <Image src="/logo.png" alt="Civilia" width={90} height={28} className="object-contain" />
        </div>
        <div className="h-6 w-px bg-slate-600" />
        <div className="flex-1">
          <h1 className="font-bold text-white text-sm md:text-base">Importación masiva</h1>
          <p className="text-slate-400 text-xs hidden md:block">Región › Proyecto › Categoría › imágenes</p>
        </div>
        <a href="/" className="text-xs bg-slate-700 text-slate-200 px-3 py-2 rounded-lg hover:bg-slate-600 transition-colors">← Inicio</a>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full p-4 md:p-8">

        {/* DROP ZONE */}
        {status === 'idle' && (
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 md:p-16 text-center cursor-pointer transition-all select-none ${
              isDragging
                ? 'border-[#7ab82a] bg-[#7ab82a]/10 scale-[1.01]'
                : 'border-slate-600 hover:border-slate-400 hover:bg-slate-700/20'
            }`}
          >
            <div className="text-5xl mb-4">📁</div>
            <p className="text-white font-bold text-xl mb-2">Arrastra una carpeta aquí</p>
            <p className="text-slate-400 text-sm mb-6">o haz click para seleccionar</p>
            <div className="inline-block bg-[#15202b] border border-slate-600 rounded-xl px-4 py-3 text-left">
              <p className="text-slate-500 text-xs font-mono leading-relaxed">
                📁 MiCarpeta/<br />
                &nbsp;&nbsp;📁 Osorno/<br />
                &nbsp;&nbsp;&nbsp;&nbsp;📁 Jardines de Bellavista/<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📁 Cocinas/<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;🖼️ foto1.jpg
              </p>
            </div>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={handleInput} />
          </div>
        )}

        {/* PARSING */}
        {status === 'parsing' && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-300 gap-4">
            <div className="w-8 h-8 border-2 border-[#7ab82a] border-t-transparent rounded-full animate-spin" />
            <p>Analizando carpeta...</p>
          </div>
        )}

        {/* PREVIEW */}
        {status === 'previewing' && (
          <div>
            <div className="flex items-start justify-between mb-5 gap-4">
              <div>
                <h2 className="text-white font-bold text-lg">Vista previa</h2>
                <p className="text-slate-400 text-sm mt-0.5">
                  {totalFiles} imágenes · {preview.length} categorías ·{' '}
                  {preview.filter(i => !i.categoryExists && i.projectExists).length} nuevas
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setStatus('idle')}
                  className="text-sm bg-slate-700 text-slate-200 px-4 py-2 rounded-xl hover:bg-slate-600 transition-colors"
                >Cancelar</button>
                <button
                  onClick={runImport}
                  disabled={preview.every(i => !i.projectExists)}
                  className="text-sm bg-[#7ab82a] text-white px-5 py-2 rounded-xl font-semibold hover:bg-[#6aa020] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >Importar todo →</button>
              </div>
            </div>

            <div className="space-y-2">
              {preview.map((item, i) => (
                <div key={i} className={`bg-[#15202b] rounded-xl p-4 border ${item.projectExists ? 'border-slate-700' : 'border-red-500/30'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap text-sm">
                        <span className="text-slate-500">{item.region}</span>
                        <span className="text-slate-600">›</span>
                        <span className="text-slate-300">{item.project}</span>
                        <span className="text-slate-600">›</span>
                        <span className="text-white font-semibold">{item.category}</span>
                      </div>
                      <p className="text-slate-500 text-xs mt-1">{item.files.length} imagen{item.files.length !== 1 ? 'es' : ''}</p>
                    </div>
                    <div className="flex-shrink-0">
                      {!item.projectExists && (
                        <span className="text-xs bg-red-500/20 text-red-400 px-2.5 py-1 rounded-full">Proyecto no encontrado</span>
                      )}
                      {item.projectExists && !item.categoryExists && (
                        <span className="text-xs bg-[#7ab82a]/20 text-[#7ab82a] px-2.5 py-1 rounded-full">Categoría nueva</span>
                      )}
                      {item.categoryExists && (
                        <span className="text-xs bg-slate-600/40 text-slate-400 px-2.5 py-1 rounded-full">Ya existe</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* IMPORTING / DONE */}
        {(status === 'importing' || status === 'done') && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-white font-bold text-lg">
                  {status === 'done' ? '✅ Importación completa' : 'Importando...'}
                </h2>
                <p className="text-slate-400 text-sm mt-0.5">{progress} / {totalFiles} imágenes</p>
              </div>
              {status === 'done' && (
                <a href="/" className="text-sm bg-[#7ab82a] text-white px-4 py-2 rounded-xl font-semibold hover:bg-[#6aa020] transition-colors">← Ir al inicio</a>
              )}
            </div>

            {status === 'importing' && (
              <div className="mb-5">
                <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#7ab82a] transition-all duration-300 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-right text-xs text-slate-500 mt-1">{pct}%</p>
              </div>
            )}

            <div ref={logRef} className="bg-[#15202b] rounded-xl p-4 border border-slate-700 h-80 overflow-y-auto font-mono text-sm space-y-0.5">
              {log.map((line, i) => (
                <p key={i} className={
                  line.startsWith('❌') ? 'text-red-400' :
                  line.startsWith('✅') ? 'text-[#7ab82a]' :
                  line.startsWith('⚠') ? 'text-yellow-400' :
                  line.startsWith('   ') ? 'text-slate-500' :
                  'text-slate-300'
                }>{line}</p>
              ))}
              {status === 'importing' && (
                <p className="text-slate-600 animate-pulse">▋</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
