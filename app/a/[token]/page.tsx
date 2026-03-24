'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Project, Delivery, Image as Img, Comment, Region } from '@/lib/supabase'
import Image from 'next/image'
import { thumbUrl, resizeForUpload } from '@/lib/imageUtils'

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
  const [region, setRegion] = useState<Region | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})

  useEffect(() => { loadProject() }, [token])

  // Realtime: refleja aprobaciones/cambios del cliente en tiempo real
  useEffect(() => {
    const imgChannel = supabase
      .channel('admin-realtime-images')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'images' }, payload => {
        const updated = payload.new as Img
        setImages(prev => prev.map(i => i.id === updated.id ? updated : i))
        setSelectedImage(prev => prev?.id === updated.id ? updated : prev)
      })
      .subscribe()

    const cmtChannel = supabase
      .channel('admin-realtime-comments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, payload => {
        const c = payload.new as Comment
        setComments(prev => prev.some(x => x.id === c.id) ? prev : [...prev, c])
        setCommentCounts(prev => ({ ...prev, [c.image_id]: (prev[c.image_id] || 0) + 1 }))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(imgChannel)
      supabase.removeChannel(cmtChannel)
    }
  }, [])

  async function loadProject() {
    const { data } = await supabase.from('projects').select('*').eq('admin_token', token).single()
    if (data) {
      setProject(data)
      loadDeliveries(data.id)
      const { data: regionData } = await supabase.from('regions').select('*').eq('name', data.region).single()
      if (regionData) setRegion(regionData)
    } else {
      setError('Proyecto no encontrado')
    }
    setLoading(false)
  }

  async function loadDeliveries(projectId: string) {
    const { data } = await supabase.from('deliveries').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
    const list = data || []
    setDeliveries(list)
    if (list.length > 0) {
      setSelectedDelivery(list[0])
      loadImages(list[0].id)
    }
  }

  async function loadImages(deliveryId: string) {
    const { data } = await supabase.from('images').select('*').eq('delivery_id', deliveryId).order('created_at')
    const imgs = data || []
    setImages(imgs)
    if (imgs.length > 0) {
      const { data: cData } = await supabase
        .from('comments').select('image_id').in('image_id', imgs.map(i => i.id))
      const counts: Record<string, number> = {}
      for (const c of (cData || [])) counts[c.image_id] = (counts[c.image_id] || 0) + 1
      setCommentCounts(counts)
    }
  }

  async function loadComments(imageId: string) {
    const { data } = await supabase.from('comments').select('*').eq('image_id', imageId).order('created_at')
    setComments(data || [])
  }

  async function createDelivery() {
    if (!newDelivery.trim() || !project) return
    const { data, error: insertError } = await supabase.from('deliveries').insert({ project_id: project.id, name: newDelivery }).select().single()
    if (insertError) { alert('Error al crear categoría: ' + insertError.message); return }
    if (data) { setDeliveries([data, ...deliveries]); setNewDelivery('') }
  }

  async function deleteDelivery(deliveryId: string) {
    if (!window.confirm('¿Eliminar esta categoría y todas sus imágenes?')) return
    await supabase.from('images').delete().eq('delivery_id', deliveryId)
    await supabase.from('deliveries').delete().eq('id', deliveryId)
    setDeliveries(deliveries.filter(d => d.id !== deliveryId))
    if (selectedDelivery?.id === deliveryId) { setSelectedDelivery(null); setImages([]) }
  }

  async function uploadImages(files: FileList) {
    if (!selectedDelivery) return
    setUploading(true)
    for (const original of Array.from(files)) {
      const file = await resizeForUpload(original)
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

  async function toggleResolve(commentId: string, current: boolean) {
    await supabase.from('comments').update({ resolved: !current }).eq('id', commentId)
    setComments(comments.map(c => c.id === commentId ? { ...c, resolved: !current } : c))
  }

  async function markRevised() {
    if (!selectedImage) return
    await supabase.from('images').update({ status: 'revised' }).eq('id', selectedImage.id)
    const updated = { ...selectedImage, status: 'revised' as const }
    setSelectedImage(updated)
    setImages(images.map(i => i.id === selectedImage.id ? updated : i))
  }

  function selectDelivery(d: Delivery) {
    setSelectedDelivery(d)
    setSelectedImage(null)
    setComments([])
    loadImages(d.id)
    setSidebarOpen(false)
  }

  function selectImage(img: Img) { setSelectedImage(img); loadComments(img.id) }

  async function exportCSV() {
    if (!project) return
    // Fetch all deliveries
    const { data: allDeliveries } = await supabase.from('deliveries').select('*').eq('project_id', project.id)
    if (!allDeliveries?.length) { alert('No hay datos para exportar'); return }
    // Fetch all images
    const deliveryIds = allDeliveries.map(d => d.id)
    const { data: allImages } = await supabase.from('images').select('*').in('delivery_id', deliveryIds).order('created_at')
    if (!allImages?.length) { alert('No hay imágenes para exportar'); return }
    // Fetch all comments
    const imageIds = allImages.map(i => i.id)
    const { data: allComments } = await supabase.from('comments').select('*').in('image_id', imageIds).order('created_at')
    // Build CSV
    const deliveryMap = Object.fromEntries(allDeliveries.map(d => [d.id, d.name]))
    const statusLabel = (s: string) => s === 'approved' ? 'Aprobado' : s === 'changes_requested' ? 'Cambios solicitados' : 'Pendiente'
    const rows: string[][] = [['Proyecto', 'Categoría', 'Lámina', 'Estado', 'Comentario', 'Fecha']]
    for (const img of allImages) {
      const imgComments = (allComments || []).filter(c => c.image_id === img.id)
      if (imgComments.length === 0) {
        rows.push([project.name, deliveryMap[img.delivery_id] || '', img.name, statusLabel(img.status), '', ''])
      } else {
        for (const c of imgComments) {
          const date = new Date(c.created_at).toLocaleString('es-CL')
          rows.push([project.name, deliveryMap[img.delivery_id] || '', img.name, statusLabel(img.status), c.content, date])
        }
      }
    }
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const bom = '\uFEFF'
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name}-reporte.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const statusBorder = (s: string) => s === 'approved' ? 'border-[#7ab82a] border-4' : s === 'changes_requested' ? 'border-red-500 border-4' : s === 'revised' ? 'border-yellow-400 border-4' : 'border-slate-600 border-2'
  const statusBadge = (s: string) => s === 'approved'
    ? <span className="bg-[#7ab82a] text-white text-xs px-2 py-0.5 rounded-full font-medium">Aprobado</span>
    : s === 'changes_requested'
    ? <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">Cambios</span>
    : s === 'revised'
    ? <span className="bg-yellow-400 text-black text-xs px-2 py-0.5 rounded-full font-medium">Revisado</span>
    : <span className="bg-slate-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">Pendiente</span>

  if (loading) return <div className="min-h-screen bg-[#1e2a36] flex items-center justify-center text-slate-300">Cargando...</div>
  if (error) return <div className="min-h-screen bg-[#1e2a36] text-red-400 flex items-center justify-center">{error}</div>

  return (
    <div className="min-h-screen bg-[#1e2a36] flex flex-col">
      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={thumbUrl(lightbox.url, 'full')} alt={lightbox.name} className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl" />
          <button className="absolute top-4 right-6 text-white text-3xl font-bold" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Header */}
      <header className="bg-[#15202b] shadow-md px-4 md:px-8 py-3 md:py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            className="md:hidden text-slate-300 hover:text-white p-1"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir categorías"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="bg-white rounded-lg px-2.5 py-1 md:px-3 md:py-1.5">
            <Image src="/logo.png" alt="Civilia" width={90} height={28} className="object-contain md:!w-[110px] md:!h-[34px]" />
          </div>
          <div className="hidden md:block h-8 w-px bg-slate-600" />
          <div className="hidden md:block">
            <h1 className="font-bold text-white text-lg leading-tight">{project?.name}</h1>
            <p className="text-slate-400 text-xs">{project?.region} · Admin</p>
          </div>
        </div>
        <div className="flex gap-2">
          <a href="/" className="text-xs bg-slate-700 text-slate-200 px-3 py-2 rounded-lg hover:bg-slate-600 transition-colors">← Inicio</a>
          <button
            onClick={exportCSV}
            className="text-xs bg-slate-700 text-slate-200 px-3 py-2 rounded-lg hover:bg-slate-600 transition-colors"
            title="Descargar reporte CSV"
          >
            <span className="hidden sm:inline">Exportar </span>↓
          </button>
          {region && (
            <a href={`/r/${region.client_token}`} target="_blank" className="text-xs bg-[#7ab82a] text-white px-3 py-2 rounded-lg hover:bg-[#6aa020] transition-colors font-medium">
              <span className="hidden sm:inline">Ver cliente </span>↗
            </a>
          )}
        </div>
      </header>

      {/* Mobile project title */}
      <div className="md:hidden bg-[#15202b] px-4 pb-3 border-b border-slate-700">
        <h1 className="font-bold text-white text-base">{project?.name}</h1>
        <p className="text-slate-400 text-xs">{project?.region} · Admin</p>
      </div>

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
          <div className="flex gap-2">
            <input
              value={newDelivery}
              onChange={e => setNewDelivery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createDelivery()}
              placeholder="Nueva categoría..."
              className="flex-1 bg-slate-700 text-white text-sm px-3 py-2.5 rounded-lg border border-slate-600 focus:outline-none focus:border-[#7ab82a] placeholder-slate-400"
            />
            <button
              onClick={createDelivery}
              disabled={!newDelivery.trim()}
              className="bg-[#7ab82a] text-white px-4 py-2.5 rounded-lg text-lg font-bold hover:bg-[#6aa020] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >+</button>
          </div>
          {deliveries.map(d => {
            // Contar comentarios en imágenes de esta categoría
            const deliveryComments = images
              .filter(img => img.delivery_id === d.id)
              .reduce((sum, img) => sum + (commentCounts[img.id] || 0), 0)
            const hasChanges = images.filter(img => img.delivery_id === d.id && img.status === 'changes_requested').length
            return (
              <div key={d.id} className={`flex items-center rounded-xl transition-colors ${selectedDelivery?.id === d.id ? 'bg-[#4a6478]' : 'hover:bg-slate-700'}`}>
                <button
                  onClick={() => selectDelivery(d)}
                  className={`flex-1 text-left px-3 py-3 text-sm font-medium truncate ${selectedDelivery?.id === d.id ? 'text-white' : 'text-slate-300'}`}
                >{d.name}</button>
                <div className="flex items-center gap-1 pr-1">
                  {deliveryComments > 0 && (
                    <span className="bg-yellow-400 text-black text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">{deliveryComments}</span>
                  )}
                  {hasChanges > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">{hasChanges}</span>
                  )}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteDelivery(d.id) }}
                  className="px-2 py-3 text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"
                  title="Eliminar categoría"
                >✕</button>
              </div>
            )
          })}
        </div>

        {/* Área principal */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto">
          {selectedDelivery ? (
            <>
              <div className="flex items-center justify-between mb-4 md:mb-5">
                <h2 className="font-bold text-white text-base md:text-lg">{selectedDelivery.name}</h2>
                <label className={`cursor-pointer bg-[#4a6478] text-white px-3 md:px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-[#3a5060] transition-colors ${uploading ? 'opacity-50' : ''}`}>
                  {uploading ? 'Subiendo...' : '+ Subir'}
                  <input type="file" multiple accept="image/*" className="hidden" onChange={e => e.target.files && uploadImages(e.target.files)} disabled={uploading} />
                </label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    className={`relative rounded-2xl overflow-hidden cursor-pointer group shadow-lg ${statusBorder(img.status)} ${selectedImage?.id === img.id ? 'ring-2 ring-white/30' : ''}`}
                    onClick={() => selectImage(img)}
                  >
                    <div className="relative h-36 md:h-48 bg-slate-700">
                      <img
                        src={thumbUrl(img.url, 'grid')}
                        alt={`Lámina ${idx + 1}`}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                      {commentCounts[img.id] > 0 && (
                        <div className="absolute top-2 left-2 bg-yellow-400 text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                          {commentCounts[img.id]}
                        </div>
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-[#15202b]/95 px-2 md:px-3 py-2 flex justify-between items-center">
                      {statusBadge(img.status)}
                      <span className="text-slate-400 text-xs font-medium">Lámina {idx + 1}</span>
                      <button
                        onClick={e => { e.stopPropagation(); deleteImage(img.id) }}
                        className="text-red-400 hover:text-red-300 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              {deliveries.length === 0 ? 'Crea una categoría para comenzar' : 'Selecciona una categoría'}
            </div>
          )}
        </div>

        {/* Panel de comentarios — mobile: overlay full screen, desktop: panel lateral */}
        {selectedImage && (
          <div className="fixed inset-0 z-40 bg-[#15202b] overflow-y-auto p-4 md:relative md:inset-auto md:z-auto md:w-80 md:border-l md:border-slate-700 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-semibold text-white truncate flex-1 mr-2">Lámina {images.findIndex(i => i.id === selectedImage.id) + 1}</p>
              <button onClick={() => setSelectedImage(null)} className="text-slate-400 hover:text-white p-1 flex-shrink-0">✕</button>
            </div>
            <img
              src={thumbUrl(selectedImage.url, 'panel')}
              alt={selectedImage.name}
              className="w-full rounded-xl mb-3 cursor-zoom-in"
              onClick={() => setLightbox(selectedImage)}
            />
            <button
              onClick={() => setLightbox(selectedImage)}
              className="w-full text-xs bg-slate-700 text-slate-300 py-2 rounded-xl mb-4 hover:bg-slate-600 transition-colors"
            >🔍 Ver imagen completa</button>

            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-300">Comentarios del cliente</h3>
              {comments.length > 0 && (
                <span className="text-xs bg-[#7ab82a] text-white px-2 py-0.5 rounded-full">{comments.filter(c => !c.resolved).length}/{comments.length}</span>
              )}
            </div>
            {comments.length === 0
              ? <p className="text-slate-500 text-sm">Sin comentarios aún</p>
              : comments.map(c => (
                <div key={c.id} className={`border rounded-xl p-3 mb-2 transition-colors ${c.resolved ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-700 border-slate-600'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <span className={`font-semibold text-sm ${c.resolved ? 'text-slate-500' : 'text-[#7ab82a]'}`}>{c.author}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleResolve(c.id, c.resolved)}
                        title={c.resolved ? 'Marcar como pendiente' : 'Marcar como resuelto'}
                        className={`text-xs px-2 py-0.5 rounded-lg transition-colors ${c.resolved ? 'bg-slate-600 text-slate-400 hover:bg-slate-500' : 'bg-[#7ab82a]/20 text-[#7ab82a] hover:bg-[#7ab82a]/40'}`}
                      >{c.resolved ? '↩' : '✓'}</button>
                      <button onClick={() => deleteComment(c.id)} className="text-red-400 hover:text-red-300 text-xs p-0.5">✕</button>
                    </div>
                  </div>
                  <p className={`text-sm ${c.resolved ? 'line-through text-slate-500' : 'text-slate-300'}`}>{c.content}</p>
                  <p className="text-slate-600 text-xs mt-1">{new Date(c.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              ))
            }
            {comments.length > 0 && comments.every(c => c.resolved) && selectedImage?.status !== 'approved' && selectedImage?.status !== 'revised' && (
              <button
                onClick={markRevised}
                className="w-full mt-3 bg-yellow-400 hover:bg-yellow-300 text-black text-sm font-bold py-3 rounded-xl transition-colors"
              >Listo para revisar →</button>
            )}
            {selectedImage?.status === 'revised' && (
              <div className="mt-3 bg-yellow-400/10 border border-yellow-400/30 rounded-xl px-3 py-2.5 text-yellow-400 text-xs text-center">
                Esperando aprobación del cliente
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
