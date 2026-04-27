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

interface ProjectReview {
  projectName: string
  issues: string[]
  imageCount: number
}

interface ReviewModal {
  region: string
  reviews: ProjectReview[]
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [activity, setActivity] = useState<Record<string, { comments: number; changes: number; total: number; approved: number }>>({})
  const [loading, setLoading] = useState(true)
  const [newProjectName, setNewProjectName] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [editingRegion, setEditingRegion] = useState<string | null>(null)
  const [urlInputs, setUrlInputs] = useState<Record<string, { drive: string; dropbox: string; delivery: string }>>({})
  const [reviewingRegion, setReviewingRegion] = useState<string | null>(null)
  const [reviewModal, setReviewModal] = useState<ReviewModal | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }).then(({ data }) => setProjects(data || [])),
      supabase.from('regions').select('*').then(({ data }) => {
        const list = data || []
        setRegions(list)
        const inputs: Record<string, { drive: string; dropbox: string; delivery: string }> = {}
        for (const r of list) inputs[r.id] = { drive: r.drive_url || '', dropbox: r.dropbox_url || '', delivery: r.delivery_url || '' }
        setUrlInputs(inputs)
      }),
    ]).then(() => setLoading(false))

    loadActivity()
    const handleVisibility = () => { if (document.visibilityState === 'visible') loadActivity() }
    document.addEventListener('visibilitychange', handleVisibility)

    const imgChannel = supabase
      .channel('dashboard-realtime-images')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'images' }, () => {
        loadActivity()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'comments' }, () => {
        loadActivity()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, () => {
        loadActivity()
      })
      .subscribe()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      supabase.removeChannel(imgChannel)
    }
  }, [])

  async function loadActivity() {
    const [{ data: deliveries }, { data: images }, { data: comments }] = await Promise.all([
      supabase.from('deliveries').select('id, project_id'),
      supabase.from('images').select('id, delivery_id, status'),
      supabase.from('comments').select('image_id').eq('resolved', false),
    ])
    if (!deliveries?.length) return
    const deliveryToProject: Record<string, string> = {}
    for (const d of deliveries) deliveryToProject[d.id] = d.project_id
    const imageToProject: Record<string, string> = {}
    const changesPerProject: Record<string, number> = {}
    const totalPerProject: Record<string, number> = {}
    const approvedPerProject: Record<string, number> = {}
    for (const img of (images || [])) {
      const pId = deliveryToProject[img.delivery_id]
      if (!pId) continue
      imageToProject[img.id] = pId
      if (img.status === 'changes_requested') changesPerProject[pId] = (changesPerProject[pId] || 0) + 1
      totalPerProject[pId] = (totalPerProject[pId] || 0) + 1
      if (img.status === 'approved') approvedPerProject[pId] = (approvedPerProject[pId] || 0) + 1
    }
    const commentsPerProject: Record<string, number> = {}
    for (const c of (comments || [])) {
      const pId = imageToProject[c.image_id]
      if (pId) commentsPerProject[pId] = (commentsPerProject[pId] || 0) + 1
    }
    const result: Record<string, { comments: number; changes: number; total: number; approved: number }> = {}
    const allProjectIds = new Set([...Object.keys(commentsPerProject), ...Object.keys(changesPerProject), ...Object.keys(totalPerProject)])
    for (const pId of allProjectIds) {
      result[pId] = { comments: commentsPerProject[pId] || 0, changes: changesPerProject[pId] || 0, total: totalPerProject[pId] || 0, approved: approvedPerProject[pId] || 0 }
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
      delivery_url: inputs.delivery.trim() || null,
    }).eq('id', regionId)
    setRegions(prev => prev.map(r =>
      r.id === regionId
        ? { ...r, drive_url: inputs.drive.trim() || null, dropbox_url: inputs.dropbox.trim() || null, delivery_url: inputs.delivery.trim() || null }
        : r
    ))
    setEditingRegion(null)
  }

  async function reviewRegion(region: string) {
    setReviewingRegion(region)
    try {
      const res = await fetch('/api/review-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, force: true }),
      })
      const data = await res.json()
      if (data.reviews) {
        setReviewModal({ region, reviews: data.reviews })
      } else {
        alert(data.reason === 'already_sent' ? 'Ya se envió la revisión este mes para esta región.' : 'No hay imágenes para revisar este mes.')
      }
    } catch {
      alert('Error al conectar con el agente. Intenta de nuevo.')
    } finally {
      setReviewingRegion(null)
    }
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
        <a href="/api/export" download className="text-xs bg-slate-100 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors font-medium">⬇ Exportar</a>
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => reviewRegion(region)}
                      disabled={reviewingRegion === region}
                      title="Revisar láminas con IA"
                      className="text-xs bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white px-3 py-2 rounded-lg font-medium transition-colors whitespace-nowrap flex items-center gap-1.5"
                    >
                      {reviewingRegion === region ? (
                        <><span className="animate-spin inline-block">⏳</span> Revisando...</>
                      ) : (
                        <>🤖 Revisar con IA</>
                      )}
                    </button>
                    {regionToken && (
                      <a href={`/r/${regionToken}`} target="_blank" className="text-xs bg-[#7ab82a] text-white px-3 py-2 rounded-lg font-medium hover:bg-[#6aa020] transition-colors whitespace-nowrap">
                        Ver link ↗
                      </a>
                    )}
                  </div>
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
                      <div className="flex items-center gap-2">
                        <DriveIcon />
                        <input
                          type="url"
                          value={urlInputs[regionData.id]?.delivery ?? ''}
                          onChange={e => setUrlInputs(prev => ({ ...prev, [regionData.id]: { ...prev[regionData.id], delivery: e.target.value } }))}
                          placeholder="URL Entrega Final..."
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
                      {regionData.delivery_url ? (
                        <a href={regionData.delivery_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-800 px-2.5 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 border border-green-200 transition-colors">
                          <DriveIcon />
                          Entrega Final
                        </a>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-slate-300 px-2.5 py-1.5">
                          <DriveIcon dimmed />
                          Entrega Final
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
                    const allApproved = (act?.total ?? 0) > 0 && (act?.total ?? 0) === (act?.approved ?? 0)
                    return <ProjectCard key={p.id} p={p} act={act} allApproved={allApproved} onArchive={archiveProject} onDelete={deleteProject} />
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

        {/* Resumen Instagram */}
        {(() => {
          const listos = activeProjects.filter(p => p.listo_para_ig && !p.ready_for_social)
          const sinGraficas = activeProjects.filter(p => !p.listo_para_ig && !p.ready_for_social)
          return (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-[#4a6478] px-4 md:px-6 py-3 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                <h2 className="text-white font-semibold text-sm tracking-wide">Resumen Instagram</h2>
              </div>
              <div className="p-4 md:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Listos para subir */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Listos para subir</span>
                    <span className="ml-auto bg-orange-100 text-orange-600 text-xs font-bold px-2 py-0.5 rounded-full">{listos.length}</span>
                  </div>
                  {listos.length === 0
                    ? <p className="text-slate-400 text-xs pl-4">Ninguno pendiente</p>
                    : <ul className="space-y-1">
                        {listos.map(p => (
                          <li key={p.id} className="flex items-center gap-2 pl-4">
                            <span className="text-sm text-slate-700 flex-1 truncate">{p.name}</span>
                            <span className="text-xs text-slate-400 flex-shrink-0">{p.region}</span>
                          </li>
                        ))}
                      </ul>
                  }
                </div>
                {/* Sin gráficas */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 flex-shrink-0" />
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Sin gráficas en Drive</span>
                    <span className="ml-auto bg-slate-100 text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full">{sinGraficas.length}</span>
                  </div>
                  {sinGraficas.length === 0
                    ? <p className="text-slate-400 text-xs pl-4">Todos tienen contenido</p>
                    : <ul className="space-y-1">
                        {sinGraficas.map(p => (
                          <li key={p.id} className="flex items-center gap-2 pl-4">
                            <span className="text-sm text-slate-500 flex-1 truncate">{p.name}</span>
                            <span className="text-xs text-slate-400 flex-shrink-0">{p.region}</span>
                          </li>
                        ))}
                      </ul>
                  }
                </div>
              </div>
            </div>
          )
        })()}

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
                    {byYear[year].map(p => {
                      const act = activity[p.id]
                      const allApproved = (act?.total ?? 0) > 0 && (act?.total ?? 0) === (act?.approved ?? 0)
                      return (
                      <div key={p.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between group">
                        <div className="min-w-0 flex-1 mr-2">
                          <p className="font-medium text-slate-600 text-sm truncate">{p.name}</p>
                          <p className="text-slate-400 text-xs mt-0.5">{p.region} · {new Date(p.archived_at || p.created_at).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}</p>
                        </div>
                        <div className="flex gap-1 items-center flex-shrink-0">
                          {allApproved && (
                            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-semibold bg-[#7ab82a] text-white">
                              ✓ Todo aprobado
                            </span>
                          )}
                          <a href={`/a/${p.admin_token}`} target="_blank" className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1.5 rounded-lg font-medium hover:bg-slate-200 transition-colors">Ver</a>
                          <button
                            onClick={() => unarchiveProject(p.id)}
                            title="Restaurar a activos"
                            className="text-xs text-slate-400 hover:text-[#7ab82a] opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-1.5"
                          >↩</button>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Modal de revisión IA */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="bg-violet-600 px-6 py-4 rounded-t-2xl flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-white font-bold text-base">🤖 Revisión IA — {reviewModal.region}</h2>
                <p className="text-violet-200 text-xs mt-0.5">Láminas del mes actual · Correo enviado a ximena@laruta.ai</p>
              </div>
              <button onClick={() => setReviewModal(null)} className="text-white hover:text-violet-200 text-xl font-bold px-2">✕</button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto p-6 space-y-6 flex-1">
              {reviewModal.reviews.map((pr, i) => {
                // Intentar parsear issues estructurados (JSON)
                type StructuredItem = { n: number; label: string; errors: string[] }
                let withErrors: StructuredItem[] = []
                let withoutErrors: StructuredItem[] = []
                let plainIssues: string[] = []
                let isStructured = false

                if (pr.issues.length > 0) {
                  try {
                    const parsed = JSON.parse(pr.issues[0])
                    if (parsed.withErrors !== undefined) {
                      withErrors = parsed.withErrors
                      withoutErrors = parsed.withoutErrors
                      // Combinar issues de múltiples batches si hay más de uno
                      for (const extra of pr.issues.slice(1)) {
                        try {
                          const p2 = JSON.parse(extra)
                          withErrors = [...withErrors, ...p2.withErrors]
                          withoutErrors = [...withoutErrors, ...p2.withoutErrors]
                        } catch { plainIssues.push(extra) }
                      }
                      isStructured = true
                    }
                  } catch { plainIssues = pr.issues }
                }

                return (
                  <div key={i}>
                    <h3 className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
                      📐 {pr.projectName}
                      <span className="text-xs text-slate-400 font-normal">{pr.imageCount} láminas</span>
                      {isStructured && withErrors.length === 0 && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ Sin errores</span>
                      )}
                    </h3>

                    {isStructured ? (
                      <div className="space-y-2">
                        {/* Imágenes CON errores — punto rojo */}
                        {withErrors.map((item, j) => (
                          <div key={j} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                              <span className="text-xs font-semibold text-red-700">🔴 {item.label}</span>
                            </div>
                            <ul className="space-y-1 pl-4">
                              {item.errors.map((err, k) => (
                                <li key={k} className="text-sm text-slate-700 leading-relaxed">• {err}</li>
                              ))}
                            </ul>
                          </div>
                        ))}

                        {/* Imágenes SIN errores — agrupadas en una línea */}
                        {withoutErrors.length > 0 && (
                          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                            <span className="text-sm text-green-700">
                              <strong>Sin errores:</strong> {withoutErrors.map(item => item.label).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Fallback texto plano */
                      <div className="space-y-2">
                        {plainIssues.length === 0
                          ? <p className="text-green-600 text-sm bg-green-50 rounded-lg px-4 py-2">✅ Sin errores detectados</p>
                          : plainIssues.map((issue, j) => (
                              <div key={j} className="bg-yellow-50 border-l-4 border-yellow-400 px-4 py-3 rounded-r-lg text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{issue}</div>
                            ))
                        }
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end flex-shrink-0">
              <button
                onClick={() => setReviewModal(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function ProjectCard({ p, act, allApproved, onArchive, onDelete }: {
  p: Project
  act?: { comments: number; changes: number; total: number; approved: number }
  allApproved?: boolean
  onArchive: (p: Project) => void
  onDelete: (id: string) => void
}) {
  const [showNotes, setShowNotes] = useState(!!(p.notes?.trim()))
  const [notes, setNotes] = useState(p.notes || '')
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(p.ready_for_social || false)
  const [showSubido, setShowSubido] = useState(false)
  const [sendingNotif, setSendingNotif] = useState(false)
  const [showProblema, setShowProblema] = useState(false)
  const [problemaText, setProblemaText] = useState('')
  const [sendingProblema, setSendingProblema] = useState(false)
  const [showCliente, setShowCliente] = useState(!!(p.facebook_link?.trim()))
  const [facebookLink, setFacebookLink] = useState(p.facebook_link || '')
  const [sendingCliente, setSendingCliente] = useState(false)

  async function confirmSubido() {
    setSendingNotif(true)
    await supabase.from('projects').update({ ready_for_social: true, archived: true }).eq('id', p.id)
    const { data: deliveries } = await supabase.from('deliveries').select('id, name').eq('project_id', p.id)
    if (deliveries && deliveries.length > 0) {
      const ids = deliveries.map((d: { id: string }) => d.id)
      await supabase.from('images').update({ on_instagram: true }).in('delivery_id', ids)
    }
    await fetch('/api/queue-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region: p.region,
        type: 'subido_ig',
        item: {
          project_name: p.name,
          delivery_name: deliveries?.map((d: { name: string }) => d.name).join(', ') || '',
          delivery_id: p.id,
        },
      }),
    })
    setReady(true)
    setShowSubido(false)
    setSendingNotif(false)
  }

  async function unmarkSubido() {
    await supabase.from('projects').update({ ready_for_social: false, archived: false }).eq('id', p.id)
    const { data: deliveries } = await supabase.from('deliveries').select('id').eq('project_id', p.id)
    if (deliveries && deliveries.length > 0) {
      const ids = deliveries.map((d: { id: string }) => d.id)
      await supabase.from('images').update({ on_instagram: false }).in('delivery_id', ids)
    }
    setReady(false)
  }

  async function reportarProblema() {
    if (!problemaText.trim()) return
    setSendingProblema(true)
    await fetch('/api/notify-problem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: p.name,
        deliveryName: '',
        problemNotes: problemaText.trim(),
        region: p.region,
      }),
    })
    setProblemaText('')
    setShowProblema(false)
    setSendingProblema(false)
    alert('✓ Problema reportado a Ximena')
  }

  async function notificarCliente() {
    if (!facebookLink.trim()) return
    setSendingCliente(true)
    await supabase.from('projects').update({ facebook_link: facebookLink.trim() }).eq('id', p.id)
    await fetch('/api/queue-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region: p.region,
        type: 'link_approval',
        item: {
          project_name: p.name,
          delivery_name: p.name,
          delivery_id: p.id,
          facebook_link: facebookLink.trim(),
        },
      }),
    })
    setSendingCliente(false)
    alert('✓ Notificación programada — el cliente recibirá el email en máximo 1 hora')
  }

  async function saveNotes() {
    setSaving(true)
    await supabase.from('projects').update({ notes }).eq('id', p.id)
    setSaving(false)
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
          {allApproved && (
            <span className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold bg-[#7ab82a] text-white shadow-sm">
              ✓ Todo aprobado
            </span>
          )}
          {(act?.total ?? 0) > 0 && !allApproved && (
            <span className="text-xs px-2.5 py-1.5 text-slate-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              {act!.approved}/{act!.total} ✓
            </span>
          )}
          {/* Botón problema */}
          <button
            onClick={() => { setShowProblema(v => !v); setShowCliente(false); setShowSubido(false); setShowNotes(false) }}
            title="Reportar problema"
            className="text-xs px-2 py-1.5 rounded-lg transition-colors text-red-400 hover:bg-red-50 opacity-0 group-hover:opacity-100"
          >⚠️</button>
          {/* Botón link cliente */}
          <button
            onClick={() => { setShowCliente(v => !v); setShowProblema(false); setShowSubido(false); setShowNotes(false) }}
            title="Enviar link al cliente"
            className={`text-xs px-2 py-1.5 rounded-lg transition-colors font-semibold ${facebookLink.trim() ? 'text-blue-700 bg-blue-100 border border-blue-300 hover:bg-blue-200' : 'text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100'}`}
          >{facebookLink.trim() ? '🔗 Link' : '🔗'}</button>
          {/* Botón subido a IG */}
          <button
            onClick={ready ? unmarkSubido : () => { setShowSubido(v => !v); setShowProblema(false); setShowCliente(false); setShowNotes(false) }}
            title={ready ? 'Desmarcar como subido' : 'Marcar como subido a Instagram'}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all ${ready ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-sm' : 'bg-orange-100 text-orange-600 border border-orange-200 hover:bg-orange-200'}`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            {ready ? 'Subido ✓' : 'Subido'}
          </button>
          <button
            onClick={() => { setShowNotes(!showNotes); setShowProblema(false); setShowCliente(false); setShowSubido(false) }}
            title="Nota para diseñadora"
            className={`text-xs px-2 py-1.5 rounded-lg transition-colors font-semibold ${notes?.trim() ? 'text-amber-700 bg-amber-100 border border-amber-300 hover:bg-amber-200' : 'text-slate-400 hover:text-amber-600 opacity-0 group-hover:opacity-100'}`}
          >{notes?.trim() ? '📝 Nota' : '📝'}</button>
          <a href={`/a/${p.admin_token}`} target="_blank" className="text-xs bg-[#4a6478] text-white px-2.5 py-1.5 rounded-lg font-medium hover:bg-[#3a5060] transition-colors">Admin</a>
          <button onClick={() => onArchive(p)} title="Archivar" className="text-xs text-slate-400 hover:text-[#4a6478] opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-1.5">📦</button>
          <button onClick={() => onDelete(p.id)} className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity px-1 py-1.5">✕</button>
        </div>
      </div>

      {/* Panel: Reportar problema */}
      {showProblema && (
        <div className="px-3 md:px-4 pb-3 border-t border-red-100 pt-2">
          <p className="text-xs text-red-500 font-semibold mb-1.5">⚠️ Reportar problema a Ximena</p>
          <div className="flex gap-2">
            <input
              value={problemaText}
              onChange={e => setProblemaText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && reportarProblema()}
              placeholder="Ej: Error en resolución, tipografía incorrecta..."
              className="flex-1 bg-red-50 border border-red-200 text-slate-700 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-red-400 placeholder-slate-400"
            />
            <button
              onClick={reportarProblema}
              disabled={!problemaText.trim() || sendingProblema}
              className="bg-red-500 text-white text-xs px-3 py-2 rounded-lg font-semibold hover:bg-red-400 disabled:opacity-40 transition-colors whitespace-nowrap"
            >{sendingProblema ? 'Enviando...' : 'Reportar'}</button>
          </div>
        </div>
      )}

      {/* Panel: Link para el cliente */}
      {showCliente && (
        <div className="px-3 md:px-4 pb-3 border-t border-blue-100 pt-2">
          <p className="text-xs text-blue-600 font-semibold mb-1.5">🔗 Link de campaña para el cliente</p>
          <div className="flex gap-2">
            <input
              value={facebookLink}
              onChange={e => setFacebookLink(e.target.value)}
              placeholder="https://facebook.com/..."
              className="flex-1 bg-blue-50 border border-blue-200 text-slate-700 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-blue-400 placeholder-slate-400"
            />
            <button
              onClick={notificarCliente}
              disabled={!facebookLink.trim() || sendingCliente}
              className="bg-blue-600 text-white text-xs px-3 py-2 rounded-lg font-semibold hover:bg-blue-500 disabled:opacity-40 transition-colors whitespace-nowrap"
            >{sendingCliente ? 'Enviando...' : 'Notificar cliente'}</button>
          </div>
        </div>
      )}

      {/* Panel: Confirmar subida a IG */}
      {showSubido && !ready && (
        <div className="px-3 md:px-4 pb-3 border-t border-purple-100 pt-2">
          <div className="flex gap-2 items-center">
            <p className="text-xs text-purple-700 flex-1">¿Confirmar que <strong>{p.name}</strong> fue subido a Instagram?</p>
            <button
              onClick={confirmSubido}
              disabled={sendingNotif}
              className="text-xs bg-gradient-to-r from-purple-600 to-pink-500 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-60 hover:opacity-90 transition-opacity whitespace-nowrap"
            >{sendingNotif ? 'Guardando...' : '✓ Confirmar'}</button>
            <button onClick={() => setShowSubido(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-lg">Cancelar</button>
          </div>
        </div>
      )}

      {/* Panel: Notas para diseñadora */}
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
