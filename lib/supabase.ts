import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Region = {
  id: string
  name: string
  client_token: string
}

export type Project = {
  id: string
  name: string
  region: string
  client_token: string
  admin_token: string
  archived: boolean
  archived_at: string | null
  created_at: string
}

export type Delivery = {
  id: string
  project_id: string
  name: string
  created_at: string
}

export type Image = {
  id: string
  delivery_id: string
  url: string
  name: string
  status: 'pending' | 'approved' | 'changes_requested' | 'revised'
  published: boolean
  created_at: string
}

export type Comment = {
  id: string
  image_id: string
  author: string
  content: string
  resolved: boolean
  created_at: string
}
