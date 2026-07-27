import { useEffect, useState } from 'react'
import { getMyFinancing } from '../data/api'
import { isInstitutionProfile } from '../data/roles'
import { useAuth } from '../context/AuthContext'

// The buyer's current financing ceiling, shared by every surface that needs it.
//
// A results page renders dozens of VehicleCards; each one asking the API for the
// same approval would be dozens of identical requests per keystroke of
// filtering. The promise is cached per user id, so the first card to ask pays
// for it and the rest await the same promise. Re-keying on uid means signing out
// or switching accounts cannot serve the previous person's ceiling.

let cacheUid
let cachePromise = null

function load(uid) {
  if (cacheUid !== uid || !cachePromise) {
    cacheUid = uid
    cachePromise = getMyFinancing().catch(() => null)
  }
  return cachePromise
}

// Call after anything that changes the approval (accepting an offer, a new
// application) so the next read is fresh rather than the stale cached promise.
export function invalidateApproval() {
  cacheUid = undefined
  cachePromise = null
}

const EMPTY = { loading: false, ceiling: 0, apr: null, term: null, isPreapproval: false }

export default function useApproval() {
  const { user, profile } = useAuth() || {}
  const [state, setState] = useState({ ...EMPTY, loading: true })

  useEffect(() => {
    // Dealer and bank staff do not shop against a personal approval, and asking
    // would put a financing request on an institution account.
    if (!user || isInstitutionProfile(profile)) { setState(EMPTY); return undefined }
    let alive = true
    load(user.id).then((c) => {
      if (!alive) return
      // getMyFinancing already excludes expired responses from approvedAmount;
      // this picks the matching response for its rate and term.
      const best = (c?.responses || [])
        .filter((r) => Number(r.approvedAmount) > 0 && !r.expired)
        .sort((a, b) => (b.approvedAmount || 0) - (a.approvedAmount || 0))[0] || null
      setState({
        loading: false,
        ceiling: Number(c?.approvedAmount) || 0,
        apr: best?.apr ?? null,
        term: best?.term ?? null,
        isPreapproval: !!c?.isPreapproval,
      })
    })
    return () => { alive = false }
  }, [user?.id, profile?.role])

  return state
}
