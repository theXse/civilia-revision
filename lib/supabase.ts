import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Region = {
  id: string
  name: string
  client_token: string
  drive_url: string | null
  dropbox_url: string | null
  delivery_url: string | null
}

export type Project = {
  id: string
  name: string
  region: string
  client_token: string
  admin_token: string
  archived: boolean
  archived_at: string | null
  notes: string
  drive_link: string
  ready_for_social: boolean
  listo_para_ig: boolean
  facebook_link: string | null
  problem_notes: string | null
  created_at: string
}

export type Delivery = {
  id: string
  project_id: string
  name: string
  sort_order: number
  problem_notes: string | null
  facebook_link: string | null
  client_notified_at: string | null
  client_approved_at: string | null
  approval_token: string | null
  created_at: string
}

export type NotificationItem = {
  project_name: string
  delivery_name: string
  delivery_id: string
  facebook_link?: string
  admin_url?: string
  approval_token?: string
}

export type NotificationQueue = {
  id: string
  region: string
  type: 'link_approval' | 'subido_ig'
  items: NotificationItem[]
  scheduled_at: string
  sent_at: string | null
  created_at: string
}

export type Image = {
  id: string
  delivery_id: string
  url: string
  name: string
  status: 'pending' | 'approved' | 'changes_requested' | 'revised'
  published: boolean
  on_instagram: boolean
  sort_order: number
  tracking_code: string | null
  created_at: string
}

export type Comment = {
  id: string
  image_id: string
  author: string
  content: string
  resolved: boolean
  reply: string
  replied_at: string | null
  created_at: string
}

export type ProjectComment = {
  id: string
  project_id: string
  author: string
  content: string
  created_at: string
}
