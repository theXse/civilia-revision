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

  useEffect(() => {
    Promise.all([
      supabase.from('projects').select('*').order('name').then(({ data }) => setProjects(data || [])),
      supabase.from('regions').select('*').then(({ data }) => setRegions(data || [])),
    ]).then(() => setLoading(false))

    loadActivity()
    window.addEventListener('focus', loadActivity)
    return () => window.removeEventListener('focus', loadActivity)
  }, [])

  async function loadActivity() {
    // Obtener deliveries con su project_id
    const { data: deliveries } = await supabase.from('deliveries').select('id, project_id')
    if (!deliveries?.length) return
    const deliveryToProject: Record<string, string> = {}
    for (const d of deliveries) deliveryToProject[d.id] = d.project_id

    // Comentarios: agrupar por proyecto via delivery
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

  async function createProject(region: string) {
    const name = newProjectName[region]?.trim()
    if (!name) return
    setCreating(region)
    const adminToken = crypto.randomUUID()
    const { data } = await supabase.from('projects').insert({ name, region, admin_token: adminToken }).select().single()
    if (data) {
      setProjects(prev => [...prev, data])
      setNewProjectName(prev => ({ ...prev, [region]: '' }))
    }
    setCreating(null)
  }

  function getRegionToken(regionName: string) {
    return regions.find(r => r.name === regionName)?.client_token ?? null
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
          {REGIONS.map(region => {
            const regionToken = getRegionToken(region)
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
                  {projects.filter(p => p.region === region).map(p => {
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
                  {projects.filter(p => p.region === region).length === 0 && (
                    <p className="text-slate-400 text-sm text-center py-2">Sin proyectos</p>
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
      </div>
    </div>
  )
}
