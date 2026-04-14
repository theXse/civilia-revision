import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { supabase } from '@/lib/supabase'
import { REGION_EMAILS, buildLinkApprovalEmail, buildSubidoIGEmail, type NotificationItem } from '@/lib/emailTemplates'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = process.env.NOTIFY_GMAIL_USER
  const pass = process.env.NOTIFY_GMAIL_APP_PASSWORD
  if (!user || !pass) return NextResponse.json({ error: 'Email not configured' }, { status: 500 })

  const { data: pending } = await supabase
    .from('notification_queue')
    .select('*')
    .is('sent_at', null)
    .lte('scheduled_at', new Date().toISOString())

  if (!pending?.length) return NextResponse.json({ ok: true, sent: 0 })

  const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } })
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://civilia-revision.vercel.app'
  let sent = 0

  for (const batch of pending) {
    const clientEmail = REGION_EMAILS[batch.region]
    const items: NotificationItem[] = batch.items || []
    let subject = ''
    let html = ''
    let recipients: string[] = ['ximena@laruta.ia', 'rafael@laruta.ai']
    if (clientEmail) recipients = [clientEmail, ...recipients]

    if (batch.type === 'link_approval') {
      const tpl = buildLinkApprovalEmail(batch.region, items, baseUrl)
      subject = tpl.subject
      html = tpl.html
    } else if (batch.type === 'subido_ig') {
      const tpl = buildSubidoIGEmail(batch.region, items)
      subject = tpl.subject
      html = tpl.html
    }

    if (!html) continue

    try {
      await transporter.sendMail({ from: `"La Ruta" <${user}>`, to: recipients.join(', '), subject, html })
      await supabase.from('notification_queue').update({ sent_at: new Date().toISOString() }).eq('id', batch.id)
      sent++
    } catch (e) {
      console.error('Error sending batch email:', e)
    }
  }

  return NextResponse.json({ ok: true, sent })
}
