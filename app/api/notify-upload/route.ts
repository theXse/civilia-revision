import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest) {
  const { projectName, region, deliveryName, count, adminUrl } = await req.json()

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

  const cantidad = Number(count) || 0
  const laminas = cantidad === 1 ? '1 lámina nueva' : `${cantidad} láminas nuevas`

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
      <h2 style="margin:0 0 16px;color:#4a6478;font-size:18px">📐 Contenido nuevo subido para revisar</h2>
      <p style="margin:0 0 8px"><strong>Proyecto:</strong> ${projectName}</p>
      <p style="margin:0 0 8px"><strong>Ciudad:</strong> ${region}</p>
      <p style="margin:0 0 8px"><strong>Categoría:</strong> ${deliveryName}</p>
      <p style="margin:0 0 8px"><strong>Se subieron:</strong> ${laminas}</p>
      ${adminUrl ? `<p style="margin:20px 0 0"><a href="${adminUrl}" style="background:#7ab82a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold">Ver láminas →</a></p>` : ''}
    </div>
  `

  try {
    await transporter.sendMail({
      from: `"La Ruta" <${user}>`,
      to: recipients,
      subject: `📐 Nuevo contenido: ${projectName} — ${deliveryName} (${region})`,
      html,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
