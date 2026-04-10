import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Find the delivery by approval_token
  const { data: delivery } = await supabase
    .from('deliveries')
    .select('*, projects(*)')
    .eq('approval_token', token)
    .single()

  if (!delivery) {
    return NextResponse.redirect(new URL('/aprobado?error=1', req.url))
  }

  // Mark as approved
  const client_approved_at = new Date().toISOString()
  await supabase.from('deliveries').update({ client_approved_at }).eq('id', delivery.id)

  // Send immediate email to Ximena + Erika
  const user = process.env.NOTIFY_GMAIL_USER
  const pass = process.env.NOTIFY_GMAIL_APP_PASSWORD

  if (user && pass) {
    const project = delivery.projects as { name: string; region: string }
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0">
        <h2 style="margin:0 0 16px;color:#16a34a;font-size:18px">✅ Cliente aprobó la campaña</h2>
        <p style="margin:0 0 8px"><strong>Proyecto:</strong> ${project?.name}</p>
        <p style="margin:0 0 8px"><strong>Categoría:</strong> ${delivery.name}</p>
        <p style="margin:0 0 8px"><strong>Ciudad:</strong> ${project?.region}</p>
        <p style="margin:0;font-size:13px;color:#64748b">Aprobado el ${new Date().toLocaleString('es-CL')}</p>
      </div>
    `
    try {
      await transporter.sendMail({
        from: `"La Ruta" <${user}>`,
        to: 'ximena@laruta.ia, erika@laruta.ai',
        subject: `✅ Aprobado: ${project?.name} — ${delivery.name}`,
        html,
      })
    } catch (e) {
      console.error('Error sending approval email:', e)
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://civilia-revision.vercel.app'
  return NextResponse.redirect(new URL(`/aprobado?name=${encodeURIComponent(delivery.name)}`, baseUrl))
}
