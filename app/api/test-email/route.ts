import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { buildLinkApprovalEmail } from '@/lib/emailTemplates'

export async function GET() {
  const user = process.env.NOTIFY_GMAIL_USER
  const pass = process.env.NOTIFY_GMAIL_APP_PASSWORD

  if (!user || !pass) {
    return NextResponse.json({ error: 'Email no configurado.' }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://civilia-revision.vercel.app'
  const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } })

  // Ejemplo inventado para Santiago (Mauro)
  const { subject, html } = buildLinkApprovalEmail('Santiago', [
    {
      project_name: 'Jardín del Norte — Campaña Otoño',
      delivery_name: 'Carrusel 1 — 5 imágenes',
      delivery_id: 'test',
      facebook_link: 'https://facebook.com',
      approval_token: 'test-token-preview',
    }
  ], baseUrl)

  try {
    await transporter.sendMail({
      from: `"La Ruta" <${user}>`,
      to: 'ximena@laruta.ia, rafael@laruta.ai',
      subject: `[TEST] ${subject}`,
      html,
    })
    return NextResponse.json({ ok: true, message: 'Email de prueba enviado a ximena@laruta.ia y rafael@laruta.ai' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
