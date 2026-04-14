import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { supabase } from '@/lib/supabase'
import { buildApprovalConfirmEmail } from '@/lib/emailTemplates'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const { data: delivery } = await supabase
    .from('deliveries')
    .select('*, projects(*)')
    .eq('approval_token', token)
    .single()

  if (!delivery) {
    return NextResponse.redirect(new URL('/aprobado?error=1', req.url))
  }

  await supabase.from('deliveries').update({ client_approved_at: new Date().toISOString() }).eq('id', delivery.id)

  const user = process.env.NOTIFY_GMAIL_USER
  const pass = process.env.NOTIFY_GMAIL_APP_PASSWORD

  if (user && pass) {
    const project = delivery.projects as { name: string; region: string }
    const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } })
    const { subject, html } = buildApprovalConfirmEmail(project?.name, delivery.name, project?.region)
    try {
      await transporter.sendMail({ from: `"La Ruta" <${user}>`, to: 'ximena@laruta.ia, erika@laruta.ai', subject, html })
    } catch (e) {
      console.error('Error sending approval email:', e)
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://civilia-revision.vercel.app'
  return NextResponse.redirect(new URL(`/aprobado?name=${encodeURIComponent(delivery.name)}`, baseUrl))
}
