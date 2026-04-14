import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { buildProblemEmail } from '@/lib/emailTemplates'

export async function POST(req: NextRequest) {
  const { projectName, deliveryName, problemNotes, region } = await req.json()

  const user = process.env.NOTIFY_GMAIL_USER
  const pass = process.env.NOTIFY_GMAIL_APP_PASSWORD
  if (!user || !pass) return NextResponse.json({ ok: true })

  const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } })
  const { subject, html } = buildProblemEmail(projectName, deliveryName, region, problemNotes)

  try {
    await transporter.sendMail({ from: `"La Ruta" <${user}>`, to: 'ximena@laruta.ia', subject, html })
  } catch (e) {
    console.error('Error sending problem email:', e)
  }

  return NextResponse.json({ ok: true })
}
