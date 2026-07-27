// AutoRD — DR expired-cédula grace: the decision logic, isolated and pure.
//
// This lives on its own because it broke TWICE in production in one day — once
// too strict (real applicants declined because Didit attached advisory notes),
// once too loose (a session graced before its liveness check had run). Both were
// pure functions over a JSON payload, so both were testable. See kyc-grace.test.js,
// whose fixtures are the actual payloads from those two incidents.
//
// Imported by index.ts (Deno) and by the test suite (Vitest) — keep it free of
// any runtime-specific imports.

// Dominican cédulas kept circulating past their printed expiry while the JCE
// rolled out renewals, so an EXPIRED-but-otherwise-valid cédula should still
// pass KYC — but only until this cutoff, after which normal rules resume.
export const CEDULA_GRACE_UNTIL_MS = Date.UTC(2027, 0, 1) // 2027-01-01T00:00:00Z
export const cedulaGraceActive = (now: number = Date.now()) => now < CEDULA_GRACE_UNTIL_MS

export const EXPIRY_RE = /expir|vencid|caducid/ // expired / vencida / caducidad

export type Warn = { text: string; blocking: boolean }

// Didit marks real problems with log_type 'error' and advisory notes as
// 'information' (e.g. UNPARSED_ADDRESS when a DR address can't be geolocated, or
// POSSIBLE_DUPLICATED_USER when the person simply retried). Advisory notes must
// NOT cancel the grace.
const NON_BLOCKING_SEVERITY = /^(information|info|notice)$/

export function collectWarnings(d: any): Warn[] {
  const out: Warn[] = []
  const first = (v: any) => (Array.isArray(v) ? v[0] : v)
  const pushFrom = (arr: any) => {
    if (!Array.isArray(arr)) return
    for (const w of arr) {
      if (typeof w === 'string') {
        out.push({ text: w.toLowerCase(), blocking: true })
      } else if (w && typeof w === 'object') {
        const text = String(w.risk ?? w.code ?? w.type ?? w.name ?? w.description ?? w.message ?? '').toLowerCase()
        const sev = String(w.log_type ?? w.severity ?? w.level ?? 'error').toLowerCase()
        if (text) out.push({ text, blocking: !NON_BLOCKING_SEVERITY.test(sev) })
      }
    }
  }
  pushFrom(d?.warnings)
  pushFrom(d?.decision?.warnings)
  pushFrom((first(d?.id_verifications) ?? d?.id_verification)?.warnings)
  return out
}

// A biometric check counts as passed when its status reads approved/passed.
// NOTE: an ABSENT check returns true here — callers that require the check to
// have actually run must test for presence themselves (see expiredCedulaOnly).
export function checkPassed(v: any): boolean {
  const o = Array.isArray(v) ? v[0] : v
  if (!o) return true
  const st = String(o.status ?? o.decision ?? o.result ?? '').toLowerCase()
  if (!st) return true
  return /approv|pass|success|match|clear|ok/.test(st) && !/declin|fail|reject|no.?match|not.?/.test(st)
}

// The document's printed expiration date, if present and parseable, is in the past.
export function documentExpired(d: any, now: number = Date.now()): boolean {
  const idv = (Array.isArray(d?.id_verifications) ? d.id_verifications[0] : d?.id_verifications) ?? d?.id_verification ?? {}
  const raw = idv.date_of_expiration ?? idv.expiration_date ?? idv.expiry_date ?? idv.expires_at ?? idv.document_expiry
  if (!raw) return false
  const t = Date.parse(String(raw))
  return Number.isFinite(t) && t < now
}

// True when the ONLY blocking problem is an expired document: liveness actually
// ran and passed, face match (if the workflow ran it) passed, every
// error-severity warning is the expiry itself, and expiry is really flagged.
export function expiredCedulaOnly(d: any, now: number = Date.now()): boolean {
  if (!d) return false
  const blocking = collectWarnings(d).filter((w) => w.blocking)
  if (blocking.some((w) => !EXPIRY_RE.test(w.text))) return false // a real, non-expiry problem
  // Liveness must have actually RUN. On a still-in-progress session the checks
  // are absent, and "absent" must not count as success.
  const live = Array.isArray(d?.liveness_checks) ? d.liveness_checks[0] : (d?.liveness_checks ?? d?.liveness)
  if (!live || !checkPassed(live)) return false
  if (!checkPassed(d?.face_matches ?? d?.face_match)) return false
  return blocking.some((w) => EXPIRY_RE.test(w.text)) || documentExpired(d, now)
}

// Last 4 digits of the verified cédula, for the client-portal identity gate.
export function extractCedulaLast4(decision: any): string | null {
  const first = (v: any) => (Array.isArray(v) ? v[0] : v)
  const idv = first(decision?.id_verifications) ?? decision?.id_verification ?? decision?.document ?? {}
  const raw = idv?.personal_number ?? idv?.document_number ?? idv?.national_number
    ?? idv?.id_number ?? idv?.number ?? decision?.personal_number
  if (!raw) return null
  const digits = String(raw).replace(/[^0-9]/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}
