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
async function captureIdentityImages(admin: any, apiKey: string, sessionId: string, profileId: string, decision?: any) {
  let d: any = decision
  if (!d) {
    const r = await fetch(`${DIDIT_BASE}/session/${sessionId}/decision/`, { headers: { 'x-api-key': apiKey } })
    if (!r.ok) return
    d = await r.json().catch(() => ({}))
  }

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

// ---- DR cédula grace ----------------------------------------------------
// Dominican cédulas kept circulating past their printed expiry while the JCE
// rolled out renewals, so an EXPIRED-but-otherwise-valid cédula should still
// pass KYC — but only until this cutoff, after which normal rules resume.
const CEDULA_GRACE_UNTIL_MS = Date.UTC(2027, 0, 1) // 2027-01-01T00:00:00Z
const cedulaGraceActive = () => Date.now() < CEDULA_GRACE_UNTIL_MS
const EXPIRY_RE = /expir|vencid|caducid/ // expired / vencida / caducidad

// Gather warning "reason" strings from a Didit decision (schema varies by
// workflow version), lowercased.
function collectWarnings(d: any): string[] {
  const out: string[] = []
  const first = (v: any) => (Array.isArray(v) ? v[0] : v)
  const pushFrom = (arr: any) => {
    if (!Array.isArray(arr)) return
    for (const w of arr) {
      if (typeof w === 'string') out.push(w)
      else if (w && typeof w === 'object') out.push(String(w.risk ?? w.code ?? w.type ?? w.name ?? w.description ?? w.message ?? ''))
    }
  }
  pushFrom(d?.warnings)
  pushFrom(d?.decision?.warnings)
  pushFrom((first(d?.id_verifications) ?? d?.id_verification)?.warnings)
  return out.map((s) => s.toLowerCase()).filter(Boolean)
}

// A biometric check (liveness / face match) counts as passed when it's absent
// or its status reads approved/passed and not failed.
function checkPassed(v: any): boolean {
  const o = Array.isArray(v) ? v[0] : v
  if (!o) return true
  const st = String(o.status ?? o.decision ?? o.result ?? '').toLowerCase()
  if (!st) return true
  return /approv|pass|success|match|clear|ok/.test(st) && !/declin|fail|reject|no.?match|not.?/.test(st)
}

// The document's printed expiration date, if present and parseable, is in the past.
function documentExpired(d: any): boolean {
  const idv = (Array.isArray(d?.id_verifications) ? d.id_verifications[0] : d?.id_verifications) ?? d?.id_verification ?? {}
  const raw = idv.date_of_expiration ?? idv.expiration_date ?? idv.expiry_date ?? idv.expires_at ?? idv.document_expiry
  if (!raw) return false
  const t = Date.parse(String(raw))
  return Number.isFinite(t) && t < Date.now()
}

// True when the ONLY problem with an otherwise-clean verification is an expired
// document: biometrics passed, no non-expiry warnings, and expiry is flagged.
function expiredCedulaOnly(d: any): boolean {
  if (!d) return false
  const warns = collectWarnings(d)
  if (warns.some((w) => !EXPIRY_RE.test(w))) return false // another issue exists
  if (!checkPassed(d?.liveness_checks ?? d?.liveness) || !checkPassed(d?.face_matches ?? d?.face_match)) return false
  return warns.some((w) => EXPIRY_RE.test(w)) || documentExpired(d)
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
  let approved = status === 'Approved'
  let declined = status === 'Declined'

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Fetch the authoritative decision when we may need it — to capture images on
  // approval, or to evaluate the expired-cédula grace on a non-approval.
  const apiKey = Deno.env.get('DIDIT_API_KEY')
  let decision: any = null
  if (sessionId && apiKey && (approved || cedulaGraceActive())) {
    try {
      const r = await fetch(`${DIDIT_BASE}/session/${sessionId}/decision/`, { headers: { 'x-api-key': apiKey } })
      if (r.ok) decision = await r.json().catch(() => null)
    } catch (_) { /* non-fatal */ }
  }

  // DR cédula grace: accept an otherwise-clean verification whose ONLY problem is
  // an expired document, until 2027-01-01 (biometrics must have passed).
  let graced = false
  if (!approved && cedulaGraceActive() && expiredCedulaOnly(decision)) {
    approved = true
    declined = false
    graced = true
  }

  if (sessionId) {
    await admin.from('kyc_verifications').update({
      didit_status: graced ? `${status} (cédula vencida · gracia)` : status,
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

  // On approval (including graced), best-effort capture the cédula + liveness
  // images. Wrapped so a Didit hiccup never turns a success into a failed webhook.
  if (approved && sessionId && apiKey) {
    // Resolve the owning profile id (vendor_data carries the user id at session creation).
    let profileId = vendorData
    if (!profileId) {
      const { data } = await admin.from('kyc_verifications').select('profile_id').eq('didit_session_id', sessionId).maybeSingle()
      profileId = data?.profile_id
    }
    if (profileId) {
      try { await captureIdentityImages(admin, apiKey, sessionId, profileId, decision) } catch (_) { /* non-fatal */ }
    }
  }

  return new Response('ok')
})
