// AutoRD — one-way WhatsApp notifications to buyers (no chat, send-only).
// Currently: notify a buyer when a bank responds to their financing request.
// POST { response_id, event: 'bank_response' } — caller must be a bank/admin.
// Looks everything up server-side and enqueues via the same gateway as OTPs
// (Reparando's worker when REPARANDO_SERVICE_ROLE_KEY is set, else AutoRD's).
//
// Deploy: supabase functions deploy wa-notify --no-verify-jwt
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

// Enqueue a WhatsApp message via the gateway (Reparando) or AutoRD's own outbox.
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
    return error ? { ok: false, error: 'enqueue_failed', detail: error.message } : { ok: true, via: 'reparando' }
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
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const APP_URL = Deno.env.get('APP_URL') || 'https://auto-rd-2uh5.vercel.app'

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'not_authenticated' }, 401)

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
    const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (!prof || !['bank', 'admin'].includes(prof.role)) return json({ error: 'forbidden' }, 403)

    const { response_id } = await req.json().catch(() => ({}))
    if (!response_id) return json({ error: 'missing_response_id' }, 400)

    const { data: ab } = await admin.from('application_banks').select('application_id,bank_id,status').eq('id', response_id).single()
    if (!ab) return json({ error: 'not_found' }, 404)

    const NOTIFY = ['preaprobada', 'oferta', 'en_evaluacion', 'pendiente_docs', 'rechazada']
    if (!NOTIFY.includes(ab.status)) return json({ ok: true, skipped: 'status' })

    const { data: app } = await admin.from('financing_applications').select('buyer_phone').eq('id', ab.application_id).single()
    const to = normPhone(app?.buyer_phone || '')
    if (to.length < 11) return json({ ok: true, skipped: 'no_phone' })

    const { data: bank } = await admin.from('banks').select('name').eq('id', ab.bank_id).single()
    const b = bank?.name || 'Un banco'
    const link = `${APP_URL}/mi-financiamiento`
    const MSG: Record<string, string> = {
      preaprobada:    `AutoRD: ¡buenas noticias! ${b} pre-aprobo tu solicitud de financiamiento. Revisala aqui: ${link}`,
      oferta:         `AutoRD: ${b} te envio una oferta de financiamiento. Revisala aqui: ${link}`,
      en_evaluacion:  `AutoRD: ${b} esta evaluando tu solicitud. Te avisaremos al responder: ${link}`,
      pendiente_docs: `AutoRD: ${b} necesita documentos para continuar tu solicitud: ${link}`,
      rechazada:      `AutoRD: ${b} reviso tu solicitud. Tienes una actualizacion en tu cuenta: ${link}`,
    }
    const body = MSG[ab.status] || `AutoRD: ${b} actualizo tu solicitud de financiamiento: ${link}`

    const res = await enqueue(admin, to, body)
    return json(res, res.ok ? 200 : 503)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
