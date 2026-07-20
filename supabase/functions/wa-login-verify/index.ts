// AutoRD — verify a WhatsApp login code and mint a real Supabase session.
// POST { phone, code } — NO auth required.
// On success returns { token_hash } which the browser passes to
// supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) to get a session.
// The account is keyed to a deterministic synthetic email (wa<digits>@autord.local)
// so the same WhatsApp number always logs into the same account (re-loginable).
//
// Deploy: supabase functions deploy wa-login-verify --no-verify-jwt
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
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

    const body = await req.json().catch(() => ({}))
    const to = normPhone(body.phone || '')
    const code = String(body.code || '').replace(/[^0-9]/g, '')
    if (to.length < 11 || code.length !== 6) return json({ error: 'invalid' }, 400)

    const { data: row } = await admin.from('phone_otps').select('*')
      .eq('phone', to).eq('purpose', 'login').is('consumed_at', null)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!row) return json({ ok: false, error: 'expired_or_missing' }, 200)
    if (row.attempts >= 6) return json({ ok: false, error: 'too_many_attempts' }, 429)

    const expect = await hmac(SERVICE, `login:${to}:${code}`)
    if (!eq(expect, row.code_hash)) {
      await admin.from('phone_otps').update({ attempts: row.attempts + 1 }).eq('id', row.id)
      return json({ ok: false, error: 'wrong_code' }, 200)
    }
    await admin.from('phone_otps').update({ consumed_at: new Date().toISOString() }).eq('id', row.id)

    // Find-or-create the account for this phone (deterministic synthetic email),
    // then generate a magiclink token the browser exchanges for a session.
    // Find-or-create the account for this phone (deterministic synthetic email),
    // set a one-time random password, and return it. The browser immediately
    // signs in with it (password grant is 100% reliable for a confirmed email).
    const email = `wa${to}@autord.local`
    const password = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
    const { data: uid } = await admin.rpc('auth_uid_by_email', { p_email: email })
    let userId = uid as string | null
    if (userId) {
      const up = await admin.auth.admin.updateUserById(userId, { password })
      if (up.error) return json({ ok: false, error: up.error.message }, 500)
    } else {
      const cu = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'buyer', phone: to } })
      if (cu.error) return json({ ok: false, error: cu.error.message }, 500)
      userId = cu.data.user?.id ?? null
    }
    if (userId) await admin.from('profiles').update({ phone: to, phone_verified_at: new Date().toISOString() }).eq('id', userId)

    return json({ ok: true, verified: true, email, password, phone: to })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
