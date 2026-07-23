import { useEffect, useState } from 'react'
import { Save, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import BankLogo from '../components/BankLogo'
import useBankIdentity from '../hooks/useBankIdentity'
import { getMyBankRates, saveBankRate } from '../data/api'
import { estimateMonthly } from '../data/finance'
import { fmtRD } from '../data/demo'

const TERMS = [1, 2, 3, 4, 5, 6, 7, 8]
const SAMPLE = 1000000 // reference principal for the monthly preview

export default function BankRates() {
  const { profile } = useAuth() || {}
  const bank = useBankIdentity(profile)
  const [rates, setRates] = useState({})       // term -> apr (string)
  const [dirty, setDirty] = useState(() => new Set())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    getMyBankRates().then((m) => {
      if (!alive) return
      const next = {}
      TERMS.forEach((t) => { next[t] = m[t] != null ? String(m[t]) : '' })
      setRates(next)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const onEdit = (term, v) => {
    const clean = v.replace(/[^0-9.]/g, '').slice(0, 6)
    setRates((r) => ({ ...r, [term]: clean }))
    setDirty((d) => new Set(d).add(term))
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    const terms = [...dirty].filter((t) => rates[t] !== '' && !Number.isNaN(Number(rates[t])))
    for (const t of terms) await saveBankRate(t, Number(rates[t]))
    setDirty(new Set())
    setSaving(false)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  const hasDirty = dirty.size > 0

  return (
    <div>
      <div className="admin-head">
        <div className="row center gap-10">
          <BankLogo slug={bank.id || bank.slug} name={bank.name} initials={bank.initials} color={bank.color} size={30} />
          <div>
            <h1>Tasas por plazo</h1>
            <p className="muted small">Configura la tasa de interés (APR) de {bank.name} para cada plazo. Se usan como referencia al calcular la cuota del cliente.</p>
          </div>
        </div>
      </div>

      <div className="card card-pad rate-card">
        <div className="rate-row rate-head">
          <span>Plazo</span>
          <span>Tasa anual (APR)</span>
          <span className="rate-preview-col">Cuota por {fmtRD(SAMPLE)}</span>
        </div>
        {TERMS.map((t) => {
          const apr = Number(rates[t])
          const valid = rates[t] !== '' && !Number.isNaN(apr)
          const monthly = valid ? estimateMonthly(SAMPLE, apr, t * 12) : null
          return (
            <div className="rate-row" key={t}>
              <div className="rate-term">{t} {t === 1 ? 'año' : 'años'}</div>
              <div className="rate-input-wrap">
                <input
                  className="input rate-input"
                  inputMode="decimal"
                  value={rates[t] ?? ''}
                  onChange={(e) => onEdit(t, e.target.value)}
                  placeholder="0.00"
                  aria-label={`Tasa a ${t} años`}
                />
                <span className="rate-pct">%</span>
              </div>
              <div className="rate-preview-col rate-preview">{monthly != null ? `${fmtRD(Math.round(monthly))}/mes` : '—'}</div>
            </div>
          )
        })}
        <div className="rate-actions">
          <button className="btn btn-primary" onClick={save} disabled={!hasDirty || saving}>
            {saving ? 'Guardando…' : saved ? <><Check size={16} /> Guardado</> : <><Save size={16} /> Guardar cambios</>}
          </button>
          <span className="tiny muted">La cuota mostrada es solo una referencia (sin inicial, RD$ 1,000,000).</span>
        </div>
      </div>
    </div>
  )
}
