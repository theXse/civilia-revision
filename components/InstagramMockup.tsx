'use client'

import { useEffect, useRef, useState } from 'react'
import type { Image as Img } from '@/lib/supabase'
import { thumbUrl } from '@/lib/imageUtils'

export const IG_USERNAME = 'inmobiliariacivilia'
const IG_CAPTION_MAX = 2200

/* ── Iconos estilo Instagram ─────────────────────────────────────────── */

function HeartIcon({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="#ff3040"><path d="M17.075 1.987a5.852 5.852 0 0 0-5.07 2.66l-.008-.012a5.878 5.878 0 0 0-10.85 3.09c0 2.885 1.945 5.418 3.573 7.117 2.099 2.19 4.858 4.093 6.638 5.093a1.343 1.343 0 0 0 1.288 0c1.78-1 4.538-2.902 6.637-5.093 1.628-1.699 3.573-4.232 3.573-7.117a5.885 5.885 0 0 0-5.78-5.738z"/></svg>
  ) : (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938z"/></svg>
  )
}

function CommentIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22z" strokeLinejoin="round"/></svg>
}

function ShareIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="22" y1="3" x2="9.218" y2="10.083" strokeLinejoin="round"/><polygon points="11.698 20.334 22 3.001 2 3.001 9.218 10.084 11.698 20.334" strokeLinejoin="round"/></svg>
}

function BookmarkIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="20 21 12 13.44 4 21 4 3 20 3 20 21" strokeLinejoin="round"/></svg>
}

function DotsIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="1.7"/><circle cx="6" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/></svg>
}

function BackIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 4 7 12 15 20" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

function HomeIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22 23h-6.001a1 1 0 0 1-1-1v-5.455a2.997 2.997 0 1 0-5.993 0V22a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V11.543a1.002 1.002 0 0 1 .31-.724l10-9.543a1.001 1.001 0 0 1 1.38 0l10 9.543a1.002 1.002 0 0 1 .31.724V22a1 1 0 0 1-1 1z"/></svg>
}

function SearchIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21.5" y1="21.5" x2="16.7" y2="16.7" strokeLinecap="round"/></svg>
}

function ReelsIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2.5" y="2.5" width="19" height="19" rx="5"/><line x1="2.5" y1="7.5" x2="21.5" y2="7.5"/><line x1="8" y1="2.5" x2="10.5" y2="7.5"/><line x1="14.5" y1="2.5" x2="17" y2="7.5"/><path d="M10 11.5l5 3-5 3z" fill="currentColor" strokeLinejoin="round"/></svg>
}

function ShopIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16l-1 14H5L4 7z" strokeLinejoin="round"/><path d="M8.5 9.5V6a3.5 3.5 0 0 1 7 0v3.5"/></svg>
}

/* ── Utilidades ──────────────────────────────────────────────────────── */

// Cifras estables por entrega (mismo id → mismos likes/comentarios)
function seedNumber(seed: string, min: number, range: number): number {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 100000
  return min + (h % range)
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diffMs / 3600000)
  if (hours < 1) return 'Hace unos minutos'
  if (hours < 24) return `Hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`
  const days = Math.floor(hours / 24)
  if (days <= 7) return `Hace ${days} ${days === 1 ? 'día' : 'días'}`
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
}

/* ── Componente principal ────────────────────────────────────────────── */

