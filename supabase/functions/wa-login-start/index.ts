// AutoRD — start a WhatsApp login: send a 6-digit access code to the phone.
// POST { phone } — NO auth required (this is how you log in).
// Rate-limited per phone + a global ceiling to limit abuse. Delivers via the
// same gateway as everything else. Pairs with wa-login-verify.
//
// Deploy: supabase functions deploy wa-login-start --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } })
const enc = new TextEncoder()
function normPhone(raw: string) {
  let d = (raw || '').replace(/[^0-9]/g, '')
  if (d.length === 10) d = '1' + d
  return d
}
async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
async function enqueue(admin: any, to: string, body: string) {
  const REP_KEY = Deno.env.get('REPARANDO_SERVICE_ROLE_KEY')
  const REP_URL = Deno.env.get('REPARANDO_SUPABASE_URL') || 'https://cfotlppderfzdmspsjjn.supabase.co'
  const REP_ORG = Deno.env.get('REPARANDO_ORG_ID') || ''
  if (REP_KEY) {
    const rep = createClient(REP_URL, REP_KEY, { auth: { persistSession: false } })
    let org = REP_ORG
    if (!org) {
      const { data: conns } = await rep.from('wa_connections').select('org_id,status').eq('provider', 'baileys').eq('enabled', true)
      const live = (conns || []).find((c: any) => String(c.status || '').toLowerCase().includes('connect')) || (conns || [])[0]
      if (!live) return { ok: false, error: 'wa_not_connected' }
      org = live.org_id
    }
    const { error } = await rep.from('wa_outbox').insert({ org_id: org, to_phone: to, body, status: 'queued' })
    return error ? { ok: false, error: 'enqueue_failed' } : { ok: true, via: 'reparando' }
  }
  const { data: conn } = await admin.from('wa_connection').select('enabled,status').eq('id', 'platform').single()
  if (!conn || !conn.enabled || conn.status !== 'connected') return { ok: false, error: 'wa_not_connected' }
  await admin.from('wa_outbox').insert({ to_phone: to, body })
  return { ok: true, via: 'autord' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

    const { phone } = await req.json().catch(() => ({}))
    const to = normPhone(phone || '')
    if (to.length < 11) return json({ error: 'invalid_phone' }, 400)

    const since = new Date(Date.now() - 3600_000).toISOString()
    // Per-phone limit.
    const { data: recent } = await admin.from('phone_otps')
      .select('created_at').eq('phone', to).eq('purpose', 'login').gte('created_at', since)
      .order('created_at', { ascending: false })
    if (recent && recent.length) {
      const gap = Date.now() - new Date(recent[0].created_at).getTime()
      if (gap < 30_000) return json({ error: 'too_soon', retry_in: Math.ceil((30_000 - gap) / 1000) }, 429)
      if (recent.length >= 5) return json({ error: 'rate_limited' }, 429)
    }
    // Global abuse ceiling.
    const { count } = await admin.from('phone_otps').select('*', { count: 'exact', head: true })
      .eq('purpose', 'login').gte('created_at', since)
    if ((count || 0) > 200) return json({ error: 'busy' }, 429)

    const n = (crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000
    const code = String(n)
    const code_hash = await hmac(SERVICE, `login:${to}:${code}`)
    const expires_at = new Date(Date.now() + 600_000).toISOString()
    await admin.from('phone_otps').insert({ phone: to, code_hash, purpose: 'login', expires_at })

    const res = await enqueue(admin, to, `AutoRD: tu codigo de acceso es ${code}. Vence en 10 minutos. No lo compartas con nadie.`)
    await admin.from('wa_notifications').insert({
      type: 'otp', to_phone: to, body: 'Codigo de acceso',
      status: res.ok ? 'sent' : 'failed', via: res.via || null, meta: res.ok ? null : { error: res.error },
    })
    if (!res.ok) return json({ error: res.error }, 503)
    return json({ ok: true, expires_in: 600, phone: to })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
