// KYC validity helpers. A verified identity is reusable for 12 months; after
// that the buyer must re-verify. Kept pure so the financing flow and the account
// hub share one definition of "still valid".
export const KYC_VALID_DAYS = 365

export function kycValidity(profile) {
  const raw = profile?.kyc_verified_at
  const at = raw ? new Date(raw) : null
  if (!at || isNaN(at.getTime())) {
    return { verified: false, valid: false, at: null, expires: null, daysLeft: 0 }
  }
  const expires = new Date(at.getTime() + KYC_VALID_DAYS * 86_400_000)
  const daysLeft = Math.ceil((expires.getTime() - Date.now()) / 86_400_000)
  return { verified: true, valid: daysLeft > 0, at, expires, daysLeft }
}

export const fmtKycDate = (d) =>
  d ? new Date(d).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
