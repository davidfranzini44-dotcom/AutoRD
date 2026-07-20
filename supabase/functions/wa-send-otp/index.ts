// AutoRD — send a WhatsApp OTP.
// POST { phone } (authenticated caller; anonymous sessions allowed).
// Generates a 6-digit code, stores only its HMAC in AutoRD, and delivers the
// text over WhatsApp with NO SMS cost.
//
// Two delivery modes (chosen by env):
//  - GATEWAY (recommended): if REPARANDO_SERVICE_ROLE_KEY is set, it enqueues
//    into the *Reparando* project's wa_outbox so Reparando's already-running
//    Baileys worker + already-linked number sends it. No AutoRD worker needed.
//  - LOCAL: otherwise it enqueues into AutoRD's own wa_outbox (drained by
//    autord-wa-worker), and requires AutoRD's wa_connection to be connected.
//
// Deploy: supabase functions deploy wa-send-otp --no-verify-jwt
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const URL = Deno.env.get('SUPABASE_URL')!
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Optional Reparando gateway (reuse its running worker + linked WhatsApp).
    const REP_KEY = Deno.env.get('REPARANDO_SERVICE_ROLE_KEY')
    const REP_URL = Deno.env.get('REPARANDO_SUPABASE_URL') || 'https://cfotlppderfzdmspsjjn.supabase.co'
    const REP_ORG = Deno.env.get('REPARANDO_ORG_ID') || ''

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'not_authenticated' }, 401)

    const { phone } = await req.json().catch(() => ({}))
    const to = normPhone(phone || '')
    if (to.length < 11) return json({ error: 'invalid_phone' }, 400)

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

    // Rate limit: >=30s gap and <=5 codes/hour per (user, phone).
    const since = new Date(Date.now() - 3600_000).toISOString()
    const { data: recent } = await admin.from('phone_otps')
      .select('created_at').eq('user_id', user.id).eq('phone', to).gte('created_at', since)
      .order('created_at', { ascending: false })
    if (recent && recent.length) {
      const gap = Date.now() - new Date(recent[0].created_at).getTime()
      if (gap < 30_000) return json({ error: 'too_soon', retry_in: Math.ceil((30_000 - gap) / 1000) }, 429)
      if (recent.length >= 5) return json({ error: 'rate_limited' }, 429)
    }

    const n = (crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000
    const code = String(n)
    const code_hash = await hmac(SERVICE, `${to}:${code}`)
    const expires_at = new Date(Date.now() + 600_000).toISOString()
    const body = `AutoRD: tu codigo de verificacion es ${code}. Vence en 10 minutos. No lo compartas con nadie.`

    await admin.from('phone_otps').insert({ user_id: user.id, phone: to, code_hash, purpose: 'claim', expires_at })

    if (REP_KEY) {
      // ---- Gateway: hand off to Reparando's worker ----
      const rep = createClient(REP_URL, REP_KEY, { auth: { persistSession: false } })
      let org = REP_ORG
      if (!org) {
        // Auto-pick the linked Baileys connection (works when there's a single store).
        const { data: conns } = await rep.from('wa_connections').select('org_id,status').eq('provider', 'baileys').eq('enabled', true)
        const live = (conns || []).find((c) => String(c.status || '').toLowerCase().includes('connect')) || (conns || [])[0]
        if (!live) return json({ error: 'wa_not_connected' }, 503)
        org = live.org_id
      }
      const { error: qErr } = await rep.from('wa_outbox').insert({ org_id: org, to_phone: to, body, status: 'queued' })
      if (qErr) return json({ error: 'enqueue_failed', detail: qErr.message }, 502)
      return json({ ok: true, expires_in: 600, phone: to, via: 'reparando' })
    }

    // ---- Local: AutoRD's own worker ----
    const { data: conn } = await admin.from('wa_connection').select('enabled,status').eq('id', 'platform').single()
    if (!conn || !conn.enabled || conn.status !== 'connected') return json({ error: 'wa_not_connected' }, 503)
    await admin.from('wa_outbox').insert({ to_phone: to, body })
    return json({ ok: true, expires_in: 600, phone: to, via: 'autord' })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
