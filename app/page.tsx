'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Project } from '@/lib/supabase'
import Image from 'next/image'

const REGIONS = ['Osorno', 'Santiago', 'Valdivia', 'Concepción']

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('projects').select('*').order('name').then(({ data }) => {
      setProjects(data || [])
      setLoading(false)
    })
  }, [])

  async function deleteProject(id: string) {
    if (!window.confirm('¿Eliminar este proyecto?')) return
    await supabase.from('projects').delete().eq('id', id)
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-600 text-lg">Cargando...</div>

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow-sm px-8 py-4 flex items-center gap-4">
        <Image src="/logo.png" alt="Civilia" width={140} height={48} className="object-contain" />
        <div className="h-8 w-px bg-slate-200 ml-2" />
        <span className="text-slate-500 font-medium text-sm tracking-wide uppercase">Portal de Revisión</span>
      </header>
      <div className="max-w-6xl mx-auto p-8">
        <div className="grid grid-cols-2 gap-6">
          {REGIONS.map(region => (
            <div key={region} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-[#4a6478] px-6 py-4">
                <h2 className="text-white font-semibold text-base tracking-wide">{region}</h2>
              </div>
              <div className="p-4 space-y-3">
                {projects.filter(p => p.region === region).map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 group">
                    <span className="font-medium text-slate-700 text-sm">{p.name}</span>
                    <div className="flex gap-2 items-center">
                      <a href={`/a/${p.admin_token}`} target="_blank" className="text-xs bg-[#4a6478] text-white px-3 py-1.5 rounded-lg font-medium hover:bg-[#3a5060] transition-colors">Admin</a>
                      <a href={`/r/${p.client_token}`} target="_blank" className="text-xs bg-[#7ab82a] text-white px-3 py-1.5 rounded-lg font-medium hover:bg-[#6aa020] transition-colors">Cliente</a>
                      <button onClick={() => deleteProject(p.id)} className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity ml-1 font-medium">Eliminar</button>
                    </div>
                  </div>
                ))}
                {projects.filter(p => p.region === region).length === 0 && (
                  <p className="text-slate-400 text-sm text-center py-4">Sin proyectos</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}