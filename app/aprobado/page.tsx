'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function AprobadoContent() {
  const params = useSearchParams()
  const name = params.get('name')
  const error = params.get('error')

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Link inválido</h1>
          <p className="text-slate-500 text-sm">Este link de aprobación no es válido o ya fue usado.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">¡Campaña aprobada!</h1>
        {name && <p className="text-slate-600 mb-1 font-medium">{name}</p>}
        <p className="text-slate-500 text-sm mt-3">Gracias. El equipo de La Ruta ha sido notificado.</p>
      </div>
    </div>
  )
}

export default function AprobadoPage() {
  return (
    <Suspense>
      <AprobadoContent />
    </Suspense>
  )
}
