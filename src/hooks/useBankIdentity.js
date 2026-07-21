import { useEffect, useMemo, useState } from 'react'
import { banks as demoBanks } from '../data/demo'
import { listBanks } from '../data/api'

const DEFAULT_BANK = demoBanks.find((bank) => bank.id === 'bhd') || demoBanks[0]

export default function useBankIdentity(profile) {
  const [banks, setBanks] = useState(demoBanks)

  useEffect(() => {
    let alive = true
    listBanks()
      .then((rows) => { if (alive && rows?.length) setBanks(rows) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  return useMemo(() => {
    const bankId = profile?.bank_id || profile?.bankId || profile?.bank_slug || profile?.bankSlug
    const bank = banks.find((item) => (
      item.dbId === bankId ||
      item.id === bankId ||
      item.slug === bankId ||
      item.name === profile?.bank_name
    ))
    return bank || DEFAULT_BANK
  }, [banks, profile])
}
