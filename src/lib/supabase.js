import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// When env vars are absent (e.g. before the project is connected) the app
// runs in "demo mode" against local sample data. Once VITE_SUPABASE_* are
// set, every data call automatically hits the real database instead.
export const isSupabaseConfigured = Boolean(url && anon)

export const supabase = isSupabaseConfigured
  ? createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
