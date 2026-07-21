// AutoRD — Bright Data Web Unlocker fetch (server-side, admin-only).
// POST { url, country?, format? }  -> { ok, status, length, body }
// POST { check: true }             -> readiness probe (are the secrets set + zone live)
//
// Routes the request through Bright Data's Unlocker API so the credentials never
// touch the browser. The caller must be an AutoRD admin. Set these secrets in the
// Supabase dashboard (Edge Functions -> Secrets):
//   BRIGHTDATA_API_TOKEN   (Account settings -> API tokens)
//   BRIGHTDATA_ZONE        (your Web Unlocker zone name, e.g. autord_unlocker)
//
// Deploy: supabase functions deploy bd-fetch   (JWT verification ON)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } })

const BD_ENDPOINT = 'https://api.brightdata.com/request'

async function bdRequest(token: string, zone: string, url: string, country?: string, format = 'raw') {
  const res = await fetch(BD_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone, url, format, ...(country ? { country } : {}) }),
  })
  const body = await res.text()
  return { ok: res.ok, status: res.status, body }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Auth: must be a signed-in AutoRD admin (protects your Bright Data quota).
  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  if (!jwt) return json({ error: 'unauthorized' }, 401)
  const { data: u } = await admin.auth.getUser(jwt)
  const uid = u?.user?.id
  if (!uid) return json({ error: 'unauthorized' }, 401)
  const { data: prof } = await admin.from('profiles').select('role').eq('id', uid).single()
  if (prof?.role !== 'admin') return json({ error: 'forbidden' }, 403)

  const token = Deno.env.get('BRIGHTDATA_API_TOKEN')
  const zone = Deno.env.get('BRIGHTDATA_ZONE')
  if (!token || !zone) return json({ ok: false, error: 'brightdata_not_configured', has_token: !!token, has_zone: !!zone }, 200)

  let payload: any = {}
  try { payload = await req.json() } catch { /* empty */ }

  // Readiness probe: confirm the creds + zone work without scraping a real target.
  if (payload.check) {
    const t = await bdRequest(token, zone, 'https://geo.brdtest.com/welcome.txt?product=unlocker', undefined, 'raw')
    return json({ ok: t.ok, mode: 'brightdata', zone, ready: t.ok, status: t.status, sample: (t.body || '').slice(0, 200) })
  }

  const url = String(payload.url || '')
  if (!/^https?:\/\//i.test(url)) return json({ error: 'invalid_url' }, 400)
  const r = await bdRequest(token, zone, url, payload.country, payload.format || 'raw')
  return json({ ok: r.ok, status: r.status, length: r.body.length, body: r.body })
})
