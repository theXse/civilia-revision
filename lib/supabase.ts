import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Project = {
  id: string
  name: string
  region: string
  client_token: string
  admin_token: string
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
  status: 'pending' | 'approved' | 'changes_requested'
  created_at: string
}

export type Comment = {
  id: string
  image_id: string
  author: string
  content: string
  created_at: string
}
