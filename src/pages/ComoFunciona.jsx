import { Link } from 'react-router-dom'
import {
  Search, IdCard, FileSignature, Landmark, ShieldCheck, Store, Building2,
  ArrowRight, Check,
} from 'lucide-react'

const STEPS = [
  { icon: Search, t: 'Encuentra tu vehículo', d: 'Explora el marketplace y elige el carro que quieres financiar.' },
  { icon: IdCard, t: 'Verifica tu identidad', d: 'Validación de cédula y prueba de vida (KYC). Tus datos biométricos nunca se comparten con dealers.' },
  { icon: FileSignature, t: 'Firma el consentimiento', d: 'Autorizas a los bancos que elijas a consultar tu historial de crédito para esta solicitud.' },
  { icon: Landmark, t: 'Recibe ofertas', d: 'Los bancos evalúan y responden con sus condiciones. Comparas y eliges la mejor.' },
]

export default function ComoFunciona() {
  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 960 }}>
        <div style={{ textAlign: 'center', margin: '6px 0 8px' }}>
          <span className="chip chip-teal" style={{ marginBottom: 12 }}><ShieldCheck size={13} /> 100% online y seguro</span>
          <h1 style={{ fontSize: 30 }}>Cómo funciona AutoRD</h1>
          <p className="muted" style={{ maxWidth: 560, margin: '10px auto 0' }}>
            Conectamos compradores, dealers y bancos en un solo lugar. AutoRD organiza tu solicitud;
            los bancos evalúan y aprueban el crédito.
          </p>
        </div>

        <div className="grid grid-4" style={{ margin: '28px 0' }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <div className="card card-pad" key={i}>
                <div className="row center gap-8" style={{ marginBottom: 10 }}>
                  <div className="trust-ic"><Icon size={19} /></div>
                  <span className="tiny strong muted">Paso {i + 1}</span>
                </div>
                <div className="strong" style={{ marginBottom: 4 }}>{s.t}</div>
                <div className="small muted" style={{ lineHeight: 1.6 }}>{s.d}</div>
              </div>
            )
          })}
        </div>

        <div className="notice" style={{ justifyContent: 'center', textAlign: 'center' }}>
          <ShieldCheck size={16} />
          <span><strong>AutoRD no es una entidad financiera.</strong> No realizamos consultas de crédito ni otorgamos préstamos. Los bancos hacen la evaluación de forma externa y responden en la plataforma.</span>
        </div>

        <div className="grid grid-3" style={{ marginTop: 26 }}>
          <AudienceCard icon={Search} title="Para compradores" points={['Compara vehículos y cuotas', 'Un solo KYC para varios bancos', 'Recibe y compara ofertas reales']} cta={{ to: '/', label: 'Explorar vehículos' }} />
          <AudienceCard icon={Store} title="Para dealers" points={['Publica y gestiona tu inventario', 'Leads con estado de financiamiento', 'Más cierres, menos papeleo']} cta={{ to: '/ingresar', label: 'Portal de dealers' }} />
          <AudienceCard icon={Building2} title="Para bancos" points={['Solicitudes con KYC y consentimiento', 'Evalúa y responde en un panel', 'Menor costo de originación']} cta={{ to: '/ingresar', label: 'Portal de bancos' }} />
        </div>
      </div>
    </main>
  )
}

function AudienceCard({ icon: Icon, title, points, cta }) {
  return (
    <div className="card card-pad col" style={{ gap: 12 }}>
      <div className="row center gap-10">
        <div className="trust-ic" style={{ background: 'var(--navy-800)', color: '#fff' }}><Icon size={19} /></div>
        <h3 style={{ fontSize: 16 }}>{title}</h3>
      </div>
      <div className="col gap-8" style={{ flex: 1 }}>
        {points.map((p) => <div key={p} className="row gap-8 small"><Check size={15} color="var(--teal-700)" strokeWidth={2.5} /> {p}</div>)}
      </div>
      <Link to={cta.to} className="btn btn-outline btn-block">{cta.label} <ArrowRight size={15} /></Link>
    </div>
  )
}
