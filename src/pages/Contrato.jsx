import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicContract } from '../data/api'
import { fmtRD } from '../data/demo'

const fmtDate = (d) => (d ? new Date(d).toLocaleString('es-DO', { dateStyle: 'long', timeStyle: 'short' }) : '—')

export default function Contrato() {
  const { token = '' } = useParams()
  const [state, setState] = useState('loading') // loading | ok | notfound
  const [c, setC] = useState(null)

  useEffect(() => {
    let alive = true
    getPublicContract(token).then((data) => {
      if (!alive) return
      if (!data) { setState('notfound'); return }
      setC(data); setState('ok')
    }).catch(() => { if (alive) setState('notfound') })
    return () => { alive = false }
  }, [token])

  if (state === 'loading') return <main className="fc-page"><div className="fc-center">Cargando contrato…</div></main>
  if (state === 'notfound' || !c) return (
    <main className="fc-page"><div className="fc-center">
      <div className="fc-nf"><h1>Contrato no disponible</h1><p>El enlace no es válido o expiró.</p></div>
    </div></main>
  )

  const banks = Array.isArray(c.banks) ? c.banks : []
  const banksText = banks.length ? banks.join(', ') : 'los bancos seleccionados'

  return (
    <main className="fc-page">
      <style>{CSS}</style>
      <div className="fc-wrap">
        <div className="fc-noprint fc-bar">
          <b>Contrato de consentimiento · {c.code}</b>
          <button onClick={() => window.print()} className="fc-print">Imprimir / Guardar PDF</button>
        </div>

        <article className="fc-doc">
          <header className="fc-hero">
            <div className="fc-status"><span>CONTRATO DE CONSENTIMIENTO</span><span>{c.code}</span></div>
            <div className="fc-brand">
              <div className="fc-logo"><span className="a1">Auto</span><span className="a2">RD</span></div>
              <div className="fc-org">
                <h1>AutoRD</h1>
                <p>Marketplace y gestión de financiamiento de vehículos · República Dominicana</p>
              </div>
              <div className="fc-badge">Verificación<br /><b>DIDIT</b></div>
            </div>
          </header>

          <section className="fc-meta">
            <div><span>Fecha</span><b>{fmtDate(c.consent_at || c.created_at)}</b></div>
            <div><span>Tipo</span><b>{c.is_preapproval ? 'Pre-aprobación' : 'Financiamiento de vehículo'}</b></div>
            <div><span>Identidad</span><b>{c.kyc_status === 'aprobado' ? 'Verificada (DIDIT)' : 'Pendiente'}</b></div>
          </section>

          <section className="fc-section">
            <h2>Solicitante</h2>
            <div className="fc-details">
              <div className="fc-detail"><span>Nombre completo</span><b>{c.customer || '—'}</b></div>
              <div className="fc-detail"><span>Cédula</span><b>{c.cedula_masked || 'Validada por DIDIT'}</b></div>
              <div className="fc-detail"><span>Teléfono</span><b>{c.phone || 'No registrado'}</b></div>
              <div className="fc-detail"><span>Correo</span><b>{c.email || 'No registrado'}</b></div>
              <div className="fc-detail"><span>Verificación de identidad</span><b>DIDIT · cédula + prueba de vida</b></div>
            </div>
          </section>

          <section className="fc-section">
            <h2>Solicitud</h2>
            <div className="fc-details">
              {c.is_preapproval ? (
                <div className="fc-detail"><span>Tipo</span><b>Pre-aprobación — sin vehículo aún</b></div>
              ) : (
                <>
                  <div className="fc-detail"><span>Vehículo</span><b>{c.vehicle || '—'}</b></div>
                  <div className="fc-detail"><span>Dealer</span><b>{c.dealer || '—'}</b></div>
                </>
              )}
              <div className="fc-detail"><span>Monto solicitado</span><b>{c.amount ? fmtRD(c.amount) : 'Sin monto fijo'}</b></div>
              {c.down ? <div className="fc-detail"><span>Inicial</span><b>{fmtRD(c.down)}</b></div> : null}
              <div className="fc-detail"><span>Plazo solicitado</span><b>{c.term ? `${c.term} años` : '—'}</b></div>
              <div className="fc-detail"><span>Bancos autorizados</span><b>{banksText}</b></div>
            </div>
          </section>

          <section className="fc-section">
            <h2>Declaración y autorización</h2>
            <div className="fc-legal">
              <p><b>1. Verificación de identidad y datos.</b> El solicitante consiente la verificación de su identidad mediante su cédula dominicana y una prueba de vida (DIDIT), y autoriza a AutoRD a tratar sus datos personales con el único fin de gestionar esta solicitud, prevenir fraude y cumplir obligaciones legales. Los datos biométricos no se almacenan en AutoRD ni se comparten con dealers ni bancos.</p>
              <p><b>2. Autorización de consulta crediticia.</b> El solicitante autoriza expresamente a {banksText} a consultar su historial crediticio en los burós de crédito para evaluar esta solicitud de financiamiento.</p>
              <p><b>3. Alcance.</b> AutoRD no realiza la evaluación de crédito ni actúa como prestamista; únicamente transmite esta solicitud y el presente consentimiento a los bancos seleccionados. AutoRD no emite contratos de préstamo ni firma digital de crédito: la relación de crédito, de aprobarse, se formaliza directamente entre el cliente y el banco.</p>
              <p><b>4. Veracidad.</b> El solicitante declara que la información suministrada es verdadera y que la identidad verificada por DIDIT corresponde a la persona que otorga este consentimiento.</p>
            </div>
          </section>

          <section className="fc-signature">
            <div>
              <small>Contrato generado y sellado tras la verificación de identidad (DIDIT).</small>
              <div className="fc-hash">Hash: {c.hash || 'Pendiente'}</div>
            </div>
            <div className="fc-sign"><b>Firma verificada por DIDIT</b><br />{c.customer}<br /><small>{fmtDate(c.consent_at)}</small></div>
          </section>

          <footer className="fc-footer">AutoRD · Documento generado automáticamente · Versión {c.version || 'v1.0'} · Conserva este contrato para cualquier consulta.</footer>
        </article>
      </div>
    </main>
  )
}

