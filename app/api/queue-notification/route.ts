import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { region, type, item } = await req.json()

  // Look for existing unsent batch for this region+type within the window
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
    // Append to existing batch
    const updatedItems = [...(existing.items || []), item]
    await supabase
      .from('notification_queue')
      .update({ items: updatedItems })
      .eq('id', existing.id)
  } else {
    // Create new batch scheduled 1 hour from now
    const scheduled_at = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    await supabase.from('notification_queue').insert({
      region,
      type,
      items: [item],
      scheduled_at,
    })
  }

  return NextResponse.json({ ok: true })
}
