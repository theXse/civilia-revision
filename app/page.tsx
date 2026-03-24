'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Project, Region } from '@/lib/supabase'
import Image from 'next/image'

const REGIONS = ['Osorno', 'Santiago', 'Valdivia', 'Concepción']

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [activity, setActivity] = useState<Record<string, { comments: number; changes: number }>>({})
  const [loading, setLoading] = useState(true)
  const [newProjectName, setNewProjectName] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }).then(({ data }) => setProjects(data || [])),
      supabase.from('regions').select('*').then(({ data }) => setRegions(data || [])),
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

  function getRegionToken(regionName: string) {
    return regions.find(r => r.name === regionName)?.client_token ?? null
  }

  const activeProjects = projects.filter(p => !p.archived)
  const archivedProjects = projects.filter(p => p.archived)

  // Agrupar archivados por año
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
            const regionToken = getRegionToken(region)
            const regionProjects = activeProjects.filter(p => p.region === region)
            return (
              <div key={region} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-[#4a6478] px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-2">
                  <h2 className="text-white font-semibold text-sm md:text-base tracking-wide">{region}</h2>
                  {regionToken && (
                    <a href={`/r/${regionToken}`} target="_blank" className="text-xs bg-[#7ab82a] text-white px-3 py-2 rounded-lg font-medium hover:bg-[#6aa020] transition-colors whitespace-nowrap">
                      Ver link ↗
                    </a>
                  )}
                </div>
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
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState(p.notes || '')
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(p.ready_for_social || false)

  async function saveNotes() {
    setSaving(true)
    await supabase.from('projects').update({ notes }).eq('id', p.id)
    setSaving(false)
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
          <button
            onClick={() => setShowNotes(!showNotes)}
            title="Nota para diseñadora"
            className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${notes ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:text-amber-600 opacity-0 group-hover:opacity-100'}`}
          >📝</button>
          <a href={`/a/${p.admin_token}`} target="_blank" className="text-xs bg-[#4a6478] text-white px-2.5 py-1.5 rounded-lg font-medium hover:bg-[#3a5060] transition-colors">Admin</a>
          <button onClick={() => onArchive(p)} title="Archivar" className="text-xs text-slate-400 hover:text-[#4a6478] opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-1.5">📦</button>
          <button onClick={() => onDelete(p.id)} className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity px-1 py-1.5">✕</button>
        </div>
      </div>
      {showNotes && (
        <div className="px-3 md:px-4 pb-3 border-t border-slate-200 pt-2">
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
      )}
    </div>
  )
}
