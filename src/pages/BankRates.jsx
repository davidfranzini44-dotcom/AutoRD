import { useEffect, useState } from 'react'
import { Save, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import BankLogo from '../components/BankLogo'
import useBankIdentity from '../hooks/useBankIdentity'
import { getMyBankRates, saveBankRate, getMyBankRules, saveBankRules } from '../data/api'
import { estimateMonthly } from '../data/finance'
import { fmtRD } from '../data/demo'

const TERMS = [1, 2, 3, 4, 5, 6, 7, 8]
const SAMPLE = 1000000 // reference principal for the monthly preview
// canonical fuel value (matches vehicles.fuel) -> label shown to the bank
const FUELS = [
  { key: 'Gasolina', label: 'Gasolina' },
  { key: 'Diésel', label: 'Gasoil' },
  { key: 'Híbrido', label: 'Híbrido' },
  { key: 'Eléctrico', label: 'Eléctrico' },
]

export default function BankRates() {
  const { profile } = useAuth() || {}
  const bank = useBankIdentity(profile)
  const [rates, setRates] = useState({})            // { fuel: { term: aprString } }
  const [rules, setRules] = useState({ maxTermNew: '8', maxTermUsed: '5' })
  const [activeFuel, setActiveFuel] = useState('Gasolina')
  const [dirty, setDirty] = useState(() => new Set())   // "fuel:term"
  const [rulesDirty, setRulesDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([getMyBankRates(), getMyBankRules()]).then(([m, rl]) => {
      if (!alive) return
      const next = {}
      FUELS.forEach((f) => {
        next[f.key] = {}
        TERMS.forEach((t) => { next[f.key][t] = m[f.key]?.[t] != null ? String(m[f.key][t]) : '' })
      })
      setRates(next)
      setRules({ maxTermNew: String(rl.maxTermNew), maxTermUsed: String(rl.maxTermUsed) })
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const onEditRate = (fuel, term, v) => {
    const clean = v.replace(/[^0-9.]/g, '').slice(0, 6)
    setRates((r) => ({ ...r, [fuel]: { ...(r[fuel] || {}), [term]: clean } }))
    setDirty((d) => new Set(d).add(`${fuel}:${term}`))
    setSaved(false)
  }
  const onEditRule = (field, v) => {
    const clean = v.replace(/[^0-9]/g, '').slice(0, 2)
    setRules((r) => ({ ...r, [field]: clean }))
    setRulesDirty(true)
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    for (const key of dirty) {
      const [fuel, term] = key.split(':')
      const v = rates[fuel]?.[term]
      if (v != null && v !== '' && !Number.isNaN(Number(v))) await saveBankRate(fuel, Number(term), Number(v))
    }
    if (rulesDirty) await saveBankRules(Number(rules.maxTermNew) || 8, Number(rules.maxTermUsed) || 5)
    setDirty(new Set())
    setRulesDirty(false)
    setSaving(false)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  const hasChanges = dirty.size > 0 || rulesDirty
  const maxNew = Number(rules.maxTermNew) || 8
  const maxUsed = Number(rules.maxTermUsed) || 5

  return (
    <div>
      <div className="admin-head">
        <div className="row center gap-10">
          <BankLogo slug={bank.id || bank.slug} name={bank.name} initials={bank.initials} color={bank.color} size={30} />
          <div>
            <h1>Tasas y reglas de financiamiento</h1>
            <p className="muted small">Configura la tasa (APR) de {bank.name} por tipo de combustible y plazo, y hasta cuántos años financias según la condición del vehículo.</p>
          </div>
        </div>
      </div>

      {/* Financing rules */}
      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: '0 0 3px' }}>Reglas de financiamiento</h3>
        <p className="tiny muted" style={{ margin: '0 0 14px' }}>Plazo máximo que financias según la condición. Ej.: si no financias un usado a 7 años, pon 5 o 6 en “usados”.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <label className="col gap-4">
            <span className="tiny strong">Plazo máx. · autos nuevos</span>
            <div className="rate-input-wrap" style={{ maxWidth: 130 }}>
              <input className="input rate-input" inputMode="numeric" value={rules.maxTermNew} onChange={(e) => onEditRule('maxTermNew', e.target.value)} aria-label="Plazo máximo autos nuevos" />
              <span className="rate-pct" style={{ fontSize: 12 }}>años</span>
            </div>
          </label>
          <label className="col gap-4">
            <span className="tiny strong">Plazo máx. · autos usados</span>
            <div className="rate-input-wrap" style={{ maxWidth: 130 }}>
              <input className="input rate-input" inputMode="numeric" value={rules.maxTermUsed} onChange={(e) => onEditRule('maxTermUsed', e.target.value)} aria-label="Plazo máximo autos usados" />
              <span className="rate-pct" style={{ fontSize: 12 }}>años</span>
            </div>
          </label>
        </div>
      </div>

      {/* Rate card by fuel */}
      <div className="card card-pad rate-card">
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {FUELS.map((f) => {
            const on = activeFuel === f.key
            return (
              <button key={f.key} type="button" onClick={() => setActiveFuel(f.key)}
                style={{ flex: '1 1 auto', minWidth: 84, height: 38, borderRadius: 9, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                  background: on ? 'var(--teal-700)' : '#fff', color: on ? '#fff' : 'var(--ink-2)', border: `1px solid ${on ? 'var(--teal-700)' : 'var(--line)'}` }}>
                {f.label}
              </button>
            )
          })}
        </div>

        <div className="rate-row rate-head">
          <span>Plazo</span>
          <span>Tasa anual (APR)</span>
          <span className="rate-preview-col">Cuota por {fmtRD(SAMPLE)}</span>
        </div>
        {TERMS.map((t) => {
          const raw = rates[activeFuel]?.[t] ?? ''
          const apr = Number(raw)
          const valid = raw !== '' && !Number.isNaN(apr)
          const monthly = valid ? estimateMonthly(SAMPLE, apr, t * 12) : null
          const hint = t > maxNew ? { t: 'No financiado', c: 'var(--red, #b42318)' }
            : t > maxUsed ? { t: 'Solo nuevos', c: '#b45309' } : null
          return (
            <div className="rate-row" key={t} style={hint && hint.t === 'No financiado' ? { opacity: .55 } : undefined}>
              <div className="rate-term">
                {t} {t === 1 ? 'año' : 'años'}
                {hint && <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: hint.c, letterSpacing: '.02em' }}>{hint.t}</span>}
              </div>
              <div className="rate-input-wrap">
                <input className="input rate-input" inputMode="decimal" value={raw} onChange={(e) => onEditRate(activeFuel, t, e.target.value)} placeholder="0.00" aria-label={`Tasa ${activeFuel} a ${t} años`} />
                <span className="rate-pct">%</span>
              </div>
              <div className="rate-preview-col rate-preview">{monthly != null ? `${fmtRD(Math.round(monthly))}/mes` : '—'}</div>
            </div>
          )
        })}
        <div className="rate-actions">
          <button className="btn btn-primary" onClick={save} disabled={!hasChanges || saving}>
            {saving ? 'Guardando…' : saved ? <><Check size={16} /> Guardado</> : <><Save size={16} /> Guardar cambios</>}
          </button>
          <span className="tiny muted">Cuota de referencia (sin inicial, {fmtRD(SAMPLE)}). “Solo nuevos” = ese plazo supera tu máximo para usados.</span>
        </div>
      </div>
    </div>
  )
}
