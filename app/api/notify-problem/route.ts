import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest) {
  const { projectName, deliveryName, problemNotes, region } = await req.json()

  const user = process.env.NOTIFY_GMAIL_USER
  const pass = process.env.NOTIFY_GMAIL_APP_PASSWORD

  if (!user || !pass) {
    console.error('Email not configured')
    return NextResponse.json({ ok: true }) // Fail silently
  }

  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#fef2f2;border-radius:12px;border:1px solid #fecaca">
      <h2 style="margin:0 0 16px;color:#dc2626;font-size:18px">⚠️ Problema reportado en campaña</h2>
      <p style="margin:0 0 8px"><strong>Proyecto:</strong> ${projectName}</p>
      <p style="margin:0 0 8px"><strong>Categoría:</strong> ${deliveryName}</p>
      <p style="margin:0 0 8px"><strong>Ciudad:</strong> ${region}</p>
      <div style="margin-top:12px;background:white;padding:12px;border-radius:8px;border:1px solid #fecaca">
        <p style="margin:0;font-size:14px;color:#374151"><strong>Problema:</strong> ${problemNotes}</p>
      </div>
    </div>
  `

  try {
    await transporter.sendMail({
      from: `"La Ruta" <${user}>`,
      to: 'ximena@laruta.ia',
      subject: `⚠️ Problema en ${projectName} - ${deliveryName}`,
      html,
    })
  } catch (e) {
    console.error('Error sending problem email:', e)
  }

  return NextResponse.json({ ok: true })
}
