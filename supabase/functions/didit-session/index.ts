// AutoRD — Didit session function
// POST { action: "create" }            -> creates a Didit verification session for the logged-in user
// POST { action: "status", session_id } -> returns { status, approved }
//
// Deploy:  supabase functions deploy didit-session --no-verify-jwt
// Secrets: DIDIT_API_KEY, DIDIT_WORKFLOW_ID, APP_URL, SUPABASE_URL, SUPABASE_ANON_KEY
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DIDIT_BASE = Deno.env.get('DIDIT_BASE_URL') ?? 'https://verification.didit.me/v2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const apiKey = Deno.env.get('DIDIT_API_KEY')
    const workflowId = Deno.env.get('DIDIT_WORKFLOW_ID')
    const appUrl = Deno.env.get('APP_URL') ?? 'https://autord.vercel.app'
    if (!apiKey || !workflowId) return json({ error: 'Didit not configured' }, 500)

    const { action = 'create', session_id } = await req.json().catch(() => ({}))

    // Identify the caller from their Supabase JWT.
    const authHeader = req.headers.get('Authorization') ?? ''
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await supa.auth.getUser()
    if (!user) return json({ error: 'not authenticated' }, 401)

    if (action === 'status') {
      const r = await fetch(`${DIDIT_BASE}/session/${session_id}/decision/`, {
        headers: { 'x-api-key': apiKey },
      })
      const d = await r.json().catch(() => ({}))
      const status = d?.status ?? 'Unknown'
      return json({ status, approved: status === 'Approved', declined: status === 'Declined' })
    }

    // action === 'create'
    const r = await fetch(`${DIDIT_BASE}/session/`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        workflow_id: workflowId,
        vendor_data: user.id,
        callback: `${appUrl}/financiamiento?kyc=done`,
        language: 'es',
        metadata: { source: 'autord' },
      }),
    })
    const s = await r.json().catch(() => ({}))
    if (!r.ok || !s?.url) return json({ error: 'didit_create_failed', detail: s }, 502)

    // Record a pending KYC row for this user (RLS: user owns their row).
    await supa.from('kyc_verifications').insert({
      profile_id: user.id,
      didit_session_id: s.session_id,
      didit_status: s.status ?? 'Not Started',
      status: 'pendiente',
    })

    return json({ url: s.url, session_id: s.session_id })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
