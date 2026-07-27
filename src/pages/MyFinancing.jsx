import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { buildChecklist, checklistSummary, CHECK_STATE } from '../data/checklist'
import { resolveFinancingStatus } from '../data/financingStatus'
import { vehicleFit } from '../data/finance'
import { listVehicles } from '../data/api'
import VehicleCard from '../components/VehicleCard'
import { kycValidity } from '../data/kyc'
import { TONE } from '../data/bankDemo'
import { Link } from 'react-router-dom'
import {
  Check, ShieldCheck, FileSignature, Send, Landmark, Clock, Loader2,
  ChevronRight, Upload, Info, Car, FileWarning, FileText,
} from 'lucide-react'
import { banks, fmtRD } from '../data/demo'
import { getApplicationDocuments, getMyFinancing, uploadApplicationDocument, acceptFinancingOfferAuth, getMyInterestList, cancelPreapprovalInterest } from '../data/api'
import StatusChip from '../components/StatusChip'
import CarImage from '../components/CarImage'
import BankLogo from '../components/BankLogo'

const TL_ICON = { kyc: ShieldCheck, consent: FileSignature, sent: Send, eval: Loader2, offers: Landmark }

// Format a date-only ('YYYY-MM-DD') validity date, tz-safe.
const fmtDay = (d) => {
  if (!d) return null
  const s = String(d).length === 10 ? `${d}T12:00:00` : d
  const dt = new Date(s)
  return Number.isFinite(dt.getTime()) ? dt.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }) : null
}

