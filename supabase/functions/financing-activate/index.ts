// AutoRD — activate a lightweight client account from the financing portal.
// POST { token } — NO auth required (the token itself is the credential).
// Only works once the token is fully verified (last-4 cédula + WhatsApp OTP).
// Find-or-creates the deterministic wa<digits>@autord.local account for the
// application's on-file phone, links the application to it when the current
// owner is anonymous, and returns { email, password } for the browser to sign
// in with. Mirrors wa-login-verify's account creation, but gated on the token.
//
// Deploy: supabase functions deploy financing-activate --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } })

function normPhone(raw: string) {
  let d = (raw || '').replace(/[^0-9]/g, '')
  if (d.length === 10) d = '1' + d
  return d
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

    const body = await req.json().catch(() => ({}))
    const token = String(body.token || '')
    if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ ok: false, error: 'bad_token' }, 400)

    // The token must be fully verified (both factors) and still valid.
    const { data: tok } = await admin.from('financing_public_tokens').select('*').eq('token', token).maybeSingle()
    if (!tok) return json({ ok: false, error: 'not_found' }, 200)
    if (tok.revoked || new Date(tok.expires_at) < new Date()) return json({ ok: false, error: 'expired' }, 200)
    if (!tok.cedula_verified_at || !tok.otp_verified_at) return json({ ok: false, error: 'unverified' }, 200)

    const { data: app } = await admin.from('financing_applications')
      .select('id, buyer_id, buyer_phone').eq('id', tok.application_id).maybeSingle()
    if (!app) return json({ ok: false, error: 'no_application' }, 200)

    const to = normPhone(app.buyer_phone || '')
    if (to.length < 11) return json({ ok: false, error: 'no_phone_on_file' }, 200)

    // Find-or-create the deterministic account for this phone.
    const email = `wa${to}@autord.local`
    const password = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
    const { data: uid } = await admin.rpc('auth_uid_by_email', { p_email: email })
    let userId = uid as string | null
    if (userId) {
      const up = await admin.auth.admin.updateUserById(userId, { password })
      if (up.error) return json({ ok: false, error: up.error.message }, 500)
    } else {
      const cu = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { role: 'buyer', phone: to },
      })
      if (cu.error) return json({ ok: false, error: cu.error.message }, 500)
      userId = cu.data.user?.id ?? null
    }
    if (!userId) return json({ ok: false, error: 'no_user' }, 500)
    await admin.from('profiles').update({ phone: to, phone_verified_at: new Date().toISOString() }).eq('id', userId)

    // Link the application to this account when the current owner is anonymous
    // (the usual case — the pre-approval was created by a frictionless anon user).
    // Never steal an application that belongs to a real, distinct account.
    let linked = app.buyer_id === userId
    if (app.buyer_id !== userId) {
      const { data: cur } = await admin.auth.admin.getUserById(app.buyer_id)
      if (!cur?.user || cur.user.is_anonymous) {
        await admin.from('financing_applications').update({ buyer_id: userId }).eq('id', app.id)
        linked = true
      }
    }
    await admin.from('financing_public_tokens').update({ verified_profile_id: userId }).eq('token', token)

    return json({ ok: true, email, password, linked })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
