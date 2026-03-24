'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Region, Project, Delivery, Image as Img, Comment, ProjectComment } from '@/lib/supabase'
import Image from 'next/image'
import { thumbUrl } from '@/lib/imageUtils'

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
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [commenting, setCommenting] = useState(false)
  const [generalComments, setGeneralComments] = useState<ProjectComment[]>([])
  const [newGeneralComment, setNewGeneralComment] = useState('')
  const [showGeneralPanel, setShowGeneralPanel] = useState(false)

  useEffect(() => { loadRegion() }, [token])

  // Realtime + polling cada 8s para asegurar que el cliente vea los cambios del admin
  useEffect(() => {
    const imgChannel = supabase
      .channel('realtime-images')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'images' }, payload => {
        const updated = payload.new as Img
        setImages(prev => prev.map(i => i.id === updated.id ? updated : i))
        setSelectedImage(prev => prev?.id === updated.id ? updated : prev)
      })
      .subscribe()

    const cmtChannel = supabase
      .channel('realtime-comments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, payload => {
        if (payload.eventType === 'INSERT') {
          const c = payload.new as Comment
          setComments(prev => prev.some(x => x.id === c.id) ? prev : [...prev, c])
        } else if (payload.eventType === 'UPDATE') {
          const c = payload.new as Comment
          setComments(prev => prev.map(x => x.id === c.id ? c : x))
        } else if (payload.eventType === 'DELETE') {
          setComments(prev => prev.filter(x => x.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(imgChannel)
      supabase.removeChannel(cmtChannel)
    }
  }, [])

  // Polling cada 5s + refresco al ganar foco para mostrar cambios del admin en tiempo real
  useEffect(() => {
    if (!selectedDelivery) return
    const refresh = () => {
      supabase.from('images').select('*').eq('delivery_id', selectedDelivery.id).order('sort_order').order('created_at')
        .then(({ data }) => {
          if (data) {
            setImages(data)
            setSelectedImage(prev => prev ? (data.find(i => i.id === prev.id) ?? prev) : null)
          }
        })
    }
    const interval = setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh) }
  }, [selectedDelivery])

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
    const { data } = await supabase.from('deliveries').select('*').eq('project_id', projectId).order('sort_order').order('created_at', { ascending: false })
    const list = data || []
    setDeliveries(list)
    if (list.length > 0) {
      setSelectedDelivery(list[0])
      loadImages(list[0].id)
    }
  }

  async function loadImages(deliveryId: string) {
    const { data } = await supabase.from('images').select('*').eq('delivery_id', deliveryId).order('sort_order').order('created_at')
    setImages(data || [])
  }

  async function loadComments(imageId: string) {
    const { data } = await supabase.from('comments').select('*').eq('image_id', imageId).order('created_at')
    setComments(data || [])
  }

  async function addComment() {
    if (!newComment.trim() || !selectedImage) return
    const { data } = await supabase.from('comments').insert({ image_id: selectedImage.id, author: 'Cliente', content: newComment }).select().single()
    if (data) { setComments([...comments, data]); setNewComment('') }
  }

  async function loadGeneralComments(projectId: string) {
    const { data } = await supabase.from('project_comments').select('*').eq('project_id', projectId).order('created_at')
    setGeneralComments(data || [])
  }

  async function addGeneralComment() {
    if (!newGeneralComment.trim() || !selectedProject) return
    const { data } = await supabase.from('project_comments').insert({ project_id: selectedProject.id, author: 'Cliente', content: newGeneralComment.trim() }).select().single()
    if (data) { setGeneralComments(prev => [...prev, data]); setNewGeneralComment('') }
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
    setGeneralComments([])
    loadDeliveries(p.id)
    loadGeneralComments(p.id)
  }

  function selectDelivery(d: Delivery) {
    setSelectedDelivery(d)
    setSelectedImage(null)
    setComments([])
    loadImages(d.id)
    setSidebarOpen(false)
  }

  function selectImage(img: Img) {
    setSelectedImage(img)
    setLightbox(false)
    setCommenting(false)
    loadComments(img.id)
  }

  function navigateImage(dir: 'prev' | 'next') {
    if (!selectedImage) return
    const idx = images.findIndex(i => i.id === selectedImage.id)
    const newIdx = dir === 'next' ? idx + 1 : idx - 1
    if (newIdx >= 0 && newIdx < images.length) selectImage(images[newIdx])
  }

  // Keyboard: Escape cierra, flechas navegan
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!selectedImage) return
      if (e.key === 'Escape') { if (lightbox) setLightbox(false); else setSelectedImage(null) }
      if (e.key === 'ArrowRight') navigateImage('next')
      if (e.key === 'ArrowLeft') navigateImage('prev')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedImage, images, lightbox])

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
    s === 'revised' ? 'border-yellow-400 border-4' :
    'border-slate-600 border-2'

  const statusBadge = (s: string) =>
    s === 'approved'
      ? <span className="bg-[#7ab82a] text-white text-xs px-2 py-0.5 rounded-full font-medium">Aprobado</span>
      : s === 'changes_requested'
      ? <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">Cambios</span>
      : s === 'revised'
      ? <span className="bg-yellow-400 text-black text-xs px-2 py-0.5 rounded-full font-medium">Revisado ★</span>
      : <span className="bg-slate-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">Pendiente</span>

  if (loading) return <div className="min-h-screen bg-[#1e2a36] flex items-center justify-center text-slate-300">Cargando...</div>
  if (error) return <div className="min-h-screen bg-[#1e2a36] text-red-400 flex items-center justify-center">{error}</div>

  return (
    <div className="min-h-screen bg-[#1e2a36] flex flex-col">
      {/* Lightbox fullscreen */}
      {lightbox && selectedImage && (
        <div
          className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 bg-black/60 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl hover:bg-black/80"
            onClick={() => setLightbox(false)}
          >✕</button>
          <img
            src={thumbUrl(selectedImage.url, 'full')}
            alt={selectedImage.name}
            className="max-h-full max-w-full object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Modal de imagen: izquierda imagen, derecha acciones (mobile: apilado) */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-[#1e2a36] flex flex-col md:flex-row overflow-hidden" style={{height: '100dvh'}}>
          {/* Lado izquierdo: imagen grande con flechas — se oculta en mobile al comentar */}
          <div className={`bg-black flex items-center justify-center min-h-0 relative select-none md:flex-1 ${commenting ? 'hidden md:flex' : 'flex-1'}`}>
            {/* Cerrar */}
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 z-10 bg-black/60 text-white w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-black/80 transition-colors"
            >✕</button>

            {/* Contador */}
            <div className="absolute top-4 left-4 z-10 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full">
              Lámina {images.findIndex(i => i.id === selectedImage.id) + 1} / {images.length}
            </div>

            {/* Flecha izquierda */}
            {images.findIndex(i => i.id === selectedImage.id) > 0 && (
              <button
                onClick={() => navigateImage('prev')}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-[#7ab82a] hover:bg-[#6aa020] text-white w-14 h-14 rounded-full flex items-center justify-center text-3xl font-bold shadow-lg shadow-black/40 transition-all hover:scale-105"
              >‹</button>
            )}

            {/* Flecha derecha */}
            {images.findIndex(i => i.id === selectedImage.id) < images.length - 1 && (
              <button
                onClick={() => navigateImage('next')}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-[#7ab82a] hover:bg-[#6aa020] text-white w-14 h-14 rounded-full flex items-center justify-center text-3xl font-bold shadow-lg shadow-black/40 transition-all hover:scale-105"
              >›</button>
            )}

            <img
              src={thumbUrl(selectedImage.url, 'full')}
              alt={selectedImage.name}
              className="max-h-full max-w-full object-contain cursor-zoom-in"
              onClick={() => setLightbox(true)}
            />
          </div>

          {/* Lado derecho: acciones y comentarios */}
          <div className="w-full md:w-96 bg-[#15202b] border-t md:border-t-0 md:border-l border-slate-700 flex flex-col overflow-hidden md:max-h-full max-h-[45vh]">
            {/* Header del panel */}
            <div className="px-4 pt-4 pb-3 flex-shrink-0">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  {statusBadge(selectedImage.status)}
                  <p className="text-white text-sm font-semibold truncate">Lámina {images.findIndex(i => i.id === selectedImage.id) + 1}</p>
                </div>
              </div>

              {/* Banner revisado */}
              {selectedImage.status === 'revised' && (
                <div className="mb-3 bg-yellow-400/10 border border-yellow-400/40 rounded-xl px-3 py-2.5 text-yellow-300 text-xs text-center font-medium">
                  El equipo realizó los cambios solicitados. Por favor revisa y aprueba.
                </div>
              )}

              {/* Banner publicado */}
              {selectedImage.published && (
                <div className="mb-3 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600/20 to-pink-500/20 border border-pink-500/30 rounded-xl px-3 py-2.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="url(#ig)"><defs><linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#833ab4"/><stop offset="50%" stopColor="#fd1d1d"/><stop offset="100%" stopColor="#fcb045"/></linearGradient></defs><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                  <span className="text-xs font-semibold text-pink-300">Publicado en Instagram</span>
                </div>
              )}

              {/* Botones aprobar/cambios */}
              <div className="flex gap-2">
                <button
                  onClick={() => updateStatus('approved')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold transition-all ${selectedImage.status === 'approved' ? 'bg-[#7ab82a] text-white' : 'bg-slate-700 text-slate-300 hover:bg-[#7ab82a] hover:text-white'}`}
                >✓ Aprobar</button>
                <button
                  onClick={() => updateStatus('changes_requested')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold transition-all ${selectedImage.status === 'changes_requested' ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-red-500 hover:text-white'}`}
                >✗ Cambios</button>
              </div>
            </div>

            {/* Comentarios (scrollable) */}
            <div className="flex-1 overflow-y-auto px-4 py-3 border-t border-slate-700/50 space-y-2">
              {comments.length === 0 && <p className="text-slate-600 text-sm text-center py-4">Sin comentarios</p>}
              {comments.map(c => (
                <div key={c.id} className={`rounded-xl px-3 py-2.5 ${c.resolved ? 'bg-slate-800/40' : 'bg-slate-800'}`}>
                  <p className={`text-sm ${c.resolved ? 'line-through text-slate-500' : 'text-slate-300'}`}>{c.content}</p>
                  {c.resolved && <p className="text-xs text-slate-600 mt-0.5">Resuelto</p>}
                </div>
              ))}
            </div>

            {/* Input de comentario — desktop */}
            <div className="hidden md:block px-4 py-3 border-t border-slate-700 flex-shrink-0">
              <div className="flex gap-2">
                <input
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addComment()}
                  placeholder="Escribe un comentario..."
                  className="flex-1 bg-slate-700 text-white text-sm px-4 py-3 rounded-xl border border-slate-600 focus:outline-none focus:border-[#7ab82a] placeholder-slate-500"
                />
                <button
                  onClick={addComment}
                  className="bg-[#4a6478] text-white px-5 py-3 rounded-xl text-sm font-semibold hover:bg-[#3a5060] transition-colors flex-shrink-0"
                >Enviar</button>
              </div>
            </div>

            {/* Botón abrir comentario — mobile */}
            <div className="md:hidden px-4 py-3 border-t border-slate-700 flex-shrink-0">
              <button
                onClick={() => setCommenting(true)}
                className="w-full bg-slate-700 text-slate-300 text-sm py-3 rounded-xl hover:bg-slate-600 transition-colors"
              >+ Agregar comentario</button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay mobile para escribir comentario */}
      {commenting && selectedImage && (
        <div className="fixed inset-0 z-[60] md:hidden flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setCommenting(false); setNewComment('') }} />
          <div className="relative bg-[#15202b] rounded-t-2xl px-4 pt-4 pb-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white text-sm font-semibold">Agregar comentario</p>
              <button onClick={() => { setCommenting(false); setNewComment('') }} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>
            <div className="flex gap-2">
              <input
                autoFocus
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (addComment(), setCommenting(false))}
                placeholder="Escribe tu comentario..."
                className="flex-1 bg-slate-700 text-white text-base px-4 py-3.5 rounded-xl border border-slate-600 focus:outline-none focus:border-[#7ab82a] placeholder-slate-500"
              />
              <button
                onClick={() => { addComment(); setCommenting(false) }}
                disabled={!newComment.trim()}
                className="bg-[#7ab82a] disabled:opacity-40 text-white px-5 py-3 rounded-xl text-sm font-bold hover:bg-[#6aa020] transition-colors flex-shrink-0"
              >Enviar</button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Header */}
      <header className="bg-[#15202b] shadow-md px-4 md:px-8 py-3 md:py-4 flex items-center gap-3">
        {selectedProject && (
          <button
            className="md:hidden text-slate-300 hover:text-white p-1"
            onClick={() => setSidebarOpen(true)}
            aria-label="Ver categorías"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        )}
        <div className="bg-white rounded-lg px-2.5 py-1 md:px-3 md:py-1.5">
          <Image src="/logo.png" alt="Civilia" width={90} height={28} className="object-contain" />
        </div>
        <div className="hidden md:block h-8 w-px bg-slate-600" />
        <div className="flex-1">
          <h1 className="font-bold text-white text-sm md:text-lg leading-tight">
            {selectedProject ? selectedProject.name : region?.name}
          </h1>
          <p className="text-slate-400 text-xs hidden md:block">Portal de Revisión</p>
        </div>
        {selectedProject && (
          <button onClick={goBack} className="text-xs bg-slate-700 text-slate-200 px-3 py-2 rounded-lg hover:bg-slate-600 transition-colors">← Volver</button>
        )}
      </header>

      {/* Lista de proyectos */}
      {!selectedProject && (
        <div className="flex-1 p-4 md:p-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-white font-semibold text-base md:text-lg mb-4 md:mb-6">Proyectos</h2>
            {projects.length === 0 ? (
              <p className="text-slate-500 text-center py-16">No hay proyectos en esta región</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {projects.map(p => (
                  <div key={p.id} className="bg-[#15202b] rounded-2xl overflow-hidden shadow-lg border border-slate-700">
                    <div className="bg-[#4a6478] px-4 md:px-5 py-3">
                      <h3 className="text-white font-semibold text-sm">{p.name}</h3>
                    </div>
                    <div className="px-4 md:px-5 py-4">
                      <button
                        onClick={() => selectProject(p)}
                        className="w-full bg-[#7ab82a] hover:bg-[#6aa020] text-white text-sm py-3 rounded-xl font-semibold transition-colors"
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

      {/* Vista de proyecto con categorías */}
      {selectedProject && (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar de categorías */}
          <div className={`
            fixed top-0 left-0 h-full z-40 w-72 bg-[#15202b] border-r border-slate-700 p-4 overflow-y-auto flex flex-col gap-2 transition-transform duration-200
            md:relative md:w-64 md:translate-x-0 md:z-auto
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}>
            <div className="flex items-center justify-between mb-1 md:hidden">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Categorías</p>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>
            <p className="hidden md:block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Categorías</p>
            {deliveries.map(d => (
              <button
                key={d.id}
                onClick={() => selectDelivery(d)}
                className={`w-full text-left px-3 py-3 rounded-xl text-sm font-medium transition-colors ${selectedDelivery?.id === d.id ? 'bg-[#4a6478] text-white' : 'hover:bg-slate-700 text-slate-300'}`}
              >
                {d.name}
              </button>
            ))}
          </div>

          {/* Área central con imágenes */}
          <div className="flex-1 p-4 md:p-6 overflow-y-auto">
            {selectedDelivery ? (
              <>
                <h2 className="font-bold text-white text-base md:text-lg mb-4 md:mb-5">{selectedDelivery.name}</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                  {images.map((img, idx) => (
                    <div
                      key={img.id}
                      className={`rounded-2xl overflow-hidden cursor-pointer shadow-lg ${statusBorder(img.status)} ${selectedImage?.id === img.id ? 'ring-2 ring-[#7ab82a]' : ''}`}
                      onClick={() => selectImage(img)}
                    >
                      <div className="relative h-36 md:h-48 bg-slate-700">
                        <img
                          src={thumbUrl(img.url, 'grid')}
                          alt={img.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                        {img.published && (
                          <div className="absolute top-2 right-2 bg-gradient-to-tr from-purple-600 to-pink-500 rounded-full w-6 h-6 flex items-center justify-center shadow">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                          </div>
                        )}
                      </div>
                      <div className="bg-[#15202b] px-2 md:px-3 py-2 flex items-center justify-between">
                        {statusBadge(img.status)}
                        <span className="text-slate-400 text-xs font-medium">Lámina {idx + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                {deliveries.length === 0 ? 'No hay categorías en este proyecto' : 'Selecciona una categoría'}
              </div>
            )}
          </div>

          {/* Botón comentario general flotante */}
          {selectedProject && (
            <button
              onClick={() => setShowGeneralPanel(true)}
              className="fixed bottom-6 right-6 z-30 flex items-center gap-2 bg-[#4a6478] hover:bg-[#3a5060] text-white px-4 py-3 rounded-full shadow-lg transition-colors text-sm font-medium"
            >
              💬 Comentario general
              {generalComments.length > 0 && (
                <span className="bg-yellow-400 text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{generalComments.length}</span>
              )}
            </button>
          )}

          {/* Panel comentarios generales */}
          {showGeneralPanel && (
            <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
              <div className="absolute inset-0 bg-black/60" onClick={() => setShowGeneralPanel(false)} />
              <div className="relative bg-[#15202b] rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                  <h3 className="font-bold text-white">Comentario general</h3>
                  <button onClick={() => setShowGeneralPanel(false)} className="text-slate-400 hover:text-white">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {generalComments.length === 0 && (
                    <p className="text-slate-500 text-sm text-center py-4">Escribe aquí tus comentarios generales sobre este envío</p>
                  )}
                  {generalComments.map(c => (
                    <div key={c.id} className="bg-slate-700 rounded-xl px-3 py-2.5">
                      <p className="text-slate-300 text-sm whitespace-pre-wrap">{c.content}</p>
                      <p className="text-slate-500 text-xs mt-1">{new Date(c.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 border-t border-slate-700 flex gap-2">
                  <textarea
                    value={newGeneralComment}
                    onChange={e => setNewGeneralComment(e.target.value)}
                    placeholder="Escribe tu comentario general..."
                    rows={3}
                    className="flex-1 bg-slate-700 text-white text-sm px-3 py-2 rounded-xl border border-slate-600 focus:outline-none focus:border-[#7ab82a] placeholder-slate-500 resize-none"
                  />
                  <button
                    onClick={addGeneralComment}
                    disabled={!newGeneralComment.trim()}
                    className="self-end bg-[#7ab82a] hover:bg-[#6aa020] text-white px-4 py-2 rounded-xl font-bold disabled:opacity-40 transition-colors"
                  >→</button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
