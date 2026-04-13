import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { supabase } from '@/lib/supabase'

const REGION_EMAILS: Record<string, string> = {
  'Osorno': 'slyon@civilia.cl',
  'Santiago': 'mmardones@civilia.cl',
  'Valdivia': 'jprovis@civilia.cl',
  'Concepción': 'cvargas@civilia.cl',
}

async function processOverdueBatches() {
  const user = process.env.NOTIFY_GMAIL_USER
  const pass = process.env.NOTIFY_GMAIL_APP_PASSWORD
  if (!user || !pass) return

  const { data: pending } = await supabase
    .from('notification_queue')
    .select('*')
    .is('sent_at', null)
    .lte('scheduled_at', new Date().toISOString())

  if (!pending?.length) return

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://civilia-revision.vercel.app'
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })

  for (const batch of pending) {
    const clientEmail = REGION_EMAILS[batch.region]
    const items = batch.items || []
    let html = ''
    let subject = ''
    let recipients: string[] = ['ximena@laruta.ia', 'rafael@laruta.ai']
    if (clientEmail) recipients = [clientEmail, ...recipients]

    if (batch.type === 'link_approval') {
      subject = `📋 Campañas para aprobar — ${batch.region} (${items.length})`
      const itemsHtml = items.map((item: { project_name: string; delivery_name: string; facebook_link?: string; approval_token?: string }) => `
        <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:12px">
          <p style="margin:0 0 4px;font-weight:bold;color:#1e293b">${item.project_name}</p>
          <p style="margin:0 0 12px;font-size:13px;color:#64748b">${item.delivery_name}</p>
          ${item.facebook_link ? `<p style="margin:0 0 12px"><a href="${item.facebook_link}" style="color:#1877f2;font-size:13px">Ver en Facebook →</a></p>` : ''}
          ${item.approval_token ? `<a href="${baseUrl}/aprobar/${item.approval_token}" style="display:inline-block;background:#7c3aed;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">✓ Aprobar campaña</a>` : ''}
        </div>
      `).join('')
      html = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
          <h2 style="margin:0 0 8px;color:#7c3aed;font-size:18px">📋 Campañas listas para aprobar</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px">Ciudad: <strong>${batch.region}</strong> — ${items.length} campaña${items.length > 1 ? 's' : ''}</p>
          ${itemsHtml}
        </div>
      `
    } else if (batch.type === 'subido_ig') {
      subject = `📸 Subidas a Instagram — ${batch.region} (${items.length})`
      const itemsHtml = items.map((item: { project_name: string; delivery_name: string }) => `
        <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:12px">
          <p style="margin:0 0 4px;font-weight:bold;color:#1e293b">${item.project_name}</p>
          <p style="margin:0;font-size:13px;color:#64748b">${item.delivery_name}</p>
        </div>
      `).join('')
      html = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
          <h2 style="margin:0 0 8px;color:#7c3aed;font-size:18px">📸 Campañas subidas a Instagram</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px">Ciudad: <strong>${batch.region}</strong> — ${items.length} campaña${items.length > 1 ? 's' : ''}</p>
          ${itemsHtml}
          <p style="margin-top:16px;font-size:12px;color:#94a3b8">Subidas por Erika — La Ruta</p>
        </div>
      `
    }

    try {
      await transporter.sendMail({ from: `"La Ruta" <${user}>`, to: recipients.join(', '), subject, html })
      await supabase.from('notification_queue').update({ sent_at: new Date().toISOString() }).eq('id', batch.id)
    } catch (e) {
      console.error('Error sending batch:', e)
    }
  }
}

export async function POST(req: NextRequest) {
  const { region, type, item } = await req.json()

  // Process any overdue batches first (replaces cron job)
  await processOverdueBatches()

  // Find existing unsent batch for this region+type within the window
  const { data: existing } = await supabase
    .from('notification_queue')
    .select('*')
    .eq('region', region)
    .eq('type', type)
    .is('sent_at', null)
    .gt('scheduled_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (existing) {
    const updatedItems = [...(existing.items || []), item]
    await supabase.from('notification_queue').update({ items: updatedItems }).eq('id', existing.id)
  } else {
    const scheduled_at = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    await supabase.from('notification_queue').insert({ region, type, items: [item], scheduled_at })
  }

  return NextResponse.json({ ok: true })
}
