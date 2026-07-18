import { createClient } from '@supabase/supabase-js'

// Public project URL + anon (publishable) key. The anon key is designed to be
// shipped in the browser bundle — it is protected by Row Level Security, so it
// is safe to commit here. (The service-role key is the secret one and never
// appears in client code.) Baking these in as a fallback means the deployed
// build connects to Supabase even if the Vercel env vars aren't set; env vars
// still win when present, so per-environment overrides keep working.
const DEFAULT_SUPABASE_URL = 'https://mplcvzyestlyeiniqjzf.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbGN2enllc3RseWVpbmlxanpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMTM1OTAsImV4cCI6MjA5OTc4OTU5MH0.jDx1nlHOCohgz_TpVQzp0mcT21IkOGIxutMFy8wp1IA'

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY

// With the fallback above this is effectively always true in production; it
// stays a derived flag so demo mode still kicks in if the keys are ever blanked.
export const isSupabaseConfigured = Boolean(url && anon)

export const supabase = isSupabaseConfigured
  ? createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
