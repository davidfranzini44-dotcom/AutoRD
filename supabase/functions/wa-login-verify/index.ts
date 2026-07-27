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

    // Resolve WHICH account this phone belongs to before touching credentials.
    //
    // This used to jump straight to wa<phone>@autord.local, which meant a buyer
    // who had registered with a real email and then logged in by phone got a
    // SECOND account — their saved cars and financing history split across two
    // identities. One human, one account.
    const { data: owners, error: ownerErr } = await admin.rpc('find_profiles_by_phone', { p_digits: to })
    if (ownerErr) return json({ ok: false, error: 'lookup_failed' }, 500)

    const matches = (owners ?? []) as Array<{ id: string; role: string; dealer_id: string | null; bank_id: string | null; email: string }>
    const isInstitution = (m: typeof matches[number]) =>
      !!m.dealer_id || !!m.bank_id || m.role === 'dealer' || m.role === 'bank' || m.role === 'admin'
    const buyers = matches.filter((m) => !isInstitution(m))

    // Two different people cannot share a number. Guessing which one to sign in
    // would hand somebody another person's financing, so refuse and say so.
    if (buyers.length > 1) return json({ ok: false, error: 'ambiguous_phone' }, 409)

    // A dealer/bank/admin phone gets a BUYER account, never their institution
    // one: staff shop as customers too, but a customer-facing OTP must never
    // mint a session that opens a console. Their institution login stays
    // email+password.
    const institutionOnly = buyers.length === 0 && matches.length > 0

    const linked = buyers[0] ?? null
    const email = linked?.email ?? `wa${to}@autord.local`
    const password = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')

    let userId: string | null = linked?.id ?? null
    if (!userId) {
      const { data: uid } = await admin.rpc('auth_uid_by_email', { p_email: email })
      userId = (uid as string | null) ?? null
    }

    if (userId) {
      const up = await admin.auth.admin.updateUserById(userId, { password })
      if (up.error) return json({ ok: false, error: up.error.message }, 500)
    } else {
      const cu = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'buyer', phone: to } })
      if (cu.error) return json({ ok: false, error: cu.error.message }, 500)
      userId = cu.data.user?.id ?? null
    }

    // Only stamp the phone on an account this phone actually owns. Never write
    // it onto a linked account whose phone field is already something else.
    if (userId) {
      await admin.from('profiles')
        .update({ phone: to, phone_verified_at: new Date().toISOString() })
        .eq('id', userId)
    }

    return json({
      ok: true, verified: true, email, password, phone: to,
      linked: !!linked,
      // Surfaced so the client can explain why a staff member landed in a buyer
      // session rather than their console.
      buyerOnly: institutionOnly,
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
