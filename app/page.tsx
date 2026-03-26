'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Project, Region } from '@/lib/supabase'
import Image from 'next/image'

const REGIONS = ['Osorno', 'Santiago', 'Valdivia', 'Concepción']

function DriveIcon({ dimmed }: { dimmed?: boolean }) {
  const opacity = dimmed ? 0.3 : 1
  return (
    <svg width="16" height="16" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" style={{ opacity, flexShrink: 0 }}>
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.55c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H60.1l5.9 11.5z" fill="#ea4335"/>
      <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="M60.1 53.05H27.5L13.75 76.85c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="M73.4 26.5l-12.6-21.8C60 3.3 58.85 2.2 57.5 1.4L43.65 25l16.45 28.05H87.1c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  )
}

function DropboxIcon({ dimmed }: { dimmed?: boolean }) {
  const opacity = dimmed ? 0.3 : 1
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ opacity, flexShrink: 0 }}>
      <path d="M6 2L0 6l6 4 6-4L6 2zM18 2l-6 4 6 4 6-4-6-4zM0 14l6 4 6-4-6-4-6 4zM18 10l-6 4 6 4 6-4-6-4zM6 19.5l6 3.5 6-3.5-6-4-6 4z" fill="#0061ff"/>
    </svg>
  )
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [activity, setActivity] = useState<Record<string, { comments: number; changes: number }>>({})
  const [loading, setLoading] = useState(true)
  const [newProjectName, setNewProjectName] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [editingRegion, setEditingRegion] = useState<string | null>(null)
  const [urlInputs, setUrlInputs] = useState<Record<string, { drive: string; dropbox: string }>>({})

  useEffect(() => {
    Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }).then(({ data }) => setProjects(data || [])),
      supabase.from('regions').select('*').then(({ data }) => {
        const list = data || []
        setRegions(list)
        const inputs: Record<string, { drive: string; dropbox: string }> = {}
        for (const r of list) inputs[r.id] = { drive: r.drive_url || '', dropbox: r.dropbox_url || '' }
        setUrlInputs(inputs)
      }),
    ]).then(() => setLoading(false))

    loadActivity()
    window.addEventListener('focus', loadActivity)
    return () => window.removeEventListener('focus', loadActivity)
  }, [])

  async function loadActivity() {
    const [{ data: deliveries }, { data: images }, { data: comments }] = await Promise.all([
      supabase.from('deliveries').select('id, project_id'),
      supabase.from('images').select('id, delivery_id, status'),
      supabase.from('comments').select('image_id'),
    ])
    if (!deliveries?.length) return
    const deliveryToProject: Record<string, string> = {}
    for (const d of deliveries) deliveryToProject[d.id] = d.project_id
    const imageToProject: Record<string, string> = {}
    const changesPerProject: Record<string, number> = {}
    for (const img of (images || [])) {
      const pId = deliveryToProject[img.delivery_id]
      if (!pId) continue
      imageToProject[img.id] = pId
      if (img.status === 'changes_requested') changesPerProject[pId] = (changesPerProject[pId] || 0) + 1
    }
    const commentsPerProject: Record<string, number> = {}
    for (const c of (comments || [])) {
      const pId = imageToProject[c.image_id]
      if (pId) commentsPerProject[pId] = (commentsPerProject[pId] || 0) + 1
    }
    const result: Record<string, { comments: number; changes: number }> = {}
    const allProjectIds = new Set([...Object.keys(commentsPerProject), ...Object.keys(changesPerProject)])
    for (const pId of allProjectIds) {
      result[pId] = { comments: commentsPerProject[pId] || 0, changes: changesPerProject[pId] || 0 }
    }
    setActivity(result)
  }

  async function deleteProject(id: string) {
    if (!window.confirm('¿Eliminar este proyecto?')) return
    await supabase.from('projects').delete().eq('id', id)
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  async function archiveProject(p: Project) {
    if (!window.confirm(`¿Archivar "${p.name}"? Quedará guardado en el historial como solo lectura.`)) return
    const archived_at = new Date().toISOString()
    await supabase.from('projects').update({ archived: true, archived_at }).eq('id', p.id)
    setProjects(prev => prev.map(x => x.id === p.id ? { ...x, archived: true, archived_at } : x))
  }

  async function unarchiveProject(id: string) {
    await supabase.from('projects').update({ archived: false, archived_at: null }).eq('id', id)
    setProjects(prev => prev.map(x => x.id === id ? { ...x, archived: false, archived_at: null } : x))
  }

  async function createProject(region: string) {
    const name = newProjectName[region]?.trim()
    if (!name) return
    setCreating(region)
    const adminToken = crypto.randomUUID()
    const { data } = await supabase.from('projects').insert({ name, region, admin_token: adminToken }).select().single()
    if (data) {
      setProjects(prev => [data, ...prev])
      setNewProjectName(prev => ({ ...prev, [region]: '' }))
    }
    setCreating(null)
  }

  async function saveUrls(regionId: string) {
    const inputs = urlInputs[regionId]
    if (!inputs) return
    await supabase.from('regions').update({
      drive_url: inputs.drive.trim() || null,
      dropbox_url: inputs.dropbox.trim() || null,
    }).eq('id', regionId)
    setRegions(prev => prev.map(r =>
      r.id === regionId
        ? { ...r, drive_url: inputs.drive.trim() || null, dropbox_url: inputs.dropbox.trim() || null }
        : r
    ))
    setEditingRegion(null)
  }

  function getRegion(regionName: string): Region | null {
    return regions.find(r => r.name === regionName) ?? null
  }

  const activeProjects = projects.filter(p => !p.archived)
  const archivedProjects = projects.filter(p => p.archived)

  const byYear: Record<string, Project[]> = {}
  for (const p of archivedProjects) {
    const year = new Date(p.archived_at || p.created_at).getFullYear().toString()
    if (!byYear[year]) byYear[year] = []
    byYear[year].push(p)
  }
  const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a))

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-600 text-lg">Cargando...</div>

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow-sm px-4 md:px-8 py-3 md:py-4 flex items-center gap-3">
        <Image src="/logo.png" alt="Civilia" width={120} height={40} className="object-contain" />
        <div className="h-6 w-px bg-slate-200" />
        <span className="text-slate-500 font-medium text-xs md:text-sm tracking-wide uppercase flex-1">Portal de Revisión</span>
        <a href="/import" className="text-xs bg-[#4a6478] text-white px-3 py-2 rounded-lg hover:bg-[#3a5060] transition-colors font-medium">⬆ Importar</a>
      </header>

      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">

        {/* Proyectos activos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
          {REGIONS.map(region => {
            const regionData = getRegion(region)
            const regionToken = regionData?.client_token ?? null
            const regionProjects = activeProjects.filter(p => p.region === region)
            const isEditing = regionData ? editingRegion === regionData.id : false

            return (
              <div key={region} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="bg-[#4a6478] px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-2">
                  <h2 className="text-white font-semibold text-sm md:text-base tracking-wide">{region}</h2>
                  {regionToken && (
                    <a href={`/r/${regionToken}`} target="_blank" className="text-xs bg-[#7ab82a] text-white px-3 py-2 rounded-lg font-medium hover:bg-[#6aa020] transition-colors whitespace-nowrap">
                      Ver link ↗
                    </a>
                  )}
                </div>

                {/* Cloud storage links */}
                {regionData && (
                  isEditing ? (
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 space-y-2">
                      <div className="flex items-center gap-2">
                        <DriveIcon />
                        <input
                          type="url"
                          value={urlInputs[regionData.id]?.drive ?? ''}
                          onChange={e => setUrlInputs(prev => ({ ...prev, [regionData.id]: { ...prev[regionData.id], drive: e.target.value } }))}
                          placeholder="URL de Google Drive..."
                          className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#4a6478]"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <DropboxIcon />
                        <input
                          type="url"
                          value={urlInputs[regionData.id]?.dropbox ?? ''}
                          onChange={e => setUrlInputs(prev => ({ ...prev, [regionData.id]: { ...prev[regionData.id], dropbox: e.target.value } }))}
                          placeholder="URL de Dropbox..."
                          className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#4a6478]"
                        />
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                        <button onClick={() => setEditingRegion(null)} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg transition-colors">
                          Cancelar
                        </button>
                        <button onClick={() => saveUrls(regionData.id)} className="text-xs bg-[#4a6478] text-white px-3 py-1.5 rounded-lg hover:bg-[#3a5060] transition-colors font-medium">
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
                      {regionData.drive_url ? (
                        <a href={regionData.drive_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                          <DriveIcon />
                          Drive
                        </a>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-slate-300 px-2.5 py-1.5">
                          <DriveIcon dimmed />
                          Drive
                        </span>
                      )}
                      {regionData.dropbox_url ? (
                        <a href={regionData.dropbox_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                          <DropboxIcon />
                          Dropbox
                        </a>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-slate-300 px-2.5 py-1.5">
                          <DropboxIcon dimmed />
                          Dropbox
                        </span>
                      )}
                      <button
                        onClick={() => setEditingRegion(regionData.id)}
                        className="ml-auto text-slate-300 hover:text-slate-500 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Editar links"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                    </div>
                  )
                )}

                {/* Projects list */}
                <div className="p-3 md:p-4 space-y-2">
                  {regionProjects.map(p => {
                    const act = activity[p.id]
                    return <ProjectCard key={p.id} p={p} act={act} onArchive={archiveProject} onDelete={deleteProject} />
                  })}
                  {regionProjects.length === 0 && (
                    <p className="text-slate-400 text-sm text-center py-2">Sin proyectos activos</p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <input
                      value={newProjectName[region] || ''}
                      onChange={e => setNewProjectName(prev => ({ ...prev, [region]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && createProject(region)}
                      placeholder="Nuevo proyecto..."
                      className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-[#4a6478] placeholder-slate-400"
                    />
                    <button
                      onClick={() => createProject(region)}
                      disabled={!newProjectName[region]?.trim() || creating === region}
                      className="bg-[#4a6478] text-white px-3 py-2 rounded-lg text-lg font-bold hover:bg-[#3a5060] transition-colors disabled:opacity-40"
                    >{creating === region ? '…' : '+'}</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Historial */}
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-700 font-semibold text-sm transition-colors mb-4"
          >
            <span className={`transition-transform ${showHistory ? 'rotate-90' : ''}`}>▶</span>
            Historial de campañas
            {archivedProjects.length > 0 && (
              <span className="bg-slate-300 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{archivedProjects.length}</span>
            )}
          </button>

          {showHistory && (
            <div className="space-y-6">
              {years.length === 0 && (
                <p className="text-slate-400 text-sm text-center py-6 bg-white rounded-2xl">
                  Aún no hay proyectos archivados. Cuando termines una campaña, archívala con el ícono 📦.
                </p>
              )}
              {years.map(year => (
                <div key={year}>
                  <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-slate-200" />
                    {year}
                    <span className="h-px flex-1 bg-slate-200" />
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {byYear[year].map(p => (
                      <div key={p.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between group">
                        <div className="min-w-0 flex-1 mr-2">
                          <p className="font-medium text-slate-600 text-sm truncate">{p.name}</p>
                          <p className="text-slate-400 text-xs mt-0.5">{p.region} · {new Date(p.archived_at || p.created_at).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}</p>
                        </div>
                        <div className="flex gap-1 items-center flex-shrink-0">
                          <a href={`/a/${p.admin_token}`} target="_blank" className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1.5 rounded-lg font-medium hover:bg-slate-200 transition-colors">Ver</a>
                          <button
                            onClick={() => unarchiveProject(p.id)}
                            title="Restaurar a activos"
                            className="text-xs text-slate-400 hover:text-[#7ab82a] opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-1.5"
                          >↩</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function ProjectCard({ p, act, onArchive, onDelete }: {
  p: Project
  act?: { comments: number; changes: number }
  onArchive: (p: Project) => void
  onDelete: (id: string) => void
}) {
  const [showNotes, setShowNotes] = useState(!!(p.notes?.trim()))
  const [notes, setNotes] = useState(p.notes || '')
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(p.ready_for_social || false)
  const [driveLink, setDriveLink] = useState(p.drive_link || '')
  const [savingDrive, setSavingDrive] = useState(false)

  async function saveNotes() {
    setSaving(true)
    await supabase.from('projects').update({ notes }).eq('id', p.id)
    setSaving(false)
  }

  async function saveDriveLink() {
    setSavingDrive(true)
    await supabase.from('projects').update({ drive_link: driveLink }).eq('id', p.id)
    setSavingDrive(false)
  }

  async function toggleReady() {
    const val = !ready
    await supabase.from('projects').update({ ready_for_social: val }).eq('id', p.id)
    setReady(val)
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl group">
      <div className="flex items-center justify-between px-3 md:px-4 py-3">
        <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
          <span className="font-medium text-slate-700 text-sm truncate">{p.name}</span>
          {(act?.changes ?? 0) > 0 && (
            <span className="flex-shrink-0 flex items-center gap-1 bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full inline-block" />
              {act!.changes} cambios
            </span>
          )}
          {(act?.comments ?? 0) > 0 && (act?.changes ?? 0) === 0 && (
            <span className="flex-shrink-0 flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              💬 {act!.comments}
            </span>
          )}
        </div>
        <div className="flex gap-1 items-center flex-shrink-0">
          <button
            onClick={toggleReady}
            title={ready ? 'Quitar estado listo para redes' : 'Marcar como listo para redes'}
            className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all ${ready ? 'bg-[#7ab82a] text-white shadow-sm' : 'text-slate-400 hover:text-[#7ab82a] opacity-0 group-hover:opacity-100'}`}
          >{ready ? '✓ Listo para redes' : '🌐 Redes'}</button>
          {driveLink?.trim()
            ? <a href={driveLink} target="_blank" className="text-xs px-2 py-1.5 rounded-lg font-semibold bg-green-100 text-green-700 border border-green-300 hover:bg-green-200 transition-colors" title="Abrir carpeta Drive">📁 Drive</a>
            : <button onClick={() => setShowNotes(true)} title="Agregar link Drive" className="text-xs px-2 py-1.5 rounded-lg text-slate-400 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-colors">📁</button>
          }
          <button
            onClick={() => setShowNotes(!showNotes)}
            title="Nota para diseñadora"
            className={`text-xs px-2 py-1.5 rounded-lg transition-colors font-semibold ${notes?.trim() ? 'text-amber-700 bg-amber-100 border border-amber-300 hover:bg-amber-200' : 'text-slate-400 hover:text-amber-600 opacity-0 group-hover:opacity-100'}`}
          >{notes?.trim() ? '📝 Nota' : '📝'}</button>
          <a href={`/a/${p.admin_token}`} target="_blank" className="text-xs bg-[#4a6478] text-white px-2.5 py-1.5 rounded-lg font-medium hover:bg-[#3a5060] transition-colors">Admin</a>
          <button onClick={() => onArchive(p)} title="Archivar" className="text-xs text-slate-400 hover:text-[#4a6478] opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-1.5">📦</button>
          <button onClick={() => onDelete(p.id)} className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity px-1 py-1.5">✕</button>
        </div>
      </div>
      {showNotes && (
        <div className="px-3 md:px-4 pb-3 border-t border-slate-200 pt-2 space-y-3">
          <div>
            <p className="text-xs text-slate-500 mb-1.5 font-medium">📁 Carpeta Drive (originales en alta)</p>
            <div className="flex gap-2">
              <input
                value={driveLink}
                onChange={e => setDriveLink(e.target.value)}
                onBlur={saveDriveLink}
                placeholder="https://drive.google.com/drive/folders/..."
                className="flex-1 bg-green-50 border border-green-200 text-slate-700 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-green-400 placeholder-slate-400"
              />
              {driveLink?.trim() && (
                <a href={driveLink} target="_blank" className="text-xs bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-500 transition-colors font-medium whitespace-nowrap">Abrir ↗</a>
              )}
            </div>
            <span className="text-xs text-slate-400">{savingDrive ? 'Guardando...' : 'Se guarda automáticamente'}</span>
          </div>
          <div>
          <p className="text-xs text-slate-500 mb-1.5 font-medium">📝 Nota para diseñadora</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Ej: Usar tipografía nueva, logo versión horizontal, colores campaña verano..."
            rows={3}
            className="w-full bg-amber-50 border border-amber-200 text-slate-700 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-amber-400 placeholder-slate-400 resize-none"
          />
          <div className="flex justify-between items-center mt-1">
            <span className="text-xs text-slate-400">{saving ? 'Guardando...' : 'Se guarda automáticamente'}</span>
            <button onClick={saveNotes} className="text-xs bg-amber-500 hover:bg-amber-400 text-white px-3 py-1 rounded-lg transition-colors">Guardar</button>
          </div>
          </div>
        </div>
      )}
    </div>
  )
}
