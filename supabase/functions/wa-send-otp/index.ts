// AutoRD — send a WhatsApp OTP + log the send.
// POST { phone, kind?: 'otp'|'test', check?: true } (authenticated caller).
// Generates a 6-digit code, stores only its HMAC, delivers via the gateway
// (Reparando worker) or AutoRD's own worker, and records the send in
// wa_notifications (the code itself is never logged).
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

    const REP_KEY = Deno.env.get('REPARANDO_SERVICE_ROLE_KEY')
    const REP_URL = Deno.env.get('REPARANDO_SUPABASE_URL') || 'https://cfotlppderfzdmspsjjn.supabase.co'
    const REP_ORG = Deno.env.get('REPARANDO_ORG_ID') || ''

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'not_authenticated' }, 401)

    const reqBody = await req.json().catch(() => ({}))
    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

    // Readiness check — no code generated, nothing sent.
    if (reqBody.check) {
      if (REP_KEY) {
        const rep = createClient(REP_URL, REP_KEY, { auth: { persistSession: false } })
        const { data: conns, error } = await rep.from('wa_connections')
          .select('org_id,status,phone_number,enabled').eq('provider', 'baileys').eq('enabled', true)
        if (error) return json({ ok: false, mode: 'reparando', error: error.message })
        const live = (conns || []).find((c) => String(c.status || '').toLowerCase().includes('connect')) || (conns || [])[0]
        return json({ ok: !!live, mode: 'reparando', ready: !!live, org: live?.org_id || null, sender: live?.phone_number || null, connections: (conns || []).length })
      }
      const { data: c } = await admin.from('wa_connection').select('enabled,status,phone_number').eq('id', 'platform').single()
      return json({ ok: c?.status === 'connected', mode: 'autord', ready: c?.status === 'connected', sender: c?.phone_number || null })
    }

    const kind = reqBody.kind === 'test' ? 'test' : 'otp'
    const to = normPhone(reqBody.phone || '')
    if (to.length < 11) return json({ error: 'invalid_phone' }, 400)

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
    const message = `AutoRD: tu codigo de verificacion es ${code}. Vence en 10 minutos. No lo compartas con nadie.`

    await admin.from('phone_otps').insert({ user_id: user.id, phone: to, code_hash, purpose: 'claim', expires_at })

    // Deliver.
    let via: string | null = null, ok = false, errCode: string | null = null
    if (REP_KEY) {
      const rep = createClient(REP_URL, REP_KEY, { auth: { persistSession: false } })
      let org = REP_ORG
      if (!org) {
        const { data: conns } = await rep.from('wa_connections').select('org_id,status').eq('provider', 'baileys').eq('enabled', true)
        const live = (conns || []).find((c) => String(c.status || '').toLowerCase().includes('connect')) || (conns || [])[0]
        if (!live) errCode = 'wa_not_connected'; else org = live.org_id
      }
      if (!errCode) {
        const { error: qErr } = await rep.from('wa_outbox').insert({ org_id: org, to_phone: to, body: message, status: 'queued' })
        if (qErr) errCode = 'enqueue_failed'; else { ok = true; via = 'reparando' }
      }
    } else {
      const { data: conn } = await admin.from('wa_connection').select('enabled,status').eq('id', 'platform').single()
      if (!conn || !conn.enabled || conn.status !== 'connected') errCode = 'wa_not_connected'
      else { await admin.from('wa_outbox').insert({ to_phone: to, body: message }); ok = true; via = 'autord' }
    }

    // Log the send (never store the code).
    await admin.from('wa_notifications').insert({
      type: kind, to_phone: to,
      body: kind === 'test' ? 'Codigo de prueba' : 'Codigo de verificacion',
      status: ok ? 'sent' : 'failed', via, user_id: user.id,
      meta: errCode ? { error: errCode } : null,
    })

    if (!ok) return json({ error: errCode }, errCode === 'enqueue_failed' ? 502 : 503)
    return json({ ok: true, expires_in: 600, phone: to, via })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
