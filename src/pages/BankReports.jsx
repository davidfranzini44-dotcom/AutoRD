import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Sparkles, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import useBankIdentity from '../hooks/useBankIdentity'
import { fmtRD } from '../data/demo'
import { getBankApplications } from '../data/api'
import { enrichApp, bankStats, byDealer, byAmountRange, REVIEWERS } from '../data/bankDemo'

const PERIODS = [{ k: 'mes', l: 'Este mes' }, { k: '7d', l: '7 días' }, { k: 'trim', l: 'Trimestre' }]
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)

export default function BankReports() {
  const { profile } = useAuth() || {}
  const bank = useBankIdentity(profile)
  const [apps, setApps] = useState([])
  const [period, setPeriod] = useState('mes')

  useEffect(() => {
    let alive = true
    getBankApplications(profile?.bank_id, 'todas').then((d) => { if (alive) setApps((d || []).map(enrichApp)) }).catch(() => {})
    return () => { alive = false }
  }, [profile?.bank_id])

  const s = bankStats(apps)
  const total = apps.length
  const dealers = byDealer(apps)
  const ranges = byAmountRange(apps)
  const kycComplete = apps.filter((a) => a.kyc === 'aprobado').length
  const unassigned = apps.filter((a) => !a.reviewer && !['preaprobada', 'rechazada'].includes(a.status)).length

  // Portfolio-health ring: real approval rate.
  const healthScore = s.approvalRate
  const healthLabel = healthScore >= 60 ? 'Mejorando' : healthScore >= 40 ? 'Estable' : 'Requiere atención'
  const healthTone = healthScore >= 60 ? 'green' : healthScore >= 40 ? 'amber' : 'red'

  // Funnel: recibidas → KYC → evaluación → docs → pre-aprobadas → rechazadas.
  const funnel = [
    { label: 'Recibidas', n: total },
    { label: 'KYC completo', n: kycComplete },
    { label: 'En evaluación', n: s.evaluando },
    { label: 'Piden docs', n: s.docs, color: '#b45309' },
    { label: 'Pre-aprobadas', n: s.preaprobadas },
    { label: 'Rechazadas', n: s.rechazadas, color: '#b91c1c' },
  ]
  const funnelMax = Math.max(1, total)

  // Per-dealer average SLA (avg hours waiting of that dealer's apps).
  const dealerSla = {}; const dealerCnt = {}
  apps.forEach((a) => { const d = a.dealer || '—'; dealerSla[d] = (dealerSla[d] || 0) + (a.hoursWaiting || 0); dealerCnt[d] = (dealerCnt[d] || 0) + 1 })
  const slaOf = (d) => (dealerCnt[d] ? dealerSla[d] / dealerCnt[d] : 0)
  const estadoOf = (h) => (h < 10 ? { cls: 'green', label: 'Fuerte' } : h < 15 ? { cls: 'amber', label: 'Revisar' } : { cls: 'red', label: 'Lento' })

  const maxRange = Math.max(1, ...ranges.map((r) => r.n))

  // Bottlenecks — actionable.
  const actions = [
    { n: s.waiting.length, dot: 'red', label: 'SLA +24h', sub: 'Priorizar antes del cierre', chip: 'Urgente' },
    { n: s.docs, dot: 'amber', label: 'Docs pendientes', sub: 'Enviar recordatorio automático', chip: 'WhatsApp' },
    { n: unassigned, dot: 'amber', label: 'Sin analista', sub: 'Asignar por carga actual', chip: 'Asignar' },
    { n: s.pendingCustomer, dot: '', label: 'Cliente no confirma', sub: 'Pre-aprobado esperando respuesta', chip: 'Follow-up' },
  ]

  // SLA per analyst.
  const analysts = REVIEWERS.map((r) => {
    const mine = apps.filter((a) => a.reviewer?.id === r.id)
    const active = mine.filter((a) => !['preaprobada', 'rechazada'].includes(a.status)).length
    const listas = mine.filter((a) => a.status === 'evaluando' && a.kyc === 'aprobado' && a.consent).length
    const avgH = mine.length ? mine.reduce((x, a) => x + (a.hoursWaiting || 0), 0) / mine.length : 0
    return { ...r, active, listas, avgH }
  })
  const slaPill = (h) => (h < 8 ? 'green' : h < 12 ? 'amber' : 'red')

  // Daily trend: histogram of application recency (real hoursWaiting distribution).
  const maxHrs = Math.max(1, ...apps.map((a) => a.hoursWaiting || 0))
  const buckets = Array(12).fill(0)
  apps.forEach((a) => { const idx = Math.min(11, Math.floor(((a.hoursWaiting || 0) / (maxHrs + 0.001)) * 12)); buckets[11 - idx] += 1 })
  const maxB = Math.max(1, ...buckets)
  const spark = buckets.map((b) => Math.max(10, Math.round((b / maxB) * 100)))
  const recent = spark.slice(6).reduce((x, y) => x + y, 0); const older = spark.slice(0, 6).reduce((x, y) => x + y, 0)
  const sparkTrend = older ? Math.round(((recent - older) / older) * 100) : 0

  const kpis = [
    { label: 'Solicitudes', v: total, delta: 'Mes actual' },
    { label: 'Pre-aprobadas', v: s.preaprobadas, delta: `${pct(s.preaprobadas, total)}% conversión` },
    { label: 'Rechazadas', v: s.rechazadas, pill: { cls: 'red', t: `${pct(s.rechazadas, total)}%` } },
    { label: 'Respuesta prom.', v: s.avgResponse, delta: 'Promedio' },
    { label: 'Volumen aprobado', v: fmtRD(s.totalApproved), delta: `${s.preaprobadas} ofertas` },
    { label: 'Esperando cliente', v: s.pendingCustomer, pill: { cls: 'amber', t: 'Dar seguimiento' } },
  ]

  return (
    <div className="bankx" style={{ '--bank-accent': bank.color || '#0f766e' }}>
      <div className="container bankx-container">
        {/* Hero + health */}
        <div className="bankx-rep-hero">
          <section className="bankx-rep-hero-main">
            <span className="pill green" style={{ width: 'max-content' }}>Reportes ejecutivos</span>
            <h2>Crédito claro: conversión, SLA y dónde se tranca cada solicitud.</h2>
            <p>Una vista para gerencia y analistas: mide volumen aprobado, calidad por dealer, documentos pendientes y velocidad real de decisión.</p>
            <div className="bankx-rep-period">
              {PERIODS.map((p) => (
                <button key={p.k} className={period === p.k ? 'active' : ''} onClick={() => setPeriod(p.k)}>{p.l}</button>
              ))}
              <button onClick={() => window.print()}><Download size={15} style={{ verticalAlign: -2, marginRight: 4 }} />Exportar PDF</button>
            </div>
          </section>
          <aside className="card pad bankx-rep-readiness">
            <div className="bankx-rep-ptitle">
              <div>
                <h3>Salud de cartera</h3>
                <div className="tiny muted">Tasa de aprobación de decisiones</div>
              </div>
              <span className={`pill ${healthTone}`}>{healthLabel}</span>
            </div>
            <div className="bankx-rep-score">
              <div className="bankx-rep-ring" style={{ background: `conic-gradient(var(--bank-accent, #0f766e) 0 ${healthScore}%, #e7eef6 ${healthScore}% 100%)` }}><span>{healthScore}%</span></div>
              <div>
                <b>{healthScore >= 50 ? 'Buen ritmo de aprobación' : 'Aprobación por debajo de meta'}</b>
                <div className="tiny muted" style={{ marginTop: 4 }}>{s.docs} con documentos pendientes y {unassigned} sin analista asignado frenan decisiones.</div>
              </div>
            </div>
            <Link to="/banco" className="btn btn-navy" style={{ width: '100%' }}>Ver acciones recomendadas</Link>
          </aside>
        </div>

        {/* KPIs */}
        <div className="bankx-rep-kpis">
          {kpis.map((k) => (
            <div className="bankx-rep-kpi" key={k.label}>
              <span className="label">{k.label}</span>
              <strong>{k.v}</strong>
              {k.pill ? <span className={`pill ${k.pill.cls}`}>{k.pill.t}</span> : <span className="delta">{k.delta}</span>}
            </div>
          ))}
        </div>

        {/* 2-column report */}
        <div className="bankx-rep-layout">
          <div className="bankx-rep-stack">
            {/* Funnel */}
            <section className="card pad">
              <div className="bankx-rep-ptitle">
                <div><h3>Funnel de crédito</h3><div className="tiny muted">Desde solicitud recibida hasta decisión final</div></div>
                <span className="pill blue">{total} total</span>
              </div>
              <div className="bankx-rep-funnel">
                {funnel.map((f) => (
                  <div className="bankx-rep-funnel-step" key={f.label}>
                    <b>{f.label}</b>
                    <div className="bankx-rep-bar"><i style={{ width: `${Math.max(2, pct(f.n, funnelMax))}%`, ...(f.color ? { background: f.color } : {}) }} /></div>
                    <strong>{f.n}</strong>
                  </div>
                ))}
              </div>
            </section>

            {/* Dealers by quality */}
            <section className="card pad">
              <div className="bankx-rep-ptitle">
                <div><h3>Dealers por calidad de solicitudes</h3><div className="tiny muted">Volumen, aprobaciones y velocidad de respuesta</div></div>
                <span className="pill blue">{dealers.length}</span>
              </div>
              <div className="bankx-rep-dealer">
                <div className="bankx-rep-dealer-row head"><span>Dealer</span><span className="num">Solic.</span><span className="num">Aprobado</span><span className="num">SLA</span><span>Estado</span></div>
                {dealers.map((d) => {
                  const sla = slaOf(d.dealer); const est = estadoOf(sla)
                  return (
                    <div className="bankx-rep-dealer-row" key={d.dealer}>
                      <b className="nowrap">{d.dealer}</b>
                      <span className="num">{d.apps}</span>
                      <b className="num">{fmtRD(d.volume)}</b>
                      <span className="num">{sla.toFixed(1)} h</span>
                      <span className={`pill ${est.cls}`}>{est.label}</span>
                      <div className="bankx-rep-drow-meta tiny muted">{d.apps} solic · {fmtRD(d.volume)} aprobado · {sla.toFixed(1)} h SLA</div>
                    </div>
                  )
                })}
                {dealers.length === 0 && <div className="tiny muted" style={{ padding: 8 }}>Sin solicitudes de dealers todavía.</div>}
              </div>
            </section>

            {/* Volume by range */}
            <section className="card pad">
              <div className="bankx-rep-ptitle">
                <div><h3>Volumen por rango financiado</h3><div className="tiny muted">Ayuda a ajustar tasas, cupos y requisitos por monto</div></div>
                <span className="pill blue">{fmtRD(s.totalApproved)}</span>
              </div>
              <div className="bankx-rep-range-grid">
                {ranges.map((r) => (
                  <div className="bankx-rep-range-card" key={r.label}>
                    <span className="tiny muted">{r.label}</span>
                    <b>{r.n}</b>
                    <div className="bankx-rep-bar"><i style={{ width: `${Math.max(3, pct(r.n, maxRange))}%` }} /></div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="bankx-rep-stack">
            {/* Bottlenecks */}
            <section className="card pad">
              <div className="bankx-rep-ptitle"><div><h3>Cuellos de botella</h3><div className="tiny muted">Lo que hoy frena decisiones</div></div></div>
              <div className="bankx-rep-alist">
                {actions.map((a) => (
                  <div className="bankx-rep-aitem" key={a.label}>
                    <span className={`bankx-rep-dot ${a.dot}`}>{a.n}</span>
                    <div><b className="small">{a.label}</b><div className="tiny muted">{a.sub}</div></div>
                    <span className="bankx-rep-slachip">{a.chip}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* SLA per analyst */}
            <section className="card pad">
              <div className="bankx-rep-ptitle"><div><h3>SLA por analista</h3><div className="tiny muted">Carga activa y casos listos</div></div></div>
              <div className="bankx-rep-alist">
                {analysts.map((r) => (
                  <div className="bankx-rep-aitem" key={r.id}>
                    <span className="bankx-rep-avatar">{r.initials}</span>
                    <div><b className="small">{r.name}</b><div className="tiny muted">{r.active} activas, {r.listas} lista{r.listas === 1 ? '' : 's'}</div></div>
                    <span className={`pill ${slaPill(r.avgH)}`}>{r.avgH.toFixed(1)} h</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Daily trend */}
            <section className="card pad">
              <div className="bankx-rep-ptitle">
                <div><h3>Tendencia diaria</h3><div className="tiny muted">Actividad reciente de solicitudes</div></div>
                <span className={`pill ${sparkTrend >= 0 ? 'green' : 'red'}`}>{sparkTrend >= 0 ? '+' : ''}{sparkTrend}%</span>
              </div>
              <div className="bankx-rep-spark">{spark.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
            </section>

            {/* Recommendation */}
            <div className="bankx-rep-callout">
              <b className="row center gap-6"><Sparkles size={15} color="var(--bank-accent, #0f766e)" /> Recomendación</b>
              <div className="small muted">Crear regla: si KYC está completo y los documentos están correctos, mover automáticamente a “Lista para decisión”.</div>
              <Link to="/banco/tasas" className="btn btn-primary" style={{ width: 'max-content' }}>Crear regla <ArrowRight size={15} /></Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
