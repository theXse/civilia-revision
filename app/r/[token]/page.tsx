'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Region, Project, Delivery, Image as Img, Comment } from '@/lib/supabase'
import Image from 'next/image'

export default function ClientRegionPage() {
  const { token } = useParams() as { token: string }

  const [region, setRegion] = useState<Region | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null)
  const [images, setImages] = useState<Img[]>([])
  const [selectedImage, setSelectedImage] = useState<Img | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [author, setAuthor] = useState('')
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<Img | null>(null)

  useEffect(() => { loadRegion() }, [token])

  async function loadRegion() {
    const { data } = await supabase.from('regions').select('*').eq('client_token', token).single()
    if (data) {
      setRegion(data)
      loadProjects(data.name)
    } else {
      setError('Región no encontrada')
    }
    setLoading(false)
  }

  async function loadProjects(regionName: string) {
    const { data } = await supabase.from('projects').select('*').eq('region', regionName).order('name')
    setProjects(data || [])
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

  async function addComment() {
    if (!newComment.trim() || !author.trim() || !selectedImage) return
    const { data } = await supabase.from('comments').insert({ image_id: selectedImage.id, author, content: newComment }).select().single()
    if (data) { setComments([...comments, data]); setNewComment('') }
  }

  async function updateStatus(status: 'approved' | 'changes_requested' | 'pending') {
    if (!selectedImage) return
    await supabase.from('images').update({ status }).eq('id', selectedImage.id)
    setSelectedImage({ ...selectedImage, status })
    setImages(images.map(i => i.id === selectedImage.id ? { ...i, status } : i))
  }

  function selectProject(p: Project) {
    setSelectedProject(p)
    setSelectedDelivery(null)
    setSelectedImage(null)
    setImages([])
    setComments([])
    loadDeliveries(p.id)
  }

  function selectDelivery(d: Delivery) {
    setSelectedDelivery(d)
    setSelectedImage(null)
    setComments([])
    loadImages(d.id)
  }

  function selectImage(img: Img) {
    setSelectedImage(img)
    loadComments(img.id)
  }

  function goBack() {
    setSelectedProject(null)
    setSelectedDelivery(null)
    setSelectedImage(null)
    setImages([])
    setComments([])
    setDeliveries([])
  }

  const statusBorder = (s: string) =>
    s === 'approved' ? 'border-[#7ab82a] border-4' :
    s === 'changes_requested' ? 'border-red-500 border-4' :
    'border-slate-600 border-2'

  const statusBadge = (s: string) =>
    s === 'approved'
      ? <span className="bg-[#7ab82a] text-white text-xs px-2 py-0.5 rounded-full font-medium">Aprobado</span>
      : s === 'changes_requested'
      ? <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">Cambios</span>
      : <span className="bg-slate-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">Pendiente</span>

  if (loading) return <div className="min-h-screen bg-[#1e2a36] flex items-center justify-center text-slate-300">Cargando...</div>
  if (error) return <div className="min-h-screen bg-[#1e2a36] text-red-400 flex items-center justify-center">{error}</div>

  return (
    <div className="min-h-screen bg-[#1e2a36] flex flex-col">
      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox.url} alt={lightbox.name} className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl" />
          <button className="absolute top-4 right-6 text-white text-3xl font-bold hover:text-slate-300" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}

      {/* Header */}
      <header className="bg-[#15202b] shadow-md px-8 py-4 flex items-center gap-4">
        <div className="bg-white rounded-lg px-3 py-1.5">
          <Image src="/logo.png" alt="Civilia" width={110} height={34} className="object-contain" />
        </div>
        <div className="h-8 w-px bg-slate-600" />
        <div className="flex-1">
          <h1 className="font-bold text-white text-lg leading-tight">{region?.name}</h1>
          <p className="text-slate-400 text-xs">Portal de Revisión</p>
        </div>
        {selectedProject && (
          <button onClick={goBack} className="text-xs bg-slate-700 text-slate-200 px-3 py-2 rounded-lg hover:bg-slate-600 transition-colors">← Volver</button>
        )}
      </header>

      {/* Estado A: Sin proyecto seleccionado */}
      {!selectedProject && (
        <div className="flex-1 p-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-white font-semibold text-lg mb-6">Proyectos</h2>
            {projects.length === 0 ? (
              <p className="text-slate-500 text-center py-16">No hay proyectos en esta región</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {projects.map(p => (
                  <div key={p.id} className="bg-[#15202b] rounded-2xl overflow-hidden shadow-lg border border-slate-700">
                    <div className="bg-[#4a6478] px-5 py-3">
                      <h3 className="text-white font-semibold text-sm">{p.name}</h3>
                    </div>
                    <div className="px-5 py-4">
                      <button
                        onClick={() => selectProject(p)}
                        className="w-full bg-[#7ab82a] hover:bg-[#6aa020] text-white text-sm py-2.5 rounded-xl font-semibold transition-colors"
                      >
                        Ver proyecto →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Estado B y C: Proyecto seleccionado */}
      {selectedProject && (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar izquierdo con categorías */}
          <div className="w-64 bg-[#15202b] border-r border-slate-700 p-4 overflow-y-auto flex flex-col gap-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Categorías</p>
            {deliveries.map(d => (
              <button
                key={d.id}
                onClick={() => selectDelivery(d)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${selectedDelivery?.id === d.id ? 'bg-[#4a6478] text-white' : 'hover:bg-slate-700 text-slate-300'}`}
              >
                {d.name}
              </button>
            ))}
          </div>

          {/* Área central */}
          <div className="flex-1 p-6 overflow-y-auto">
            {selectedDelivery ? (
              <>
                <h2 className="font-bold text-white text-lg mb-5">{selectedDelivery.name}</h2>
                <div className="grid grid-cols-3 gap-4">
                  {images.map(img => (
                    <div
                      key={img.id}
                      className={`rounded-2xl overflow-hidden cursor-pointer shadow-lg ${statusBorder(img.status)} ${selectedImage?.id === img.id ? 'ring-2 ring-[#7ab82a]' : ''}`}
                      onClick={() => { selectImage(img); setLightbox(img) }}
                    >
                      <img src={img.url} alt={img.name} className="w-full h-48 object-cover" />
                      <div className="bg-[#15202b] px-3 py-2">{statusBadge(img.status)}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">Selecciona una categoría</div>
            )}
          </div>

          {/* Panel lateral derecho */}
          {selectedImage && (
            <div className="w-80 bg-[#15202b] border-l border-slate-700 p-4 overflow-y-auto">
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs text-slate-500 truncate flex-1 mr-2">{selectedImage.name}</p>
                <button onClick={() => setSelectedImage(null)} className="text-slate-400 hover:text-white transition-colors text-lg leading-none flex-shrink-0">✕</button>
              </div>
              <img
                src={selectedImage.url}
                alt={selectedImage.name}
                className="w-full rounded-xl mb-3 cursor-zoom-in"
                onClick={() => setLightbox(selectedImage)}
              />
              <div className="flex gap-2 mb-4">
                <button onClick={() => updateStatus('approved')} className="flex-1 bg-[#7ab82a] hover:bg-[#6aa020] text-white text-sm py-2.5 rounded-xl font-semibold transition-colors">✓ Aprobar</button>
                <button onClick={() => updateStatus('changes_requested')} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2.5 rounded-xl font-semibold transition-colors">✗ Cambios</button>
              </div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Comentarios</h3>
              {comments.length === 0 && <p className="text-slate-500 text-sm mb-3">Sin comentarios</p>}
              {comments.map(c => (
                <div key={c.id} className="bg-slate-700 border border-slate-600 rounded-xl p-3 mb-2">
                  <span className="font-semibold text-[#7ab82a] text-sm">{c.author}</span>
                  <p className="text-slate-300 text-sm mt-1">{c.content}</p>
                </div>
              ))}
              <div className="mt-4 space-y-2">
                <input
                  value={author}
                  onChange={e => setAuthor(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full bg-slate-700 text-white text-sm px-3 py-2.5 rounded-xl border border-slate-600 focus:outline-none focus:border-[#7ab82a] placeholder-slate-400"
                />
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Escribe un comentario..."
                  rows={3}
                  className="w-full bg-slate-700 text-white text-sm px-3 py-2.5 rounded-xl border border-slate-600 focus:outline-none focus:border-[#7ab82a] placeholder-slate-400 resize-none"
                />
                <button onClick={addComment} className="w-full bg-[#4a6478] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#3a5060] transition-colors">Comentar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
