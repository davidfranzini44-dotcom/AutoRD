import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Check, ShieldCheck, FileSignature, Send, Landmark, Clock, Loader2,
  ChevronRight, Upload, Info, Car, FileWarning,
} from 'lucide-react'
import { banks, fmtRD } from '../data/demo'
import { getMyFinancing } from '../data/api'
import StatusChip from '../components/StatusChip'
import CarImage from '../components/CarImage'
import BankLogo from '../components/BankLogo'

const TL_ICON = { kyc: ShieldCheck, consent: FileSignature, sent: Send, eval: Loader2, offers: Landmark }

export default function MyFinancing() {
  const [c, setC] = useState(undefined)
  useEffect(() => {
    let alive = true
    getMyFinancing().then((d) => { if (alive) setC(d) })
    return () => { alive = false }
  }, [])

  if (c === undefined) return <main className="page"><div className="container muted">Cargando…</div></main>
  if (!c) {
    return (
      <main className="page"><div className="container">
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>Aún no tienes una solicitud</h2>
          <p className="muted small" style={{ marginBottom: 16 }}>Inicia una solicitud de financiamiento desde cualquier vehículo.</p>
          <Link to="/financiamiento" className="btn btn-primary">Solicitar financiamiento</Link>
        </div>
      </div></main>
    )
  }
  const v = c.vehicle
  const offers = c.responses.filter((r) => r.status === 'offer')
  const docsRequested = c.responses.find((r) => r.status === 'docs')
  const preApproved = c.approvedAmount && c.approvedAmount > 0

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 1080 }}>
        <div className="row between center wrap gap-12" style={{ marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 24 }}>{c.isPreapproval ? 'Mi pre-aprobación' : 'Mi financiamiento'}</h1>
            <p className="muted small" style={{ marginTop: 4 }}>{c.isPreapproval ? 'Pre-aprobación' : 'Solicitud'} #{c.code}{c.createdAt ? ` · Enviada el ${new Date(c.createdAt).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</p>
          </div>
          <div className="row gap-8">
            <StatusChip status="aprobado">KYC aprobado</StatusChip>
            <span className="chip chip-teal"><Landmark size={13} /> {c.responses.length} bancos</span>
          </div>
        </div>

        <div className="split" style={{ gridTemplateColumns: '1fr 340px' }}>
          <div className="col gap-16">
            {/* Pre-approval highlight: budget + shop CTA */}
            {preApproved && (
              <div className="card card-pad" style={{ borderColor: 'var(--teal-700)', background: 'var(--teal-50)' }}>
                <div className="row between center wrap gap-12">
                  <div className="row center gap-12">
                    <div className="verify-ic ok" style={{ background: '#fff', color: 'var(--teal-700)' }}><Landmark size={22} /></div>
                    <div>
                      <div className="strong">¡Estás pre-aprobado! Hasta {fmtRD(c.approvedAmount)}</div>
                      <div className="tiny muted">Elige un vehículo dentro de tu presupuesto y lo vinculamos a esta pre-aprobación — sin repetir tu verificación.</div>
                    </div>
                  </div>
                  <Link to={`/buscar?precioMax=${c.approvedAmount}`} className="btn btn-primary">Ver carros dentro de tu presupuesto</Link>
                </div>
              </div>
            )}

            {/* Offers highlight */}
            {offers.length > 0 && (
              <div className="card card-pad" style={{ borderColor: 'var(--green-bd)', background: 'linear-gradient(180deg,#f2fbf6,#fff)' }}>
                <div className="row between center wrap gap-12">
                  <div className="row center gap-12">
                    <div className="verify-ic ok" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}><Check size={22} strokeWidth={3} /></div>
                    <div>
                      <div className="strong">Tienes {offers.length} oferta{offers.length > 1 ? 's' : ''} recibida{offers.length > 1 ? 's' : ''}</div>
                      <div className="tiny muted">Revisa y compara las condiciones de cada banco</div>
                    </div>
                  </div>
                  <a href="#ofertas" className="btn btn-primary">Ver ofertas recibidas ({offers.length})</a>
                </div>
              </div>
            )}

            {/* Document request banner */}
            {docsRequested && (
              <div className="card card-pad" style={{ borderColor: 'var(--amber-bd)', background: 'var(--amber-bg)' }}>
                <div className="row between center wrap gap-12">
                  <div className="row center gap-12">
                    <div className="verify-ic" style={{ background: '#fff', color: 'var(--amber)' }}><FileWarning size={20} /></div>
                    <div>
                      <div className="strong">Banco solicita comprobante de ingresos</div>
                      <div className="tiny" style={{ color: 'var(--amber)' }}>{banks.find((b) => b.id === docsRequested.bankId).name} necesita documentos para continuar</div>
                    </div>
                  </div>
                  <button className="btn btn-navy"><Upload size={16} /> Enviar documentos adicionales</button>
                </div>
              </div>
            )}

            {/* Bank response cards */}
            <div className="card card-pad" id="ofertas">
              <div className="section-title"><h2 style={{ fontSize: 18 }}>Respuestas de bancos</h2></div>
              <div className="col gap-12">
                {c.responses.map((r) => <BankResponse key={r.bankId} r={r} />)}
              </div>
              <div className="notice" style={{ marginTop: 16 }}>
                <Info size={16} /><span>Cada banco realiza su propia evaluación de crédito de forma externa. AutoRD solo transmite tu solicitud y consentimiento y te muestra las respuestas.</span>
              </div>
            </div>
          </div>

          {/* Right: timeline + vehicle */}
          <aside className="side-panel col gap-16">
            <div className="card card-pad">
              <div className="panel-title">Estado de la solicitud</div>
              <div className="timeline">
                {c.timeline.map((t) => {
                  const Icon = TL_ICON[t.key] || Clock
                  return (
                    <div key={t.key} className={`tl-item ${t.state}`}>
                      <div className="tl-dot">{t.state === 'done' ? <Check size={15} strokeWidth={3} /> : <Icon size={15} className={t.key === 'eval' ? 'spin' : ''} />}</div>
                      <div className="tl-body"><div className="tl-name">{t.name}</div><div className="tl-sub">{t.sub}</div></div>
                    </div>
                  )
                })}
              </div>
            </div>

            {v ? (
              <div className="card card-pad">
                <div className="small strong" style={{ marginBottom: 10 }}>Vehículo</div>
                <Link to={`/vehiculo/${v.id}`} className="row center gap-12">
                  <div style={{ width: 76, flex: 'none', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}><CarImage tone={v.tone} /></div>
                  <div className="grow">
                    <div className="strong small">{v.make} {v.model} {v.year}</div>
                    <div className="tiny muted">{v.dealer}</div>
                    <div className="strong" style={{ fontSize: 15, marginTop: 2 }}>{fmtRD(v.price)}</div>
                  </div>
                </Link>
                <div style={{ borderTop: '1px solid var(--line-2)', marginTop: 12, paddingTop: 12 }}>
                  <div className="kv"><span className="k">Monto solicitado</span><span className="v">{c.requestedAmount ? fmtRD(c.requestedAmount) : '—'}</span></div>
                  <div className="kv"><span className="k">Inicial</span><span className="v">{c.down ? fmtRD(c.down) : '—'}</span></div>
                  <div className="kv"><span className="k">Plazo</span><span className="v">{c.term} años</span></div>
                </div>
              </div>
            ) : (
              <div className="card card-pad">
                <div className="small strong row center gap-8" style={{ marginBottom: 10 }}><Landmark size={15} color="var(--teal-700)" /> Pre-aprobación</div>
                <div className="kv"><span className="k">Vehículo</span><span className="v">Aún no elegido</span></div>
                {preApproved && <div className="kv"><span className="k">Pre-aprobado hasta</span><span className="v strong" style={{ color: 'var(--teal-800)' }}>{fmtRD(c.approvedAmount)}</span></div>}
                {c.requestedAmount ? <div className="kv"><span className="k">Monto deseado</span><span className="v">{fmtRD(c.requestedAmount)}</span></div> : null}
                {c.down ? <div className="kv"><span className="k">Inicial</span><span className="v">{fmtRD(c.down)}</span></div> : null}
                <div className="kv"><span className="k">Plazo</span><span className="v">{c.term ? `${c.term} años` : '—'}</span></div>
                {preApproved && (
                  <Link to={`/buscar?precioMax=${c.approvedAmount}`} className="btn btn-outline btn-block btn-sm" style={{ marginTop: 12 }}>Ver carros hasta {fmtRD(c.approvedAmount)}</Link>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}

function BankResponse({ r }) {
  const b = banks.find((x) => x.id === r.bankId) || { id: r.bankId, name: r.bankId || 'Banco', initials: '', color: '#334155' }
  const hasTerms = r.status === 'offer'
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: 'none', borderColor: hasTerms ? 'var(--green-bd)' : 'var(--line)' }}>
      <div className="row center gap-12" style={{ padding: '14px 16px' }}>
        <BankLogo slug={b.id} name={b.name} initials={b.initials} color={b.color} size={22} />
        <div className="grow">
          <div className="strong small">{b.name}</div>
          <div className="tiny muted">{r.note}</div>
        </div>
        <StatusChip status={r.status} />
      </div>
      {hasTerms && (
        <div style={{ background: 'var(--green-bg)', borderTop: '1px solid var(--green-bd)', padding: '12px 16px' }}>
          {r.approvedAmount ? (
            <div className="row center gap-8" style={{ marginBottom: 10 }}>
              <span className="chip chip-teal"><Landmark size={13} /> Pre-aprobado hasta {fmtRD(r.approvedAmount)}</span>
            </div>
          ) : null}
          <div className="grid grid-4" style={{ gap: 10 }}>
            <Term l="Tasa" v={r.apr ? `${r.apr}%` : '—'} />
            <Term l="Plazo" v={r.term ? `${r.term} años` : '—'} />
            <Term l="Inicial requerido" v={r.down ? fmtRD(r.down) : '—'} />
            <Term l="Cuota mensual" v={r.monthly ? fmtRD(r.monthly) : '—'} />
          </div>
          <div className="row gap-8" style={{ marginTop: 12 }}>
            {r.approvedAmount
              ? <Link to={`/buscar?precioMax=${r.approvedAmount}`} className="btn btn-primary btn-sm">Ver carros dentro de tu presupuesto</Link>
              : <button className="btn btn-primary btn-sm">Aceptar oferta</button>}
            <button className="btn btn-outline btn-sm">Ver detalle</button>
          </div>
        </div>
      )}
      {r.status === 'docs' && (
        <div style={{ background: 'var(--amber-bg)', borderTop: '1px solid var(--amber-bd)', padding: '10px 16px' }}>
          <button className="btn btn-navy btn-sm"><Upload size={15} /> Enviar comprobante de ingresos</button>
        </div>
      )}
    </div>
  )
}
function Term({ l, v }) {
  return <div><div className="tiny" style={{ color: 'var(--green)' }}>{l}</div><div className="strong" style={{ fontSize: 14 }}>{v}</div></div>
}
