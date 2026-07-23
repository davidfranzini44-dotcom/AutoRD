// AutoRD — Didit webhook receiver
// Didit calls this when a verification session changes status.
// Verifies the HMAC signature, then updates the user's KYC status and, on
// approval, captures the cédula + liveness images into the PRIVATE kyc-images
// bucket (best-effort; never blocks the status update).
//
// Deploy:  supabase functions deploy didit-webhook --no-verify-jwt
// Secrets: DIDIT_WEBHOOK_SECRET, DIDIT_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// In the Didit console, set the webhook URL to this function's URL.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const enc = new TextEncoder()
const DIDIT_BASE = Deno.env.get('DIDIT_BASE_URL') ?? 'https://verification.didit.me/v2'

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

// Dig the first non-empty string that looks like an http(s) URL out of a set of
// candidate fields on a Didit decision sub-object. Field names vary by workflow
// version, so we try several and take the first that resolves.
function pickUrl(obj: any, keys: string[]): string | null {
  if (!obj || typeof obj !== 'object') return null
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return v
  }
  return null
}

function extImage(url: string, contentType: string | null): { ext: string; type: string } {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('png')) return { ext: 'png', type: 'image/png' }
  if (ct.includes('webp')) return { ext: 'webp', type: 'image/webp' }
  if (ct.includes('jpeg') || ct.includes('jpg')) return { ext: 'jpg', type: 'image/jpeg' }
  if (/\.png(\?|$)/i.test(url)) return { ext: 'png', type: 'image/png' }
  if (/\.webp(\?|$)/i.test(url)) return { ext: 'webp', type: 'image/webp' }
  return { ext: 'jpg', type: 'image/jpeg' }
}

// Best-effort: fetch the authoritative decision, locate the ID + liveness
// images, and copy them into the private bucket keyed by the buyer's profile id.
async function captureIdentityImages(admin: any, apiKey: string, sessionId: string, profileId: string) {
  const r = await fetch(`${DIDIT_BASE}/session/${sessionId}/decision/`, { headers: { 'x-api-key': apiKey } })
  if (!r.ok) return
  const d: any = await r.json().catch(() => ({}))

  // Didit v2 groups results in plural arrays (id_verifications, liveness_checks,
  // face_matches). Fall back to the singular object shape just in case.
  const first = (v: any) => (Array.isArray(v) ? v[0] : v)
  const idv = first(d?.id_verifications) ?? d?.id_verification ?? d?.document
  const live = first(d?.liveness_checks) ?? d?.liveness
  const fm = first(d?.face_matches) ?? d?.face_match

  const idUrl = pickUrl(idv, ['front_image', 'portrait_image', 'document_front_image', 'image'])
    ?? pickUrl(d, ['portrait_image'])
  const liveUrl = pickUrl(live, ['reference_image', 'image', 'video_frame_image'])
    ?? pickUrl(fm, ['source_image', 'live_image', 'selfie_image'])

  const uploads: Array<{ url: string; base: string; col: 'id_image_path' | 'liveness_image_path' }> = []
  if (idUrl) uploads.push({ url: idUrl, base: 'id', col: 'id_image_path' })
  if (liveUrl) uploads.push({ url: liveUrl, base: 'liveness', col: 'liveness_image_path' })
  if (!uploads.length) return

  const patch: Record<string, unknown> = {}
  for (const u of uploads) {
    try {
      const resp = await fetch(u.url)
      if (!resp.ok) continue
      const { ext, type } = extImage(u.url, resp.headers.get('content-type'))
      const bytes = new Uint8Array(await resp.arrayBuffer())
      const path = `${profileId}/${u.base}.${ext}`
      const { error } = await admin.storage.from('kyc-images').upload(path, bytes, { contentType: type, upsert: true })
      if (!error) patch[u.col] = path
    } catch (_) { /* skip this image */ }
  }

  if (Object.keys(patch).length) {
    patch.images_captured_at = new Date().toISOString()
    await admin.from('kyc_verifications').update(patch).eq('didit_session_id', sessionId)
  }
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

  // On approval, best-effort capture the cédula + liveness images. Wrapped so a
  // Didit hiccup never turns a successful verification into a failed webhook.
  const apiKey = Deno.env.get('DIDIT_API_KEY')
  if (approved && sessionId && apiKey) {
    // Resolve the owning profile id (vendor_data carries the user id at session creation).
    let profileId = vendorData
    if (!profileId) {
      const { data } = await admin.from('kyc_verifications').select('profile_id').eq('didit_session_id', sessionId).maybeSingle()
      profileId = data?.profile_id
    }
    if (profileId) {
      try { await captureIdentityImages(admin, apiKey, sessionId, profileId) } catch (_) { /* non-fatal */ }
    }
  }

  return new Response('ok')
})