export default function MyFinancing() {
  const { profile } = useAuth() || {}
  const [c, setC] = useState(undefined)
  const [docs, setDocs] = useState([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(null)
  const [docError, setDocError] = useState('')

  const [interests, setInterests] = useState([])
  const reloadInterests = () => getMyInterestList().then(setInterests).catch(() => {})
  useEffect(() => { reloadInterests() }, [])

  const [fitCars, setFitCars] = useState([])

  const reloadFinancing = () => getMyFinancing().then((d) => setC(d)).catch(() => {})

  useEffect(() => {
    let alive = true
    getMyFinancing().then((d) => { if (alive) setC(d) })
    return () => { alive = false }
  }, [])

  // Cars the client could actually drive away in. Filtered by the same
  // vehicleFit() the marketplace cards use, so the hub and the card can never
  // disagree about whether something fits.
  useEffect(() => {
    const ceiling = Number(c?.approvedAmount) || 0
    if (!ceiling || c?.vehicle) { setFitCars([]); return undefined }
    let alive = true
    const best = (c.responses || []).filter((r) => Number(r.approvedAmount) > 0 && !r.expired)
      .sort((a, b) => (b.approvedAmount || 0) - (a.approvedAmount || 0))[0] || null
    listVehicles().then((list) => {
      if (!alive) return
      setFitCars((list || [])
        .filter((v) => vehicleFit({
          price: v.price, approvedAmount: ceiling,
          apr: best?.apr ?? undefined, termYears: best?.term ?? undefined,
        })?.fits)
        // Most car for the budget first — that is what the ceiling is for.
        .sort((a, b) => (b.price || 0) - (a.price || 0))
        .slice(0, 6))
    }).catch(() => { if (alive) setFitCars([]) })
    return () => { alive = false }
  }, [c?.approvedAmount, !!c?.vehicle])

  useEffect(() => {
    if (c === undefined) return undefined
    if (!c) { setDocs([]); return undefined }
    let alive = true
    const appId = c.id || c.code || 'demo'
    setDocsLoading(true)
    getApplicationDocuments(appId)
      .then((rows) => { if (alive) setDocs(rows) })
      .catch(() => { if (alive) setDocs([]) })
      .finally(() => { if (alive) setDocsLoading(false) })
    return () => { alive = false }
  }, [c])

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
  // ?falta=<key> comes from the bank's "Pedir info" WhatsApp message, so the
  // client lands on the exact item instead of a page they have to scan.
  const focusKey = new URLSearchParams(window.location.search).get('falta') || ''
  const docsRequested = c.responses.find((r) => r.status === 'docs')
  const docRows = docs.length ? docs : docsRequested ? [{
    id: 'pending-doc-fallback',
    type: 'Comprobante de ingresos',
    bankId: docsRequested.bankId,
    bankName: banks.find((b) => b.id === docsRequested.bankId)?.name || 'Banco',
    status: 'solicitado',
    demoFallback: true,
  }] : []
  const checklist = buildChecklist({
    profile,
    // Identity counts only while the verification is still inside its 12-month
    // window — an expired KYC is outstanding work, not a completed step.
    kycApproved: kycValidity(profile).valid || c.kyc === 'aprobado',
    documents: docRows,
  })
  const summary = checklistSummary(checklist)
  const fstatus = resolveFinancingStatus(c, summary.outstanding)
  const preApproved = c.approvedAmount && c.approvedAmount > 0
  // The response that grants the ceiling — carries the bank-set validity date.
  const bestPre = c.responses
    .filter((r) => r.approvedAmount && r.approvedAmount > 0)
    .slice().sort((a, b) => (b.approvedAmount || 0) - (a.approvedAmount || 0))[0] || null
  const preValidUntil = bestPre?.validUntil ? fmtDay(bestPre.validUntil) : null
  const preExpired = !!bestPre?.expired

  async function handleUpload(doc, file) {
    if (!file) return
    setDocError('')
    setUploadingDoc(doc.id)
    try {
      const updated = await uploadApplicationDocument(doc, file)
      setDocs((cur) => {
        const exists = cur.some((d) => d.id === updated.id)
        return exists ? cur.map((d) => (d.id === updated.id ? updated : d)) : [updated, ...cur]
      })
    } catch (e) {
      setDocError(e?.message || 'No se pudo subir el documento.')
    } finally {
      setUploadingDoc(null)
    }
  }

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
            {c.contractToken && <a className="chip" href={`/contrato/${c.contractToken}`} target="_blank" rel="noreferrer" style={{ cursor: 'pointer' }}><FileSignature size={13} /> Ver contrato</a>}
          </div>
        </div>

        <div className="split" style={{ gridTemplateColumns: '1fr 340px' }}>
          <div className="col gap-16">
            {/* One status card. This used to be three independent banners
                (pre-aprobación / ofertas / documentos) that could all render at
                once, each with its own primary button — so the page could show
                three "next steps" and no way to tell which one mattered. The
                status is resolved once, in financingStatus.js, and the checklist
                below carries the detail. */}
            <StatusCard s={fstatus} summary={summary} validUntilLabel={fmtDay(fstatus.validUntil)} />

            {/* Cars this buyer flagged against their pre-approval */}
            <MyInterests items={interests} onChanged={reloadInterests} />

            {(docRows.length > 0 || docsLoading) && (
              <DocumentCenter
                docs={docRows}
                loading={docsLoading}
                uploadingDoc={uploadingDoc}
                error={docError}
                onUpload={handleUpload}
              />
            )}

            {/* Everything still standing between the client and a decision, in
                one list: bank document requests used to live here while the
                profile fields lived in Mi cuenta and were never surfaced. */}
            <QueFalta items={checklist} summary={summary} focus={focusKey} />

            {fitCars.length > 0 && (
              <div className="card card-pad">
                <div className="section-title row between center">
                  <h2 style={{ fontSize: 18 }}>Vehículos que puedes financiar</h2>
                  <Link className="tiny" to={`/buscar?precioMax=${c.approvedAmount}`}>Ver todos</Link>
                </div>
                <p className="muted small" style={{ marginTop: -4, marginBottom: 12 }}>
                  Dentro de tu aprobación de {fmtRD(c.approvedAmount)}. Al elegir uno lo vinculamos a esta solicitud sin repetir tu verificación.
                </p>
                <div className="fin-fitgrid">
                  {fitCars.map((v) => <VehicleCard key={v.id} v={v} />)}
                </div>
              </div>
            )}

            {/* Bank response cards */}
            <div className="card card-pad" id="ofertas">
              <div className="section-title"><h2 style={{ fontSize: 18 }}>Respuestas de bancos</h2></div>
              <div className="col gap-12">
                {c.responses.map((r) => <BankResponse key={r.bankId} r={r} appId={c.id} contractToken={c.contractToken} accepted={!!c.clientAcceptedAt} selectedSlug={c.selectedBankSlug} onAccepted={reloadFinancing} />)}
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
                  <div style={{ width: 76, flex: 'none', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}><CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={v.id} tone={v.tone} photo={v.coverPhoto} /></div>
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
                {preApproved && <div className="kv"><span className="k">Vigencia</span><span className="v" style={{ color: preExpired ? 'var(--amber)' : undefined }}>{preValidUntil ? (preExpired ? `Vencida el ${preValidUntil}` : `Hasta ${preValidUntil}`) : 'Sin vencimiento'}</span></div>}
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

function DocumentCenter({ docs, loading, uploadingDoc, error, onUpload }) {
  return (
    <div className="card card-pad" id="documentos">
      <div className="section-title">
        <div>
          <h2 style={{ fontSize: 18 }}>Documentos solicitados</h2>
          <p className="tiny muted" style={{ margin: '3px 0 0' }}>Sube solo PDF, JPG, PNG o WebP. Los archivos quedan privados para ti, el banco y AutoRD.</p>
        </div>
        {loading ? <span className="chip chip-blue"><Loader2 size={13} className="spin" /> Cargando</span> : null}
      </div>
      <div className="doc-list">
        {docs.map((doc) => (
          <DocumentRow key={doc.id} doc={doc} busy={uploadingDoc === doc.id} onUpload={onUpload} />
        ))}
      </div>
      {error && <div className="notice" style={{ marginTop: 12, borderColor: 'var(--red-bd)', background: 'var(--red-bg)' }}><FileWarning size={16} /><span>{error}</span></div>}
    </div>
  )
}

function DocumentRow({ doc, busy, onUpload }) {
  const uploaded = doc.status === 'subido'
  const inputId = `doc-upload-${doc.id}`
  const requestedDate = doc.requestedAt ? new Date(doc.requestedAt).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }) : null
  return (
    <div className="doc-row">
      <div className={`doc-icon ${uploaded ? 'ok' : ''}`}>{uploaded ? <Check size={18} strokeWidth={3} /> : <FileText size={18} />}</div>
      <div className="grow">
        <div className="row center gap-8 wrap">
          <div className="strong small">{doc.type}</div>
          <span className={`chip ${uploaded ? 'chip-green' : 'chip-amber'}`}>{uploaded ? 'Subido' : 'Solicitado'}</span>
        </div>
        <div className="tiny muted">
          {doc.bankName || 'Banco'}{requestedDate ? ` · Solicitado ${requestedDate}` : ''}{doc.fileName ? ` · ${doc.fileName}` : ''}
        </div>
        {doc.notes ? <div className="tiny" style={{ color: 'var(--ink-2)', marginTop: 3 }}>{doc.notes}</div> : null}
      </div>
      {uploaded ? (
        <span className="chip chip-green"><Check size={13} /> Recibido</span>
      ) : doc.demoFallback ? (
        <span className="chip chip-amber">Pendiente</span>
      ) : busy ? (
        <button className="btn btn-outline btn-sm" disabled><Loader2 size={15} className="spin" /> Subiendo</button>
      ) : (
        <>
          <input
            id={inputId}
            className="sr-only"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              onUpload(doc, file)
            }}
          />
          <label htmlFor={inputId} className="btn btn-primary btn-sm"><Upload size={15} /> Subir archivo</label>
        </>
      )}
    </div>
  )
}

