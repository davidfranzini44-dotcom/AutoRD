// AutoRD — send the client-portal OTP over WhatsApp.
// POST { token } — NO auth required: the caller is an anonymous visitor holding
// a /f/:token link. The token itself is the authorisation, and it is validated
// inside start_financing_otp before any code is issued.
//
// WHY THIS EXISTS. start_financing_otp is a Postgres function, so it can only
// write to AutoRD's own wa_outbox — and nothing drains that table. Codes sat at
// status 'queued', attempts 0, forever: it looked like a successful send and the
// customer simply never got a message. Actual delivery happens by inserting into
// the REPARANDO project's wa_outbox, where a live Baileys connection picks it up,
// and SQL cannot reach another Supabase project. Hence an edge function.
//
// It deliberately re-implements NONE of the security logic. The RPC still does
// token validation, expiry, cedula-first ordering, the 30-second and 5-per-hour
// rate limits, code generation and hashing. This only carries the resulting
// message across to the gateway.
//
// Deploy: supabase functions deploy financing-otp-send --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const REP_KEY = Deno.env.get('REPARANDO_SERVICE_ROLE_KEY')
    const REP_URL = Deno.env.get('REPARANDO_SUPABASE_URL') || 'https://cfotlppderfzdmspsjjn.supabase.co'
    const REP_ORG = Deno.env.get('REPARANDO_ORG_ID') || ''

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

    const body = await req.json().catch(() => ({}))
    const token = String(body.token || '').trim()
    if (!token) return json({ ok: false, reason: 'invalid' }, 400)

    // Every check and the code itself come from here. If it declines, we stop.
    const { data: res, error: rpcErr } = await admin.rpc('start_financing_otp', { p_token: token })
    if (rpcErr) return json({ ok: false, reason: 'error' }, 500)
    if (!res?.ok) return json(res ?? { ok: false, reason: 'error' })
    if (res.alreadyVerified) return json(res)

    // The RPC queued the message locally. Find it and carry it to the gateway.
    const hint = String(res.phoneHint || '')
    const { data: queued } = await admin
      .from('wa_outbox')
      .select('id, to_phone, body')
      .eq('status', 'queued')
      .like('to_phone', `%${hint}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!queued) return json({ ...res, delivered: false, reason: 'nothing_queued' })

    if (!REP_KEY) {
      // No gateway configured. Say so instead of reporting a send that will
      // never happen — a silent queue is what caused this bug.
      return json({ ...res, delivered: false, reason: 'gateway_not_configured' })
    }

    const rep = createClient(REP_URL, REP_KEY, { auth: { persistSession: false } })
    let org = REP_ORG
    if (!org) {
      const { data: conns } = await rep.from('wa_connections')
        .select('org_id,status').eq('provider', 'baileys').eq('enabled', true)
      const live = (conns || []).find((c: any) => String(c.status || '').toLowerCase().includes('connect')) || (conns || [])[0]
      if (!live) return json({ ...res, delivered: false, reason: 'wa_not_connected' })
      org = live.org_id
    }

    const { error: qErr } = await rep.from('wa_outbox')
      .insert({ org_id: org, to_phone: queued.to_phone, body: queued.body, status: 'queued' })
    if (qErr) return json({ ...res, delivered: false, reason: 'enqueue_failed' })

    // Mark the local copy handed off, so it stops looking like a pending send
    // and a retry cannot double-deliver it.
    await admin.from('wa_outbox')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', queued.id)

    return json({ ...res, delivered: true, via: 'reparando' })
  } catch (e) {
    return json({ ok: false, reason: String(e) }, 500)
  }
})