const CSS = `
.fc-page { min-height: 100vh; background: #eef2f6; padding: 24px 0; }
.fc-center { min-height: 60vh; display: grid; place-items: center; color: #64748b; }
.fc-nf { background: #fff; border-radius: 18px; padding: 26px; text-align: center; box-shadow: 0 12px 36px rgba(15,23,42,.1); }
.fc-nf h1 { margin: 0; font-size: 20px; color: #0f172a; }
.fc-nf p { margin: 8px 0 0; color: #64748b; font-size: 14px; }
.fc-wrap { max-width: 820px; margin: 0 auto; padding: 0 12px; }
.fc-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; color: #334155; font-size: 14px; }
.fc-print { border: 0; border-radius: 10px; background: #0f766e; color: #fff; padding: 9px 15px; font-weight: 800; font-size: 13px; cursor: pointer; }
.fc-doc { overflow: hidden; border: 1px solid #dfe7f0; border-radius: 22px; background: #fff; box-shadow: 0 12px 36px rgba(15,23,42,.08); color: #172033; font: 12px/1.55 system-ui, -apple-system, Segoe UI, Arial, sans-serif; }
.fc-hero { padding: 25px 27px 23px; background: linear-gradient(135deg, #0f766e, #0c2033); color: #fff; }
.fc-status { display: flex; justify-content: space-between; gap: 10px; font-size: 10px; font-weight: 900; letter-spacing: .11em; }
.fc-status span { display: inline-flex; border: 1px solid #ffffff42; border-radius: 999px; padding: 5px 9px; }
.fc-brand { display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center; margin-top: 18px; }
.fc-logo { display: grid; place-items: center; height: 44px; min-width: 76px; padding: 0 12px; border-radius: 12px; background: #fff; font-size: 20px; font-weight: 900; letter-spacing: -.02em; }
.fc-logo .a1 { color: #0c2033; } .fc-logo .a2 { color: #0f766e; }
.fc-org h1 { margin: 0; font-size: 22px; letter-spacing: -.03em; }
.fc-org p { margin: 3px 0 0; color: #cfe9e4; font-size: 11px; }
.fc-badge { text-align: right; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #cfe9e4; }
.fc-badge b { display: block; font-size: 16px; color: #fff; letter-spacing: .02em; }
.fc-meta { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid #e4ebf3; }
.fc-meta div { padding: 13px 18px; border-right: 1px solid #e4ebf3; }
.fc-meta div:last-child { border: 0; }
.fc-meta span, .fc-detail span { display: block; color: #64748b; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
.fc-meta b, .fc-detail b { display: block; margin-top: 3px; font-size: 12px; }
.fc-section { padding: 19px 23px; border-bottom: 1px solid #e4ebf3; }
.fc-section h2 { margin: 0 0 12px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #475569; }
.fc-details { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
.fc-detail { min-height: 54px; border: 1px solid #e3eaf2; border-radius: 12px; background: #f8fafc; padding: 9px 10px; }
.fc-legal { border: 1px solid #cdeae5; border-radius: 13px; background: #f2fbf9; padding: 13px 14px; color: #334155; }
.fc-legal p { margin: 0 0 9px; } .fc-legal p:last-child { margin: 0; }
.fc-signature { display: grid; grid-template-columns: 1fr 230px; gap: 20px; align-items: end; padding: 28px 23px 23px; }
.fc-signature small { display: block; color: #64748b; }
.fc-hash { font-family: monospace; color: #64748b; margin-top: 6px; word-break: break-all; font-size: 10px; }
.fc-sign { border-top: 1px solid #94a3b8; padding-top: 7px; font-size: 11px; }
.fc-sign small { color: #94a3b8; }
.fc-footer { padding: 13px 23px 17px; border-top: 1px solid #e4ebf3; color: #94a3b8; font-size: 10px; text-align: center; }
@media print { .fc-page { background: #fff; padding: 0; } .fc-noprint { display: none !important; } .fc-wrap { padding: 0; } .fc-doc { border: 0; border-radius: 0; box-shadow: none; } .fc-hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { size: A4; margin: 12mm; } }
@media (max-width: 560px) { .fc-brand { grid-template-columns: auto 1fr; } .fc-badge { grid-column: 2; text-align: left; } .fc-meta { grid-template-columns: 1fr; } .fc-meta div { border-right: 0; border-bottom: 1px solid #e4ebf3; } .fc-details, .fc-signature { grid-template-columns: 1fr; } }
`