// The cars the buyer flagged with "Me interesa". Several can be active at once;
// committing to one converts it and archives the rest. Until now this list
// existed only in the database — the buyer could flag cars and never see or
// undo them, while dealers kept chasing an interest they'd moved on from.
const INTEREST_STATUS = {
  activa: { label: 'Interés activo', bg: 'var(--teal-50)', fg: 'var(--teal-800)' },
  convertida: { label: 'Elegido', bg: '#dcfce7', fg: '#166534' },
  archivada: { label: 'Descartado', bg: '#f1f5f9', fg: '#64748b' },
}

function MyInterests({ items, onChanged }) {
  const [busy, setBusy] = useState(null)
  const active = items.filter((i) => i.status === 'activa')
  const past = items.filter((i) => i.status !== 'activa')
  if (!items.length) return null

  const remove = async (it) => {
    setBusy(it.vehicleDbId)
    await cancelPreapprovalInterest(it.vehicleDbId)
    setBusy(null)
    onChanged?.()
  }

  return (
    <div className="card card-pad">
      <div className="row between center" style={{ marginBottom: 4 }}>
        <div className="row center gap-8"><Car size={16} color="var(--teal-700)" /><h2 style={{ fontSize: 15, margin: 0 }}>Vehículos que te interesan</h2></div>
        {active.length > 0 && <span className="chip chip-teal">{active.length}</span>}
      </div>
      <p className="tiny muted" style={{ marginBottom: 10 }}>
        Los dealers ven que ya estás aprobado para estos carros. Cuando elijas uno, los demás se archivan.
      </p>

      <div className="col gap-8">
        {active.map((it) => {
          const st = INTEREST_STATUS[it.status]
          return (
            <div key={it.vehicleDbId} className="row between center gap-10" style={{ border: '1px solid var(--line-2)', borderRadius: 11, padding: 10, flexWrap: 'wrap' }}>
              <Link to={`/vehiculo/${it.slug}`} className="row center gap-10" style={{ minWidth: 0, textDecoration: 'none', color: 'inherit', flex: 1 }}>
                <div style={{ width: 64, height: 46, flex: 'none', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)', background: '#eef3f6' }}>
                  {it.photo ? <img src={it.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="strong small">{it.label}</div>
                  <div className="tiny muted">{it.price ? fmtRD(it.price) : '—'}{it.dealer ? ` · ${it.dealer}` : ''}</div>
                  {!it.withinBudget && (
                    <div className="tiny" style={{ color: 'var(--amber)', marginTop: 2 }}>Ya no está dentro de tu aprobación</div>
                  )}
                </div>
              </Link>
              <div className="row center gap-8" style={{ flex: 'none' }}>
                <span className="chip" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                <button className="btn btn-ghost btn-sm" disabled={busy === it.vehicleDbId} onClick={() => remove(it)} title="Quitar de mi lista">
                  {busy === it.vehicleDbId ? <Loader2 size={14} className="spin" /> : 'Quitar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {past.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-2)' }}>
          <div className="tiny muted" style={{ marginBottom: 6 }}>Historial</div>
          <div className="col gap-6">
            {past.map((it) => {
              const st = INTEREST_STATUS[it.status] || INTEREST_STATUS.archivada
              return (
                <div key={it.vehicleDbId} className="row between center">
                  <Link to={`/vehiculo/${it.slug}`} className="small" style={{ textDecoration: 'none', color: 'inherit' }}>{it.label}</Link>
                  <span className="chip" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function BankResponse({ r, appId, contractToken, accepted, selectedSlug, onAccepted }) {
  const b = banks.find((x) => x.id === r.bankId) || { id: r.bankId, name: r.bankId || 'Banco', initials: '', color: '#334155' }
  const hasTerms = r.status === 'offer'
  const [open, setOpen] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [acceptErr, setAcceptErr] = useState('')
  const isSelected = r.selected || r.bankId === selectedSlug
  async function accept() {
    setAccepting(true); setAcceptErr('')
    const res = await acceptFinancingOfferAuth(appId, r.bankId)
    setAccepting(false)
    if (res && res.ok) onAccepted?.()
    else setAcceptErr('No pudimos registrar tu aceptación. Intenta de nuevo.')
  }
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
            <div className="row center gap-8 wrap" style={{ marginBottom: 10 }}>
              <span className="chip chip-teal"><Landmark size={13} /> Pre-aprobado hasta {fmtRD(r.approvedAmount)}</span>
              {r.validUntil && (
                <span className="chip" style={{ background: r.expired ? 'var(--amber-bg)' : '#eef6f3', color: r.expired ? 'var(--amber)' : 'var(--teal-800)' }}>
                  <Clock size={12} /> {r.expired ? `Vencida el ${fmtDay(r.validUntil)}` : `Válida hasta ${fmtDay(r.validUntil)}`}
                </span>
              )}
            </div>
          ) : null}
          <div className="grid grid-4" style={{ gap: 10 }}>
            <Term l="Tasa" v={r.apr ? `${r.apr}%` : '—'} />
            <Term l="Plazo" v={r.term ? `${r.term} años` : '—'} />
            <Term l="Inicial requerido" v={r.down ? fmtRD(r.down) : '—'} />
            <Term l="Cuota mensual" v={r.monthly ? fmtRD(r.monthly) : '—'} />
          </div>
          <div className="row gap-8 wrap" style={{ marginTop: 12 }}>
            {accepted && isSelected
              ? <span className="chip chip-teal" style={{ height: 34, padding: '0 12px' }}><Check size={14} /> Oferta aceptada</span>
              : !accepted
                ? <button className="btn btn-primary btn-sm" disabled={accepting} onClick={accept}>
                    {accepting ? <><Loader2 size={14} className="spin" /> Registrando…</> : `Aceptar ${r.approvedAmount ? 'pre-aprobación' : 'oferta'}`}
                  </button>
                : null}
            {r.approvedAmount
              ? <Link to={`/buscar?precioMax=${r.approvedAmount}`} className="btn btn-outline btn-sm">Ver carros dentro de tu presupuesto</Link>
              : null}
            <button className="btn btn-outline btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? 'Ocultar detalle' : 'Ver detalle'}
            </button>
            {contractToken && (
              <a className="btn btn-outline btn-sm" href={`/contrato/${contractToken}?banco=${r.bankId}`} target="_blank" rel="noreferrer">
                <FileSignature size={14} /> Contrato {b.name}
              </a>
            )}
          </div>
          {acceptErr && <div className="tiny" style={{ color: '#b91c1c', marginTop: 8 }}>{acceptErr}</div>}
          {accepted && isSelected && <div className="tiny muted" style={{ marginTop: 8 }}>El banco y el dealer fueron notificados. Te contactarán para completar seguro, firma y entrega.</div>}
          {open && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--green-bd)' }}>
              <div className="kv"><span className="k">Banco</span><span className="v strong">{b.name}</span></div>
              {r.approvedAmount ? <div className="kv"><span className="k">Monto pre-aprobado</span><span className="v strong">{fmtRD(r.approvedAmount)}</span></div> : null}
              <div className="kv"><span className="k">Tasa anual</span><span className="v">{r.apr ? `${r.apr}%` : '—'}</span></div>
              <div className="kv"><span className="k">Plazo</span><span className="v">{r.term ? `${r.term} años` : '—'}</span></div>
              <div className="kv"><span className="k">Inicial requerido</span><span className="v">{r.down ? fmtRD(r.down) : '—'}</span></div>
              <div className="kv"><span className="k">Cuota estimada</span><span className="v">{r.monthly ? `${fmtRD(r.monthly)}/mes` : '—'}</span></div>
              {r.validUntil ? <div className="kv"><span className="k">Vigencia</span><span className="v" style={{ color: r.expired ? 'var(--amber)' : undefined }}>{r.expired ? `Vencida el ${fmtDay(r.validUntil)}` : `Válida hasta ${fmtDay(r.validUntil)}`}</span></div> : null}
              {r.note ? (
                <div style={{ marginTop: 8 }}><div className="tiny strong" style={{ marginBottom: 2 }}>Condiciones</div><div className="small muted">{r.note}</div></div>
              ) : null}
              <div className="tiny muted" style={{ marginTop: 10 }}>
                Esta {r.approvedAmount ? 'pre-aprobación' : 'oferta'} está sujeta a validación final de documentos, seguro, contrato y políticas del banco.
              </div>
            </div>
          )}
        </div>
      )}
      {r.status === 'docs' && (
        <div style={{ background: 'var(--amber-bg)', borderTop: '1px solid var(--amber-bd)', padding: '10px 16px' }}>
          <a href="#documentos" className="btn btn-navy btn-sm"><Upload size={15} /> Enviar documentos solicitados</a>
        </div>
      )}
    </div>
  )
}
function Term({ l, v }) {
  return <div><div className="tiny" style={{ color: 'var(--green)' }}>{l}</div><div className="strong" style={{ fontSize: 14 }}>{v}</div></div>
}

// "Qué falta": the client's single answer to "what do I still have to do?".
// Outstanding items sort to the top — a completed list is reassuring but it is
// not what someone opened this page to find.
function QueFalta({ items, summary, focus }) {
  const rank = { requested: 0, pending: 1, review: 2, done: 3 }
  const sorted = [...items].sort((a, b) => (rank[a.state] ?? 9) - (rank[b.state] ?? 9))

  useEffect(() => {
    if (!focus) return
    const el = document.getElementById(`falta-${focus}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus])

  return (
    <div className="card card-pad" id="que-falta">
      <div className="section-title row between center">
        <h2 style={{ fontSize: 18 }}>Qué falta</h2>
        <span className="tiny muted">{summary.done} de {summary.total} listo{summary.done === 1 ? '' : 's'}</span>
      </div>

      {summary.complete ? (
        <div className="notice" style={{ marginTop: 4 }}>
          <Info size={16} />
          <span>{summary.inReview > 0
            ? 'Ya enviaste todo. Tu banco está revisando la información.'
            : 'Tienes todo completo. No necesitas hacer nada más por ahora.'}</span>
        </div>
      ) : (
        <p className="muted small" style={{ marginTop: -4, marginBottom: 12 }}>
          {summary.next?.label
            ? <>Lo siguiente: <b>{summary.next.label}</b>.</>
            : 'Completa lo pendiente para que los bancos puedan avanzar.'}
        </p>
      )}

      <div className="col gap-8" style={{ marginTop: 10 }}>
        {sorted.map((i) => {
          const meta = CHECK_STATE[i.state] || CHECK_STATE.pending
          const tone = TONE[meta.tone] || TONE.slate
          return (
            <div key={i.key} id={`falta-${i.key}`}
              className={`falta-row${focus === i.key ? ' falta-focus' : ''}${i.state === 'done' ? ' falta-done' : ''}`}>
              <div className="falta-main">
                <div className="falta-label">{i.label}</div>
                <div className="tiny muted falta-sub">{i.sub}</div>
              </div>
              <div className="falta-end">
                <span className="chip" style={{ background: tone.bg, color: tone.fg }}>{meta.label}</span>
                {i.cta && (i.cta.href.startsWith('#')
                  ? <a className="btn btn-outline btn-sm" href={i.cta.href}>{i.cta.label}</a>
                  : <Link className="btn btn-outline btn-sm" to={i.cta.href}>{i.cta.label}</Link>)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// The top card: status, the numbers that matter for that status, and exactly
// one primary action. Colour comes from the status tone so "aprobado" can never
// render amber and "rechazado" can never render green.
function StatusCard({ s, summary, validUntilLabel }) {
  const tone = TONE[s.tone] || TONE.slate
  const isBad = s.key === 'rechazado' || s.key === 'expirado'
  return (
    <div className="card card-pad fin-status" style={{ borderColor: tone.fg, background: isBad ? '#fff' : tone.bg }}>
      <div className="row between center wrap gap-12">
        <div className="row center gap-12" style={{ minWidth: 0 }}>
          <div className="verify-ic" style={{ background: '#fff', color: tone.fg, flex: 'none' }}>
            {s.key === 'aprobado' ? <Check size={22} strokeWidth={3} />
              : s.key === 'preaprobado' ? <Landmark size={22} />
              : s.key === 'requiere_info' ? <FileWarning size={20} />
              : s.key === 'expirado' ? <Clock size={20} />
              : s.key === 'rechazado' ? <Info size={20} />
              : <Loader2 size={20} className="spin" />}
          </div>
          <div style={{ minWidth: 0 }}>
            <span className="chip" style={{ background: '#fff', color: tone.fg, marginBottom: 6 }}>{s.label}</span>
            <div className="strong">{s.headline}</div>
            <div className="tiny muted">{s.sub}</div>
          </div>
        </div>
        {s.cta && (s.cta.href.startsWith('#')
          ? <a href={s.cta.href} className="btn btn-primary">{s.cta.label}</a>
          : <Link to={s.cta.href} className="btn btn-primary">{s.cta.label}</Link>)}
      </div>

      {(s.amount || s.monthly || validUntilLabel) && (
        <div className="fin-status-facts">
          {s.amount != null && <div><span>{s.key === 'aprobado' ? 'Monto aprobado' : 'Monto máximo'}</span><b>{fmtRD(s.amount)}</b></div>}
          {s.monthly ? <div><span>Cuota estimada</span><b>{fmtRD(s.monthly)}/mes</b></div> : null}
          {s.apr != null && <div><span>Tasa</span><b>{s.apr}%</b></div>}
          {validUntilLabel && <div><span>{s.key === 'expirado' ? 'Venció el' : 'Válida hasta'}</span><b>{validUntilLabel}</b></div>}
        </div>
      )}

      {s.key === 'en_revision' && (
        <div className="tiny muted" style={{ marginTop: 10 }}>
          ¿Dudas mientras esperas? Escríbenos por WhatsApp y te ayudamos.
        </div>
      )}
      {s.key === 'requiere_info' && summary.outstanding > 0 && (
        <div className="tiny" style={{ marginTop: 10, color: tone.fg }}>
          {summary.outstanding} cosa{summary.outstanding === 1 ? '' : 's'} por completar.
        </div>
      )}
    </div>
  )
}
