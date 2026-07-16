// AutoRD — Didit webhook receiver
// Didit calls this when a verification session changes status.
// Verifies the HMAC signature, then updates the user's KYC status.
//
// Deploy:  supabase functions deploy didit-webhook --no-verify-jwt
// Secrets: DIDIT_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// In the Didit console, set the webhook URL to this function's URL.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const enc = new TextEncoder()

async function verify(raw: string, signature: string, secret: string): Promise<boolean> {
  if (!signature) return false
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(raw))
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
  // constant-time-ish compare
  if (hex.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 })
  const raw = await req.text()
  const secret = Deno.env.get('DIDIT_WEBHOOK_SECRET') ?? ''
  const signature = req.headers.get('x-signature') ?? req.headers.get('X-Signature') ?? ''

  if (secret && !(await verify(raw, signature, secret))) {
    return new Response('invalid signature', { status: 401 })
  }

  let evt: any = {}
  try { evt = JSON.parse(raw) } catch { return new Response('bad json', { status: 400 }) }

  const status: string = evt.status ?? evt.decision?.status ?? 'Unknown'
  const sessionId: string = evt.session_id ?? evt.session?.session_id
  const vendorData: string | undefined = evt.vendor_data ?? evt.session?.vendor_data
  const approved = status === 'Approved'
  const declined = status === 'Declined'

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (sessionId) {
    await admin.from('kyc_verifications').update({
      didit_status: status,
      cedula_validated: approved,
      liveness_validated: approved,
      status: approved ? 'aprobado' : declined ? 'rechazado' : 'pendiente',
      decision: evt,
      updated_at: new Date().toISOString(),
    }).eq('didit_session_id', sessionId)
  }

  // Reflect KYC result on the user's in-flight applications.
  if (vendorData && (approved || declined)) {
    await admin.from('financing_applications')
      .update({ kyc_status: approved ? 'aprobado' : 'rechazado' })
      .eq('buyer_id', vendorData)
      .neq('kyc_status', 'aprobado')
  }

  return new Response('ok')
})
