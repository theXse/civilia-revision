import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function GET() {
  const user = process.env.NOTIFY_GMAIL_USER
  const pass = process.env.NOTIFY_GMAIL_APP_PASSWORD

  if (!user || !pass) {
    return NextResponse.json({ error: 'Email no configurado. Agrega NOTIFY_GMAIL_USER y NOTIFY_GMAIL_APP_PASSWORD en Vercel.' }, { status: 500 })
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  })

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0">
      <h2 style="margin:0 0 16px;color:#16a34a;font-size:18px">✅ Test de notificaciones — La Ruta</h2>
      <p style="margin:0 0 8px">El sistema de notificaciones está funcionando correctamente.</p>
      <p style="margin:0;font-size:13px;color:#64748b">Este es un email de prueba enviado desde civilia-revision.vercel.app</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: `"La Ruta" <${user}>`,
      to: 'ximena@laruta.ia, rafael@laruta.ai',
      subject: '✅ Test de notificaciones — La Ruta',
      html,
    })
    return NextResponse.json({ ok: true, message: 'Email enviado a ximena@laruta.ia y rafael@laruta.ai' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
