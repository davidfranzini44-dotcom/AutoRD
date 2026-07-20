// AutoRD — send a WhatsApp OTP.
// POST { phone } (authenticated caller; anonymous sessions allowed).
// Generates a 6-digit code, stores only its HMAC, and enqueues the message
// into wa_outbox — the always-on Baileys worker delivers it from the operator's
// linked WhatsApp number. No SMS provider, no per-message cost.
//
// Deploy: supabase functions deploy wa-send-otp --no-verify-jwt
// Uses the auto-injected SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } })
const enc = new TextEncoder()

// Digits only; Dominican/NANP numbers are 10 digits nationally -> prefix "1".
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

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'not_authenticated' }, 401)

    const { phone } = await req.json().catch(() => ({}))
    const to = normPhone(phone || '')
    if (to.length < 11) return json({ error: 'invalid_phone' }, 400)

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

    // The platform WhatsApp must be linked & connected.
    const { data: conn } = await admin.from('wa_connection').select('enabled,status').eq('id', 'platform').single()
    if (!conn || !conn.enabled || conn.status !== 'connected') return json({ error: 'wa_not_connected' }, 503)

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

    await admin.from('phone_otps').insert({ user_id: user.id, phone: to, code_hash, purpose: 'claim', expires_at })
    await admin.from('wa_outbox').insert({
      to_phone: to,
      body: `AutoRD: tu codigo de verificacion es ${code}. Vence en 10 minutos. No lo compartas con nadie.`,
    })

    return json({ ok: true, expires_in: 600, phone: to })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
