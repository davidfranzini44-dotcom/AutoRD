export function isInstitutionProfile(profile) {
  return profile?.role === 'dealer' || profile?.role === 'bank'
}

export function institutionLabel(profile) {
  if (profile?.role === 'bank') return 'banco'
  if (profile?.role === 'dealer') return 'dealer'
  return ''
}
