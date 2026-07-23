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
  const SaveBtn = ({ block }) => (
    <button className={`btn btn-primary ${block ? 'btn-block' : ''}`} onClick={save} disabled={!hasChanges || saving}>
      {saving ? 'Guardando…' : saved ? <><Check size={16} /> Guardado</> : <><Save size={16} /> Guardar cambios</>}
    </button>
  )

  return (
    <div className="bankx">
      <div className="container bankx-container">
        <div className="bankx-head">
          <div className="row center gap-10">
            <div className="bankx-brand-logo"><BankLogo slug={bank.id || bank.slug} name={bank.name} initials={bank.initials} color={bank.color} size={30} /></div>
            <div>
              <h1>Tasas y reglas · {bank.name}</h1>
              <p className="muted small">Configura la tasa (APR) por combustible y plazo, y hasta cuántos años financias según la condición.</p>
            </div>
          </div>
          <div className="hide-mobile"><SaveBtn /></div>
        </div>

        <div className="bankx-rate-layout">
          {/* Rules */}
          <aside className="card pad">
            <div className="strong" style={{ marginBottom: 3 }}>Reglas de financiamiento</div>
            <p className="tiny muted" style={{ marginBottom: 16 }}>Plazo máximo que financias según la condición del vehículo.</p>
            <div className="col gap-10">
              <label className="bankx-rule">
                <span className="tiny strong">Autos nuevos · plazo máx.</span>
                <div className="bankx-rule-input">
                  <input className="input" inputMode="numeric" value={rules.maxTermNew} onChange={(e) => onEditRule('maxTermNew', e.target.value)} aria-label="Plazo máximo autos nuevos" />
                  <span>años</span>
                </div>
              </label>
              <label className="bankx-rule">
                <span className="tiny strong">Autos usados · plazo máx.</span>
                <div className="bankx-rule-input">
                  <input className="input" inputMode="numeric" value={rules.maxTermUsed} onChange={(e) => onEditRule('maxTermUsed', e.target.value)} aria-label="Plazo máximo autos usados" />
                  <span>años</span>
                </div>
              </label>
            </div>
            <div className="tiny muted" style={{ marginTop: 12 }}>Ej.: si no financias un usado a 7 años, pon 5 o 6 en “usados”.</div>
            <div style={{ marginTop: 16 }}><SaveBtn block /></div>
          </aside>

          {/* Rate card by fuel */}
          <section className="card pad">
            <div className="bankx-fuels">
              {FUELS.map((f) => {
                const on = activeFuel === f.key
                return (
                  <button key={f.key} type="button" className={`bankx-fuel ${on ? 'active' : ''}`} onClick={() => setActiveFuel(f.key)}>
                    <b>{f.label}</b>
                    <span className={`pill ${on ? 'green' : ''}`}>{on ? 'Activo' : 'Config'}</span>
                  </button>
                )
              })}
            </div>

            <div className="bankx-rate-table">
              <div className="bankx-rate-row head"><span>Plazo</span><span>Tasa APR</span><span>Cuota por {fmtRD(SAMPLE)}</span><span>Regla</span></div>
              {TERMS.map((t) => {
                const raw = rates[activeFuel]?.[t] ?? ''
                const apr = Number(raw)
                const valid = raw !== '' && !Number.isNaN(apr)
                const monthly = valid ? estimateMonthly(SAMPLE, apr, t * 12) : null
                const hint = t > maxNew ? { t: 'No financiado', cls: 'red' } : t > maxUsed ? { t: 'Solo nuevos', cls: 'amber' } : { t: 'Nuevo/usado', cls: 'green' }
                return (
                  <div className="bankx-rate-row" key={t} style={hint.t === 'No financiado' ? { opacity: 0.55 } : undefined}>
                    <b>{t} {t === 1 ? 'año' : 'años'}</b>
                    <div className="bankx-rate-input">
                      <input className="input" inputMode="decimal" value={raw} onChange={(e) => onEditRate(activeFuel, t, e.target.value)} placeholder="0.00" aria-label={`Tasa ${activeFuel} a ${t} años`} />
                      <span>%</span>
                    </div>
                    <b className="tiny bankx-rate-cuota">{monthly != null ? `${fmtRD(Math.round(monthly))}/mes` : '—'}</b>
                    <span className={`pill ${hint.cls}`}>{hint.t}</span>
                  </div>
                )
              })}
            </div>
            <p className="tiny muted" style={{ marginTop: 12 }}>Cuota de referencia por {fmtRD(SAMPLE)} sin inicial. “Solo nuevos” = ese plazo supera tu máximo para usados; “No financiado” = supera el máximo para nuevos.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
