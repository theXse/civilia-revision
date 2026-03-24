'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Project, Delivery, Image as Img, Comment } from '@/lib/supabase'
import Image from 'next/image'

export default function ResumenPage() {
  const { token } = useParams() as { token: string }
  const [project, setProject] = useState<Project | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [imagesByDelivery, setImagesByDelivery] = useState<Record<string, Img[]>>({})
  const [commentsByImage, setCommentsByImage] = useState<Record<string, Comment[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [token])

  async function loadAll() {
    const { data: proj } = await supabase.from('projects').select('*').eq('admin_token', token).single()
    if (!proj) { setLoading(false); return }
    setProject(proj)

    const { data: dels } = await supabase.from('deliveries').select('*').eq('project_id', proj.id).order('created_at')
    if (!dels?.length) { setLoading(false); return }
    setDeliveries(dels)

    const deliveryIds = dels.map(d => d.id)
    const { data: imgs } = await supabase.from('images').select('*').in('delivery_id', deliveryIds).order('created_at')
    if (!imgs?.length) { setLoading(false); return }

    const byDelivery: Record<string, Img[]> = {}
    for (const img of imgs) {
      if (!byDelivery[img.delivery_id]) byDelivery[img.delivery_id] = []
      byDelivery[img.delivery_id].push(img)
    }
    setImagesByDelivery(byDelivery)

    const imageIds = imgs.map(i => i.id)
    const { data: comms } = await supabase.from('comments').select('*').in('image_id', imageIds).order('created_at')
    const byImage: Record<string, Comment[]> = {}
    for (const c of (comms || [])) {
      if (!byImage[c.image_id]) byImage[c.image_id] = []
      byImage[c.image_id].push(c)
    }
    setCommentsByImage(byImage)
    setLoading(false)
  }

  const statusLabel = (s: string) => s === 'approved' ? 'Aprobado' : s === 'changes_requested' ? 'Cambios' : s === 'revised' ? 'Revisado' : 'Pendiente'
  const statusColor = (s: string) => s === 'approved' ? 'bg-[#7ab82a] text-white' : s === 'changes_requested' ? 'bg-red-500 text-white' : s === 'revised' ? 'bg-yellow-400 text-black' : 'bg-slate-400 text-white'

  const allImages = Object.values(imagesByDelivery).flat()
  const totalApproved = allImages.filter(i => i.status === 'approved').length
  const totalChanges = allImages.filter(i => i.status === 'changes_requested').length
  const totalPending = allImages.filter(i => i.status === 'pending').length
  const totalRevised = allImages.filter(i => i.status === 'revised').length
  const totalComments = Object.values(commentsByImage).flat().length

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Cargando resumen...</div>
  if (!project) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Proyecto no encontrado</div>

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <div className="bg-[#15202b] rounded-lg px-2.5 py-1.5">
            <Image src="/logo.png" alt="Civilia" width={90} height={28} className="object-contain" />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 text-lg">{project.name}</h1>
            <p className="text-slate-400 text-xs">{project.region} · Resumen de revisión</p>
          </div>
        </div>
        <div className="flex gap-2">
          <a href={`/a/${token}`} className="text-xs bg-slate-100 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors">← Volver</a>
          <button onClick={() => window.print()} className="text-xs bg-[#4a6478] text-white px-3 py-2 rounded-lg hover:bg-[#3a5060] transition-colors">🖨 Imprimir / PDF</button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Título para impresión */}
        <div className="hidden print:block mb-8">
          <h1 className="text-2xl font-bold text-slate-800">{project.name} — Resumen de revisión</h1>
          <p className="text-slate-500 text-sm mt-1">{project.region}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-slate-800">{allImages.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total láminas</p>
          </div>
          <div className="bg-white rounded-xl border border-[#7ab82a]/40 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-[#7ab82a]">{totalApproved}</p>
            <p className="text-xs text-slate-500 mt-0.5">Aprobadas</p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-red-500">{totalChanges}</p>
            <p className="text-xs text-slate-500 mt-0.5">Con cambios</p>
          </div>
          <div className="bg-white rounded-xl border border-yellow-200 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-yellow-500">{totalRevised}</p>
            <p className="text-xs text-slate-500 mt-0.5">En revisión</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-slate-400">{totalPending}</p>
            <p className="text-xs text-slate-500 mt-0.5">Pendientes</p>
          </div>
        </div>

        {/* Por categoría */}
        {deliveries.map(d => {
          const imgs = imagesByDelivery[d.id] || []
          if (!imgs.length) return null
          return (
            <div key={d.id} className="mb-8">
              <h2 className="font-bold text-slate-700 text-base mb-3 pb-2 border-b border-slate-200">{d.name}</h2>
              <div className="space-y-3">
                {imgs.map((img, idx) => {
                  const comms = commentsByImage[img.id] || []
                  return (
                    <div key={img.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <img src={img.url} alt={`Lámina ${idx + 1}`} className="w-16 h-12 object-cover rounded-lg flex-shrink-0 bg-slate-100" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-700 text-sm">Lámina {idx + 1}</p>
                          <p className="text-slate-400 text-xs truncate">{img.name}</p>
                        </div>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full flex-shrink-0 ${statusColor(img.status)}`}>{statusLabel(img.status)}</span>
                      </div>
                      {comms.length > 0 && (
                        <div className="border-t border-slate-100 px-4 py-3 space-y-2">
                          {comms.map(c => (
                            <div key={c.id} className="flex gap-2 items-start">
                              <span className={`text-xs mt-0.5 flex-shrink-0 ${c.resolved ? 'text-slate-300' : 'text-slate-400'}`}>•</span>
                              <p className={`text-sm ${c.resolved ? 'line-through text-slate-300' : 'text-slate-600'}`}>{c.content}</p>
                              {c.resolved && <span className="text-xs text-[#7ab82a] flex-shrink-0 mt-0.5">✓</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {totalComments === 0 && allImages.length === 0 && (
          <p className="text-center text-slate-400 py-12">Sin datos aún</p>
        )}
      </div>
    </div>
  )
}
