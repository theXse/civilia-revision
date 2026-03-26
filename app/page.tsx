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
  const [editingRegion, setEditingRegion] = useState<string | null>(null)
  const [urlInputs, setUrlInputs] = useState<Record<string, { drive: string; dropbox: string }>>({})

  useEffect(() => {
    Promise.all([
      supabase.from('projects').select('*').order('name').then(({ data }) => setProjects(data || [])),
      supabase.from('regions').select('*').then(({ data }) => {
        const list = data || []
        setRegions(list)
        const inputs: Record<string, { drive: string; dropbox: string }> = {}
        for (const r of list) inputs[r.id] = { drive: r.drive_url || '', dropbox: r.dropbox_url || '' }
        setUrlInputs(inputs)
      }),
    ]).then(() => setLoading(false))

    loadActivity()
  }, [])

  async function loadActivity() {
    const { data: deliveries } = await supabase.from('deliveries').select('id, project_id')
    if (!deliveries?.length) return
    const deliveryToProject: Record<string, string> = {}
    for (const d of deliveries) deliveryToProject[d.id] = d.project_id

    const { data: images } = await supabase.from('images').select('id, delivery_id, status')
    if (!images?.length) return
    const imageToProject: Record<string, string> = {}
    const changesPerProject: Record<string, number> = {}
    for (const img of images) {
      const pId = deliveryToProject[img.delivery_id]
      if (!pId) continue
      imageToProject[img.id] = pId
      if (img.status === 'changes_requested') changesPerProject[pId] = (changesPerProject[pId] || 0) + 1
    }

    const { data: comments } = await supabase.from('comments').select('image_id')
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

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-600 text-lg">Cargando...</div>

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow-sm px-4 md:px-8 py-3 md:py-4 flex items-center gap-3">
        <Image src="/logo.png" alt="Civilia" width={120} height={40} className="object-contain" />
        <div className="h-6 w-px bg-slate-200" />
        <span className="text-slate-500 font-medium text-xs md:text-sm tracking-wide uppercase flex-1">Portal de Revisión</span>
        <a href="/import" className="text-xs bg-[#4a6478] text-white px-3 py-2 rounded-lg hover:bg-[#3a5060] transition-colors font-medium">⬆ Importar</a>
      </header>
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
          {REGIONS.map(regionName => {
            const regionData = getRegion(regionName)
            const regionToken = regionData?.client_token ?? null
            const isEditing = regionData ? editingRegion === regionData.id : false

            return (
              <div key={regionName} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="bg-[#4a6478] px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-2">
                  <h2 className="text-white font-semibold text-sm md:text-base tracking-wide">{regionName}</h2>
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
                        <a
                          href={regionData.drive_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                        >
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
                        <a
                          href={regionData.dropbox_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                        >
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
                  {projects.filter(p => p.region === regionName).map(p => {
                    const act = activity[p.id]
                    return (
                      <div key={p.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 md:px-4 py-3 group">
                        <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                          <span className="font-medium text-slate-700 text-sm truncate">{p.name}</span>
                          {act?.changes > 0 && (
                            <span className="flex-shrink-0 flex items-center gap-1 bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full inline-block" />
                              {act.changes} cambios
                            </span>
                          )}
                          {act?.comments > 0 && act?.changes === 0 && (
                            <span className="flex-shrink-0 flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                              💬 {act.comments}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 items-center flex-shrink-0">
                          <a href={`/a/${p.admin_token}`} target="_blank" className="text-xs bg-[#4a6478] text-white px-2.5 py-1.5 rounded-lg font-medium hover:bg-[#3a5060] transition-colors">Admin</a>
                          <button onClick={() => deleteProject(p.id)} className="text-xs text-red-400 hover:text-red-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                        </div>
                      </div>
                    )
                  })}
                  {projects.filter(p => p.region === regionName).length === 0 && (
                    <p className="text-slate-400 text-sm text-center py-4">Sin proyectos</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
