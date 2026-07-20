// AutoRD — verify a WhatsApp OTP and "claim" the pre-approval.
// POST { phone, code } (authenticated caller; anonymous sessions allowed).
// On success, marks the code consumed and stamps the verified phone on the
// caller's profile (profiles.phone + phone_verified_at) — this ties an
// otherwise-anonymous pre-approval to a reachable, verified WhatsApp number.
//
// Deploy: supabase functions deploy wa-verify-otp --no-verify-jwt
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
// Constant-time-ish compare.
function eq(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
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

    const body = await req.json().catch(() => ({}))
    const to = normPhone(body.phone || '')
    const code = String(body.code || '').replace(/[^0-9]/g, '')
    if (to.length < 11 || code.length !== 6) return json({ error: 'invalid' }, 400)

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
    const { data: row } = await admin.from('phone_otps').select('*')
      .eq('user_id', user.id).eq('phone', to).is('consumed_at', null)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!row) return json({ ok: false, error: 'expired_or_missing' }, 200)
    if (row.attempts >= 6) return json({ ok: false, error: 'too_many_attempts' }, 429)

    const expect = await hmac(SERVICE, `${to}:${code}`)
    if (!eq(expect, row.code_hash)) {
      await admin.from('phone_otps').update({ attempts: row.attempts + 1 }).eq('id', row.id)
      return json({ ok: false, error: 'wrong_code' }, 200)
    }

    await admin.from('phone_otps').update({ consumed_at: new Date().toISOString() }).eq('id', row.id)
    await admin.from('profiles').update({ phone: to, phone_verified_at: new Date().toISOString() }).eq('id', user.id)
    return json({ ok: true, verified: true, phone: to })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
