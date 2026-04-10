import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest) {
  const { projectName, region, comment, adminUrl } = await req.json()

  const user = process.env.NOTIFY_GMAIL_USER
  const pass = process.env.NOTIFY_GMAIL_APP_PASSWORD
  const recipients = process.env.NOTIFY_EMAILS

  if (!user || !pass || !recipients) {
    return NextResponse.json({ error: 'Email not configured' }, { status: 500 })
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })

  const commentHtml = comment?.trim()
    ? `<p style="margin:0 0 8px"><strong>Comentario:</strong> ${comment.trim()}</p>`
    : ''

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
      <h2 style="margin:0 0 16px;color:#7c3aed;font-size:18px">📸 Nuevo proyecto subido a Instagram</h2>
      <p style="margin:0 0 8px"><strong>Proyecto:</strong> ${projectName}</p>
      <p style="margin:0 0 8px"><strong>Ciudad:</strong> ${region}</p>
      ${commentHtml}
      ${adminUrl ? `<p style="margin:16px 0 0"><a href="${adminUrl}" style="background:#7c3aed;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px">Ver proyecto</a></p>` : ''}
    </div>
  `

  await transporter.sendMail({
    from: `"La Ruta" <${user}>`,
    to: recipients,
    subject: `✅ Subido a IG: ${projectName} (${region})`,
    html,
  })

  return NextResponse.json({ ok: true })
}
