import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, Landmark, CheckCircle2, Loader2, Info } from 'lucide-react'
import { fmtRD } from '../data/demo'
import { getMyFinancing, getMyPreapprovalInterests, expressPreapprovalInterest } from '../data/api'
import { useAuth } from '../context/AuthContext'
import { isInstitutionProfile } from '../data/roles'

// Call-to-action for a vehicle, aware of the buyer's car-agnostic pre-approval.
//
// A pre-approved buyer looking at a car within their limit should never see a
// cold "Solicitar financiamiento" — they're already approved. They can flag
// INTEREST in as many in-budget cars as they like (each dealer is notified that
// this buyer can already buy their car); committing to one car happens
// elsewhere ("Usar mi pre-aprobación"), which archives the other interests.
export default function PreapprovalCta({ vehicle, onNavigate, compact = false, onCalculator }) {
  const { profile } = useAuth() || {}
  const institutionUser = isInstitutionProfile(profile)
  const [pre, setPre] = useState(undefined)   // undefined = loading, null = none
  const [interested, setInterested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (institutionUser) {
      setPre(null)
      return undefined
    }
    let alive = true
    Promise.all([getMyFinancing().catch(() => null), getMyPreapprovalInterests().catch(() => ({}))])
      .then(([fin, interests]) => {
        if (!alive) return
        // Only a car-agnostic, still-open pre-approval counts here.
        const open = fin && fin.isPreapproval && !fin.vehicle && !fin.clientAcceptedAt ? fin : null
        setPre(open)
        const st = vehicle?.dbId ? interests[vehicle.dbId] : null
        setInterested(st === 'activa' || st === 'convertida')
      })
    return () => { alive = false }
  }, [vehicle?.dbId, institutionUser])

  const ceiling = pre?.approvedAmount || 0
  const price = Number(vehicle?.price) || 0
  const inBudget = ceiling > 0 && price > 0 && price <= ceiling
  const shortfall = ceiling > 0 && price > ceiling ? price - ceiling : 0

  async function flagInterest() {
    if (!vehicle?.dbId) return
    setBusy(true); setErr('')
    const r = await expressPreapprovalInterest(vehicle.dbId)
    setBusy(false)
    if (r?.ok) setInterested(true)
    else if (r?.reason === 'over_budget') setErr('Este vehículo supera tu monto pre-aprobado.')
    else setErr('No pudimos registrar tu interés. Intenta de nuevo.')
  }

  if (institutionUser) {
    if (onCalculator) {
      return (
        <button className={`btn btn-primary btn-block ${compact ? 'btn-lg ficha-action-primary' : 'btn-lg'}`} onClick={onCalculator}>
          <Calculator size={17} /> Calcular cuota
        </button>
      )
    }
    return (
      <Link to={`/vehiculo/${vehicle.id}?calc=1`} className={`btn btn-primary btn-block ${compact ? 'btn-lg ficha-action-primary' : 'btn-lg'}`} onClick={onNavigate}>
        <Calculator size={17} /> Calcular cuota
      </Link>
    )
  }

  // No (usable) pre-approval → the normal path.
  if (pre === undefined || !pre || ceiling <= 0) {
    return (
      <Link to={`/financiamiento?vehiculo=${vehicle.id}`} className={`btn btn-primary btn-block ${compact ? 'btn-lg ficha-action-primary' : 'btn-lg'}`} onClick={onNavigate}>
        Solicitar financiamiento
      </Link>
    )
  }

  // Pre-approved but this car is out of range — be explicit about why.
  if (!inBudget) {
    return (
      <>
        <div className="notice" style={{ marginBottom: 8 }}>
          <Info size={16} />
          <span className="small">Estás pre-aprobado hasta {fmtRD(ceiling)}. Este vehículo necesita {fmtRD(shortfall)} más (inicial o nueva aprobación).</span>
        </div>
        <Link to={`/financiamiento?vehiculo=${vehicle.id}`} className={`btn btn-primary btn-block ${compact ? 'btn-lg ficha-action-primary' : 'btn-lg'}`} onClick={onNavigate}>
          Solicitar financiamiento para este vehículo
        </Link>
      </>
    )
  }

  // Pre-approved AND in range — the good case.
  return (
    <>
      <div className="chip chip-teal" style={{ height: 'auto', padding: '8px 12px', display: 'inline-flex', marginBottom: 8 }}>
        <Landmark size={14} /> Ya estás pre-aprobado para este carro · hasta {fmtRD(ceiling)}
      </div>
      {interested ? (
        <div className="notice" style={{ borderColor: 'var(--green-bd)', background: 'var(--green-bg)', marginBottom: compact ? 0 : 8 }}>
          <CheckCircle2 size={16} color="var(--green)" />
          <span className="small">Le avisamos al dealer que estás pre-aprobado e interesado. Te contactarán.</span>
        </div>
      ) : (
        <button className={`btn btn-primary btn-block ${compact ? 'btn-lg ficha-action-primary' : 'btn-lg'}`} disabled={busy} onClick={flagInterest}>
          {busy ? <><Loader2 size={17} className="spin" /> Avisando al dealer…</> : 'Me interesa este carro'}
        </button>
      )}
      {err && <div className="tiny" style={{ color: '#b91c1c', marginTop: 6 }}>{err}</div>}
    </>
  )
}
