'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Project, Region } from '@/lib/supabase'
import Image from 'next/image'

const REGIONS = ['Osorno', 'Santiago', 'Valdivia', 'Concepción']

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('projects').select('*').order('name').then(({ data }) => setProjects(data || [])),
      supabase.from('regions').select('*').then(({ data }) => setRegions(data || [])),
    ]).then(() => setLoading(false))
  }, [])

  async function deleteProject(id: string) {
    if (!window.confirm('¿Eliminar este proyecto?')) return
    await supabase.from('projects').delete().eq('id', id)
    setProjects(prev => prev.filter(p => p.id !== id))
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
                    <a
                      href={`/r/${regionToken}`}
                      target="_blank"
                      className="text-xs bg-[#7ab82a] text-white px-3 py-2 rounded-lg font-medium hover:bg-[#6aa020] transition-colors whitespace-nowrap"
                    >
                      Ver link ↗
                    </a>
                  )}
                </div>
                <div className="p-3 md:p-4 space-y-2">
                  {projects.filter(p => p.region === region).map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 md:px-4 py-3 group">
                      <span className="font-medium text-slate-700 text-sm truncate flex-1 mr-2">{p.name}</span>
                      <div className="flex gap-2 items-center flex-shrink-0">
                        <a href={`/a/${p.admin_token}`} target="_blank" className="text-xs bg-[#4a6478] text-white px-2.5 py-1.5 rounded-lg font-medium hover:bg-[#3a5060] transition-colors">Admin</a>
                        <button onClick={() => deleteProject(p.id)} className="text-xs text-red-400 hover:text-red-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                      </div>
                    </div>
                  ))}
                  {projects.filter(p => p.region === region).length === 0 && (
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
