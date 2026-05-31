import { NextRequest, NextResponse } from 'next/server'

// Compatibilidad con correos antiguos: el botón apuntaba a /aprobar/[token].
// Redirige al handler real que procesa la aprobación.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return NextResponse.redirect(new URL(`/api/approve/${token}`, req.url))
}
