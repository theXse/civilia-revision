'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Project, Delivery, Image as Img, Comment } from '@/lib/supabase'
import Image from 'next/image'

export default function AdminPage() {
  const { token } = useParams() as { token: string }
  const [project, setProject] = useState<Project | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null)
  const [images, setImages] = useState<Img[]>([])
  const [selectedImage, setSelectedImage] = useState<Img | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [newDelivery, setNewDelivery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<Img | null>(null)

  useEffect(() => { loadProject() }, [token])

  async function loadProject() {
    const { data } = await supabase.from('projects').select('*').eq('admin_token', token).single()
    if (data) { setProject(data); loadDeliveries(data.id) } else { setError('Proyecto no encontrado') }
    setLoading(false)
  }

  async function loadDeliveries(projectId: string) {
    const { data } = await supabase.from('deliveries').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
    setDeliveries(data || [])
  }

  async function loadImages(deliveryId: string) {
    const { data } = await supabase.from('images').select('*').eq('delivery_id', deliveryId).order('created_at')
    setImages(data || [])
  }

  async function loadComments(imageId: string) {
    const { data } = await supabase.from('comments').select('*').eq('image_id', imageId).order('created_at')
    setComments(data || [])
  }

  async function createDelivery() {
    if (!newDelivery.trim() || !project) return
    const { data } = await supabase.from('deliveries').insert({ project_id: project.id, name: newDelivery }).select().single()
    if (data) { setDeliveries([data, ...deliveries]); setNewDelivery('') }
  }

  async function deleteDelivery(deliveryId: string) {
    if (!window.confirm('¿Eliminar esta entrega y todas sus imágenes?')) return
    await supabase.from('images').delete().eq('delivery_id', deliveryId)
    await supabase.from('deliveries').delete().eq('id', deliveryId)
    setDeliveries(deliveries.filter(d => d.id !== deliveryId))
    if (selectedDelivery?.id === deliveryId) { setSelectedDelivery(null); setImages([]) }
  }

  async function uploadImages(files: FileList) {
    if (!selectedDelivery) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const path = `${selectedDelivery.id}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('images').upload(path, file)
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('images').getPublicUrl(path)
        await supabase.from('images').insert({ delivery_id: selectedDelivery.id, url: urlData.publicUrl, name: file.name })
      }
    }
    loadImages(selectedDelivery.id)
    setUploading(false)
  }

  async function deleteImage(imageId: string) {
    if (!window.confirm('¿Eliminar esta imagen?')) return
    await supabase.from('images').delete().eq('id', imageId)
    setImages(images.filter(i => i.id !== imageId))
    if (selectedImage?.id === imageId) setSelectedImage(null)
  }

  async function deleteComment(commentId: string) {
    await supabase.from('comments').delete().eq('id', commentId)
    setComments(comments.filter(c => c.id !== commentId))
  }

  function selectDelivery(d: Delivery) { setSelectedDelivery(d); setSelectedImage(null); setComments([]); loadImages(d.id) }
  function selectImage(img: Img) { setSelectedImage(img); loadComments(img.id) }

  const statusBorder = (s: string) => s === 'approved' ? 'border-[#7ab82a] border-4' : s === 'changes_requested' ? 'border-red-500 border-4' : 'border-slate-600 border-2'
  const statusBadge = (s: string) => s === 'approved'
    ? <span className="bg-[#7ab82a] text-white text-xs px-2 py-0.5 rounded-full font-medium">Aprobado</span>
    : s === 'changes_requested'
    ? <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">Cambios</span>
    : <span className="bg-slate-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">Pendiente</span>

  if (loading) return <div className="min-h-screen bg-[#1e2a36] flex items-center justify-center text-slate-300">Cargando...</div>
  if (error) return <div className="min-h-screen bg-[#1e2a36] text-red-400 flex items-center justify-center">{error}</div>

  return (
    <div className="min-h-screen bg-[#1e2a36] flex flex-col">
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox.url} alt={lightbox.name} className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl" />
          <button className="absolute top-4 right-6 text-white text-3xl font-bold hover:text-slate-300" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}

      <header className="bg-[#15202b] shadow-md px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-white rounded-lg px-3 py-1.5">
              <Image src="/logo.png" alt="Civilia" width={110} height={34} className="object-contain" />
            </div>
          <div className="h-8 w-px bg-slate-600" />
          <div>
            <h1 className="font-bold text-white text-lg leading-tight">{project?.name}</h1>
            <p className="text-slate-400 text-xs">{project?.region} · Admin</p>
          </div>
        </div>
        <div className="flex gap-3">
          <a href="/" className="text-xs bg-slate-700 text-slate-200 px-3 py-2 rounded-lg hover:bg-slate-600 transition-colors">← Inicio</a>
          <a href={`/r/${project?.client_token}`} target="_blank" className="text-xs bg-[#7ab82a] text-white px-3 py-2 rounded-lg hover:bg-[#6aa020] transition-colors font-medium">Ver link cliente ↗</a>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 bg-[#15202b] border-r border-slate-700 p-4 overflow-y-auto flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Entregas</p>
          <div className="flex gap-2">
            <input
              value={newDelivery}
              onChange={e => setNewDelivery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createDelivery()}
              placeholder="Nueva entrega..."
              className="flex-1 bg-slate-700 text-white text-sm px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-[#7ab82a] placeholder-slate-400"
            />
            <button
              onClick={createDelivery}
              disabled={!newDelivery.trim()}
              className="bg-[#7ab82a] text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-[#6aa020] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >+</button>
          </div>
          {deliveries.map(d => (
            <div key={d.id} className={`flex items-center rounded-xl transition-colors ${selectedDelivery?.id === d.id ? 'bg-[#4a6478]' : 'hover:bg-slate-700'}`}>
              <button
                onClick={() => selectDelivery(d)}
                className={`flex-1 text-left px-3 py-2.5 text-sm font-medium truncate ${selectedDelivery?.id === d.id ? 'text-white' : 'text-slate-300'}`}
              >{d.name}</button>
              <button
                onClick={e => { e.stopPropagation(); deleteDelivery(d.id) }}
                className="px-2 py-2 text-slate-500 hover:text-red-400 transition-colors text-xs flex-shrink-0"
                title="Eliminar entrega"
              >✕</button>
            </div>
          ))}
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {selectedDelivery ? (
            <>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-white text-lg">{selectedDelivery.name}</h2>
                <label className={`cursor-pointer bg-[#4a6478] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#3a5060] transition-colors ${uploading ? 'opacity-50' : ''}`}>
                  {uploading ? 'Subiendo...' : '+ Subir imágenes'}
                  <input type="file" multiple accept="image/*" className="hidden" onChange={e => e.target.files && uploadImages(e.target.files)} disabled={uploading} />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {images.map(img => (
                  <div key={img.id} className={`relative rounded-2xl overflow-hidden cursor-pointer group shadow-lg ${statusBorder(img.status)}`}>
                    <img src={img.url} alt={img.name} className="w-full h-48 object-cover" onClick={() => setLightbox(img)} />
                    <div className="absolute bottom-0 left-0 right-0 bg-[#15202b]/95 px-3 py-2 flex justify-between items-center">
                      {statusBadge(img.status)}
                      <button onClick={e => { e.stopPropagation(); deleteImage(img.id) }} className="text-red-400 hover:text-red-300 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">Selecciona una entrega</div>
          )}
        </div>

        {selectedImage && (
          <div className="w-80 bg-[#15202b] border-l border-slate-700 p-4 overflow-y-auto">
            <img src={selectedImage.url} alt={selectedImage.name} className="w-full rounded-xl mb-3 cursor-zoom-in" onClick={() => setLightbox(selectedImage)} />
            <p className="text-xs text-slate-500 mb-4 truncate">{selectedImage.name}</p>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Comentarios</h3>
            {comments.length === 0 && <p className="text-slate-500 text-sm mb-3">Sin comentarios</p>}
            {comments.map(c => (
              <div key={c.id} className="bg-slate-700 border border-slate-600 rounded-xl p-3 mb-2">
                <div className="flex justify-between items-start">
                  <span className="font-semibold text-[#7ab82a] text-sm">{c.author}</span>
                  <button onClick={() => deleteComment(c.id)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                </div>
                <p className="text-slate-300 text-sm mt-1">{c.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}