export default function InstagramMockup({ images, caption, location, date, onSaveCaption, onClose }: {
  images: Img[]
  caption: string
  location?: string
  date?: string
  /** Si se entrega, el mockup muestra el editor de copy (modo admin) */
  onSaveCaption?: (text: string) => Promise<void>
  onClose: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [liked, setLiked] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [bigHeart, setBigHeart] = useState(false)
  const [draft, setDraft] = useState(caption)
  const [savingCaption, setSavingCaption] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  // Relación ancho/alto del post — Instagram acepta entre 4:5 (0.8) y 1.91:1
  const [aspect, setAspect] = useState(0.8)
  const trackRef = useRef<HTMLDivElement>(null)

  const likes = seedNumber(images[0]?.id || 'x', 640, 2360) + (liked ? 1 : 0)
  const commentCount = seedNumber(images[0]?.id || 'x', 4, 28)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') goTo(idx + 1)
      if (e.key === 'ArrowLeft') goTo(idx - 1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  function goTo(i: number) {
    const track = trackRef.current
    if (!track || i < 0 || i >= images.length) return
    track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' })
  }

  function onTrackScroll() {
    const track = trackRef.current
    if (!track) return
    setIdx(Math.round(track.scrollLeft / track.clientWidth))
  }

  function onFirstImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget
    if (naturalWidth && naturalHeight) {
      setAspect(Math.min(1.91, Math.max(0.8, naturalWidth / naturalHeight)))
    }
  }

  function doubleTapLike() {
    setLiked(true)
    setBigHeart(true)
    setTimeout(() => setBigHeart(false), 700)
  }

  async function saveCaption() {
    if (!onSaveCaption) return
    setSavingCaption(true)
    try {
      await onSaveCaption(draft)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2000)
    } finally {
      setSavingCaption(false)
    }
  }

  const shownCaption = onSaveCaption ? draft : caption
  const needsCollapse = shownCaption.length > 125
  const captionText = expanded || !needsCollapse ? shownCaption : shownCaption.slice(0, 125).trimEnd()

  const avatar = (size: string, ring = false) => (
    <div className={`${ring ? 'bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] p-[2px]' : ''} rounded-full flex-shrink-0`}>
      <div className={`${size} rounded-full bg-white border border-gray-200 flex items-center justify-center overflow-hidden ${ring ? 'ring-2 ring-white' : ''}`}>
        <img src="/logo.png" alt={IG_USERNAME} className="w-[80%] object-contain" />
      </div>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="fixed top-4 right-5 z-10 text-white/80 hover:text-white text-3xl font-light"
        aria-label="Cerrar vista Instagram"
      >✕</button>

      <div
        className="flex flex-col lg:flex-row items-center lg:items-start gap-4 lg:gap-8 my-auto py-6"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Teléfono ── */}
        <div className="w-[330px] sm:w-[370px] flex-shrink-0 rounded-[2.8rem] bg-black p-[10px] shadow-2xl shadow-black/70 ring-1 ring-white/15">
          <div className="rounded-[2.2rem] bg-white overflow-hidden flex flex-col max-h-[86vh] text-black" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>

            {/* Barra de estado */}
            <div className="flex items-center justify-between px-7 pt-3 pb-1 text-[13px] font-semibold flex-shrink-0">
              <span>9:41</span>
              <div className="flex items-center gap-1.5">
                <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="0.6"/><rect x="4.3" y="5" width="3" height="6" rx="0.6"/><rect x="8.6" y="2.5" width="3" height="8.5" rx="0.6"/><rect x="12.9" y="0" width="3" height="11" rx="0.6"/></svg>
                <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor"><path d="M7.5 11 L10.5 7.3 A5 5 0 0 0 4.5 7.3 Z"/><path d="M7.5 5.6 c1.7 0 3.3 .7 4.5 1.8 l1.8-2.2 A9.8 9.8 0 0 0 7.5 2.5 a9.8 9.8 0 0 0-6.3 2.7 l1.8 2.2 A6.8 6.8 0 0 1 7.5 5.6" opacity="0.9"/></svg>
                <svg width="25" height="12" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="currentColor" opacity="0.4"/><rect x="2" y="2" width="15" height="8" rx="1.6" fill="currentColor"/><path d="M23 4v4a2.2 2.2 0 0 0 0-4z" fill="currentColor" opacity="0.4"/></svg>
              </div>
            </div>

            {/* Barra superior estilo "post desde el perfil" */}
            <div className="flex items-center px-3 py-2 border-b border-gray-200 flex-shrink-0">
              <BackIcon />
              <div className="flex-1 text-center -ml-[22px]">
                <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide leading-tight">{IG_USERNAME}</p>
                <p className="text-[15px] font-bold leading-tight">Publicaciones</p>
              </div>
            </div>

            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* Encabezado del post */}
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                {avatar('w-[34px] h-[34px]', true)}
                <div className="flex-1 min-w-0 leading-tight">
                  <p className="text-[13.5px] font-semibold truncate">{IG_USERNAME}</p>
                  {location && <p className="text-[11.5px] text-gray-700 truncate">{location}</p>}
                </div>
                <DotsIcon />
              </div>

              {/* Carrusel de láminas */}
              <div className="relative bg-gray-100" style={{ aspectRatio: `${aspect}` }}>
                {images.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Sin láminas en esta entrega</div>
                ) : (
                  <>
                    <div
                      ref={trackRef}
                      onScroll={onTrackScroll}
                      onDoubleClick={doubleTapLike}
                      className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
                      style={{ scrollbarWidth: 'none' }}
                    >
                      {images.map((img, i) => (
                        <img
                          key={img.id}
                          src={thumbUrl(img.url, 'panel')}
                          alt={`Lámina ${i + 1}`}
                          draggable={false}
                          onLoad={i === 0 ? onFirstImageLoad : undefined}
                          className="w-full h-full flex-none snap-center object-cover select-none"
                        />
                      ))}
                    </div>
                    {bigHeart && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <svg width="90" height="90" viewBox="0 0 24 24" fill="white" className="drop-shadow-lg animate-ping" style={{ animationIterationCount: 1, animationDuration: '0.7s' }}><path d="M17.075 1.987a5.852 5.852 0 0 0-5.07 2.66l-.008-.012a5.878 5.878 0 0 0-10.85 3.09c0 2.885 1.945 5.418 3.573 7.117 2.099 2.19 4.858 4.093 6.638 5.093a1.343 1.343 0 0 0 1.288 0c1.78-1 4.538-2.902 6.637-5.093 1.628-1.699 3.573-4.232 3.573-7.117a5.885 5.885 0 0 0-5.78-5.738z"/></svg>
                      </div>
                    )}
                    {images.length > 1 && (
                      <>
                        <div className="absolute top-3 right-3 bg-black/70 text-white text-[12px] px-2.5 py-0.5 rounded-full font-medium">
                          {idx + 1}/{images.length}
                        </div>
                        {idx > 0 && (
                          <button onClick={() => goTo(idx - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-700 hover:bg-white" aria-label="Anterior">‹</button>
                        )}
                        {idx < images.length - 1 && (
                          <button onClick={() => goTo(idx + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-700 hover:bg-white" aria-label="Siguiente">›</button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Fila de acciones */}
              <div className="relative flex items-center px-3 pt-2.5">
                <div className="flex items-center gap-4">
                  <button onClick={() => setLiked(!liked)} className={`transition-transform active:scale-125 ${liked ? '' : 'hover:opacity-60'}`} aria-label="Me gusta">
                    <HeartIcon filled={liked} />
                  </button>
                  <span className="hover:opacity-60"><CommentIcon /></span>
                  <span className="hover:opacity-60"><ShareIcon /></span>
                </div>
                {images.length > 1 && (
                  <div className="absolute inset-x-0 flex justify-center gap-[5px] pointer-events-none">
                    {images.map((_, i) => (
                      <span key={i} className={`rounded-full ${i === idx ? 'w-[6px] h-[6px] bg-[#0095f6]' : 'w-[5px] h-[5px] bg-gray-300'}`} />
                    ))}
                  </div>
                )}
                <button onClick={() => setBookmarked(!bookmarked)} className="ml-auto hover:opacity-60" aria-label="Guardar">
                  {bookmarked
                    ? <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="20 21 12 13.44 4 21 4 3 20 3 20 21"/></svg>
                    : <BookmarkIcon />}
                </button>
              </div>

              {/* Likes */}
              <p className="px-3 pt-2 text-[13.5px] font-semibold">{likes.toLocaleString('es-CL')} Me gusta</p>

              {/* Copy / caption */}
              <div className="px-3 pt-1 text-[13.5px] leading-[18px]">
                {shownCaption ? (
                  <p className={expanded || !needsCollapse ? 'whitespace-pre-line' : ''}>
                    <span className="font-semibold mr-1.5">{IG_USERNAME}</span>
                    {captionText}
                    {needsCollapse && !expanded && (
                      <>... <button onClick={() => setExpanded(true)} className="text-gray-400">más</button></>
                    )}
                    {needsCollapse && expanded && (
                      <> <button onClick={() => setExpanded(false)} className="text-gray-400">menos</button></>
                    )}
                  </p>
                ) : (
                  <p className="text-gray-400 italic">
                    <span className="font-semibold mr-1.5 text-black not-italic">{IG_USERNAME}</span>
                    {onSaveCaption ? 'Escribe el copy del post en el panel →' : 'Copy pendiente'}
                  </p>
                )}
              </div>

              <p className="px-3 pt-1.5 text-[13px] text-gray-500">Ver los {commentCount} comentarios</p>
              <p className="px-3 pt-1 pb-3 text-[11px] text-gray-400">{date ? relativeTime(date) : 'Hace 1 día'}</p>
            </div>

            {/* Barra inferior de navegación */}
            <div className="flex-shrink-0 border-t border-gray-200">
              <div className="flex items-center justify-between px-7 pt-2.5 pb-1">
                <HomeIcon /><SearchIcon /><ReelsIcon /><ShopIcon />
                {avatar('w-[24px] h-[24px]')}
              </div>
              <div className="h-1 w-28 bg-black rounded-full mx-auto mb-2 mt-1" />
            </div>
          </div>
        </div>

        {/* ── Editor de copy (solo admin) ── */}
        {onSaveCaption && (
          <div className="w-[330px] sm:w-[370px] lg:w-[340px] bg-[#15202b] rounded-2xl border border-slate-700 p-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="url(#igGrad)"><defs><linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#833ab4"/><stop offset="50%" stopColor="#fd1d1d"/><stop offset="100%" stopColor="#fcb045"/></linearGradient></defs><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              <h3 className="text-white font-bold text-sm">Copy del post</h3>
            </div>
            <p className="text-slate-400 text-xs mb-3">Se guarda por entrega y el cliente lo ve en su vista previa.</p>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value.slice(0, IG_CAPTION_MAX))}
              placeholder={'Vivir bien no es un lujo, es una decisión. 🏡\nDepartamentos nuevos de 3D y 2B desde UF 4.534...\n📍 Dirección\nCotiza hoy'}
              rows={9}
              className="w-full bg-slate-800 text-white text-sm px-3 py-2.5 rounded-xl border border-slate-600 focus:outline-none focus:border-pink-400 placeholder-slate-500 resize-none whitespace-pre-line"
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs ${draft.length > 125 ? 'text-slate-500' : 'text-slate-500'}`}>{draft.length}/{IG_CAPTION_MAX}</span>
              <span className="text-xs text-slate-500">Instagram corta el copy en ~125 caracteres</span>
            </div>
            <button
              onClick={saveCaption}
              disabled={savingCaption}
              className="w-full mt-3 bg-gradient-to-r from-purple-600 to-pink-500 hover:opacity-90 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl transition-opacity"
            >
              {savingCaption ? 'Guardando...' : savedOk ? '✓ Copy guardado' : 'Guardar copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
