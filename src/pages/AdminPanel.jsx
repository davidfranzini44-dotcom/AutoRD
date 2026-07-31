import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { QrCode, Smartphone, ShieldCheck, Loader2, Power, Send, Info, ArrowLeft, History, KeyRound, Bell, Landmark, UserPlus, Copy, Check } from 'lucide-react'
import { getWaStatus, waLinkQr, waStartPairing, waDisconnect, sendPhoneOtp, checkWaGateway, getNotifications, enrollBank, getVerifiedWithoutApplication, getWaHealth, requeueStuckWaMessages, getUsdDopRateMeta, setUsdDopRate, backfillKycPortraits } from '../data/api'
import WhatsAppIcon from '../components/WhatsAppIcon'

const TYPE_META = {
  otp:           { label: 'OTP', icon: KeyRound },
  test:          { label: 'Prueba', icon: KeyRound },
  bank_response: { label: 'Banco respondió', icon: Bell },
  other:         { label: 'Notificación', icon: Bell },
}
const HIST_FILTERS = [{ label: 'Todos', val: null }, { label: 'OTP', val: 'otp' }, { label: 'Notificaciones', val: 'notif' }]
const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString('es-DO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

const STATUS_META = {
  connected:    { label: 'Conectado',          cls: 'chip-green' },
  connecting:   { label: 'Conectando…',        cls: 'chip-navy' },
  qr:           { label: 'Esperando escaneo',  cls: 'chip-navy' },
  pairing:      { label: 'Esperando código',   cls: 'chip-navy' },
  disconnected: { label: 'Desconectado',       cls: '' },
}

const ADMIN_NAV = [
  { id: 'inicio', label: 'Inicio', ic: 'IN', count: 12 },
  { id: 'solicitudes', label: 'Solicitudes', ic: 'SO', count: 48 },
  { id: 'dealers', label: 'Dealers', ic: 'DE', count: 7 },
  { id: 'bancos', label: 'Bancos', ic: 'BA', count: 5 },
  { id: 'usuarios', label: 'Usuarios + KYC', ic: 'US', count: 19 },
  { id: 'vehiculos', label: 'Vehículos', ic: 'VE', count: 146 },
  { id: 'facturacion', label: 'Facturación', ic: 'FA', count: 9 },
  { id: 'whatsapp', label: 'WhatsApp', ic: 'WA', count: 3 },
  { id: 'moderacion', label: 'Moderación', ic: 'MO', count: 6 },
  { id: 'ajustes', label: 'Ajustes', ic: 'AJ', count: 1 },
]

const moneyRows = [
  { label: 'Usuarios', value: '3,842', sub: '+214 este mes' },
  { label: 'Dealers', value: '126', sub: '87 verificados' },
  { label: 'Bancos', value: '9', sub: '5 activos hoy' },
  { label: 'Solicitado', value: 'RD$ 182M', sub: 'últimos 30 días' },
  { label: 'Aprobado', value: 'RD$ 64M', sub: '35.1% conversión' },
  { label: 'MRR', value: 'RD$ 421K', sub: '+18% vs mes pasado' },
]

export default function AdminPanel() {
  const [view, setView] = useState('inicio')
  const current = ADMIN_NAV.find((n) => n.id === view) || ADMIN_NAV[0]

  return (
    <main className="sa-page">
      <aside className="sa-side">
        <Link to="/" className="sa-brand">
          <span className="sa-mark">AR</span>
          <span><b>AutoRD</b><small>Super Admin</small></span>
        </Link>

        <div className="sa-operator">
          <div className="row center gap-10">
            <span className="sa-avatar">DF</span>
            <span style={{ minWidth: 0 }}>
              <b className="small">David Franzini</b>
              <small className="muted">Owner access · auditado</small>
            </span>
          </div>
          <div className="row between center gap-8">
            <span className="chip chip-green">Sistema vivo</span>
            <span className="tiny muted">31 jul 2026</span>
          </div>
        </div>

        <div className="sa-nav-label">Command center</div>
        <nav className="sa-nav" aria-label="Super admin">
          {ADMIN_NAV.map((n) => (
            <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => setView(n.id)}>
              <span className="sa-nav-ic">{n.ic}</span>
              <span>{n.label}</span>
              <span className="sa-nav-count">{n.count}</span>
            </button>
          ))}
        </nav>

        <div className="sa-side-foot">
          <button className="btn btn-navy">Ver auditoría</button>
          <Link to="/" className="btn btn-outline">Volver al sitio</Link>
        </div>
      </aside>

      <section className="sa-main">
        <div className="sa-topbar">
          <div className="sa-search">
            <span>⌕</span>
            <input placeholder="Buscar tienda, banco, cliente, cédula, vehículo o solicitud..." />
          </div>
          <div className="row center gap-8">
            <button className="btn btn-outline btn-sm">Exportar</button>
            <button className="btn btn-outline btn-sm">Crear alerta</button>
            <button className="btn btn-primary btn-sm">Nueva acción admin</button>
          </div>
        </div>

        <div className="sa-content">
          <div className="admin-head sa-head">
            <div>
              <div className="tiny strong muted">SUPER ADMIN · {current.label.toUpperCase()}</div>
              <h1>{current.label === 'Inicio' ? 'Command Center' : current.label}</h1>
              <p className="muted small">{subtitleFor(view)}</p>
            </div>
            <span className="chip chip-teal"><ShieldCheck size={14} /> Solo owner</span>
          </div>
          <SuperAdminScreen view={view} />
        </div>
      </section>
    </main>
  )
}

function subtitleFor(view) {
  return {
    inicio: 'Salud completa de AutoRD: dinero, dealers, bancos, KYC, leads y problemas activos.',
    solicitudes: 'Todas las aplicaciones, bancos, dealers, documentos, KYC y aprobaciones en un solo lugar.',
    dealers: 'Control de tiendas, sucursales, verificación, usuarios, inventario, leads y facturación.',
    bancos: 'Performance, oficiales, respuestas, productos financieros, tasas, SLA y bancos socios.',
    usuarios: 'Clientes, cuentas creadas por OTP, DIDIT, documentos, consentimiento y auditoría de identidad.',
    vehiculos: 'Inventario global, calidad de publicación, precio vs mercado, fotos, VIN/chasis y fit de financiamiento.',
    facturacion: 'MRR, trials, add-ons, facturas vencidas, pagos manuales y futuros fees por financiamiento.',
    whatsapp: 'Gateway, OTP, mensajes fallidos, plantillas, respuestas de banco y enlaces de cliente.',
    moderacion: 'Reportes, duplicados, precios falsos, dealers sospechosos, vehículos incompletos y reglas de plataforma.',
    ajustes: 'Reglas globales para dealers, bancos, clientes, KYC, WhatsApp, fees y campos obligatorios.',
  }[view] || ''
}

function SuperAdminScreen({ view }) {
  if (view === 'solicitudes') return <SolicitudesAdmin />
  if (view === 'dealers') return <DealersAdmin />
  if (view === 'bancos') return <BancosAdmin />
  if (view === 'usuarios') return <UsuariosAdmin />
  if (view === 'vehiculos') return <VehiculosAdmin />
  if (view === 'facturacion') return <FacturacionAdmin />
  if (view === 'whatsapp') return <WhatsAppAdmin />
  if (view === 'moderacion') return <ModeracionAdmin />
  if (view === 'ajustes') return <AjustesAdmin />
  return <InicioAdmin />
}

function KpiGrid({ rows = moneyRows }) {
  return (
    <div className="sa-kpis">
      {rows.map((k) => (
        <div className="metric-card sa-kpi" key={k.label}>
          <div className="tiny strong muted">{k.label}</div>
          <div className="mc-v">{k.value}</div>
          <div className="mc-l">{k.sub}</div>
        </div>
      ))}
    </div>
  )
}

function Mini({ label, value, tone }) {
  return <div className={`sa-mini ${tone || ''}`}><span>{label}</span><b>{value}</b></div>
}

function AlertRow({ tone = '', ic = '!', title, sub, action = 'Ver' }) {
  return (
    <div className={`sa-alert ${tone}`}>
      <span className="sa-alert-ic">{ic}</span>
      <span style={{ minWidth: 0 }}><b className="small">{title}</b><small className="muted">{sub}</small></span>
      <button className={`btn btn-sm ${tone === 'red' ? 'btn-outline' : 'btn-ghost'}`}>{action}</button>
    </div>
  )
}

function Funnel() {
  const rows = [
    ['Visitantes', '18.4K', 100],
    ['Leads', '2.1K', 68],
    ['KYC', '924', 44],
    ['Pre-aprobados', '418', 29],
    ['Vendidos', '73', 12],
  ]
  return <div className="sa-funnel">{rows.map(([label, value, pct]) => <div className="sa-funnel-row" key={label}><span>{label}</span><i><b style={{ width: `${pct}%` }} /></i><strong>{value}</strong></div>)}</div>
}

function InicioAdmin() {
  return (
    <div className="col gap-16">
      <KpiGrid />
      <div className="sa-command">
        <section className="card card-pad">
          <div className="sa-splitline"><div><h2>Cola inteligente</h2><p className="tiny muted">Acciones que mueven dinero o reducen riesgo.</p></div><button className="btn btn-sm">Priorizar por impacto</button></div>
          <div className="sa-action-grid">
            <Mini label="Crítico" value="7" tone="red" />
            <Mini label="KYC pendiente" value="19" tone="amber" />
            <Mini label="SLA bancos" value="12" tone="blue" />
            <Mini label="Por cobrar" value="RD$ 86K" tone="teal" />
          </div>
        </section>
        <section className="card card-pad">
          <div className="sa-splitline" style={{ marginBottom: 12 }}><div><h2>Alertas activas</h2><p className="tiny muted">Lo que debes mirar primero.</p></div><span className="chip chip-amber">12 abiertas</span></div>
          <div className="col gap-8">
            <AlertRow tone="red" ic="!" title="WhatsApp con 3 mensajes fallidos" sub="OTP y respuesta de banco sin entregar." action="Revisar" />
            <AlertRow tone="amber" ic="K" title="Joselito Auto Import sin RNC" sub="Dealer vende, pero verificación incompleta." action="Pedir" />
            <AlertRow tone="green" ic="B" title="Banco Caribe mejoró respuesta" sub="SLA promedio bajó a 4h 18m." action="Ver" />
          </div>
        </section>
      </div>
      <div className="sa-work">
        <section className="card">
          <AdminTable
            cols={['Actividad', 'Entidad', 'Tipo', 'Impacto', 'Estado']}
            rows={[
              ['Pre-aprobación AP-2091|Cliente aceptó oferta y eligió vehículo.', 'Banco BHD', 'Solicitud', 'RD$ 3.4M', 'Listo'],
              ['Dealer nuevo pendiente|Necesita logo, RNC y dirección confirmada.', 'Premium Motors', 'Dealer', 'Alto', 'Pendiente'],
              ['Precio fuera de mercado|Toyota RAV4 2021 18% sobre referencia.', 'Auto San Pedro', 'Inventario', 'Medio', 'Sugerir'],
              ['Factura vencida|Plan Dealer Pro, 6 días vencida.', 'Nava Auto', 'Billing', 'RD$ 9,500', 'Cobrar'],
            ]}
          />
        </section>
        <aside className="sa-rail">
          <section className="card card-pad">
            <div className="sa-splitline"><h2>Funnel de financiamiento</h2><span className="chip chip-teal">30 días</span></div>
            <Funnel />
          </section>
          <section className="card card-pad">
            <h2>Mejor próxima acción</h2>
            <p className="small muted" style={{ margin: '8px 0 12px' }}>Contactar dealers con leads aprobados sin seguimiento. Hay 11 clientes que ya califican y todavía no tienen respuesta.</p>
            <button className="btn btn-primary">Abrir lista</button>
          </section>
        </aside>
      </div>
    </div>
  )
}

function AdminTable({ cols, rows }) {
  return (
    <div className="sa-table">
      <div className="sa-table-head">{cols.map((c) => <span key={c}>{c}</span>)}</div>
      {rows.map((r, idx) => (
        <div className="sa-table-row" key={idx}>
          {r.map((cell, i) => {
            const [title, sub] = String(cell).split('|')
            const tone = /Listo|Verificado|Aprobada|Excelente|Activo|Bajo/.test(title) ? 'green' : /Pendiente|Mejorar|Medio|Faltan|Revisar|Trial|Sugerir/.test(title) ? 'amber' : /Cobrar|Vencido|Alto|Manual/.test(title) ? 'red' : ''
            return i === r.length - 1
              ? <span className={`chip ${tone ? `chip-${tone}` : ''}`} key={i}>{title}</span>
              : <span key={i} style={{ minWidth: 0 }}>{i === 0 ? <><b>{title}</b>{sub && <small className="muted">{sub}</small>}</> : title}</span>
          })}
        </div>
      ))}
    </div>
  )
}

function SolicitudesAdmin() {
  return (
    <div className="col gap-16">
      <KpiGrid rows={[
        { label: 'Nuevas hoy', value: '48', sub: '17 con vehículo' },
        { label: 'En banco', value: '132', sub: 'SLA promedio 8h' },
        { label: 'Faltan docs', value: '39', sub: 'WhatsApp enviado' },
        { label: 'Pre-aprobadas', value: '418', sub: 'RD$ 64M' },
        { label: 'Expiran', value: '21', sub: 'próximos 7 días' },
        { label: 'Sin dealer', value: '74', sub: 'pre-aprobación directa' },
      ]} />
      <div className="sa-work">
        <section className="card">
          <AdminTable cols={['Cliente', 'Vehículo', 'Banco', 'Monto', 'Estado']} rows={[
            ['Nashla Figueroa|KYC aprobado · Cédula terminada 4411', 'Toyota RAV4 2022', 'BHD', 'RD$ 3.3M', 'Pre-aprobada'],
            ['David Franzini|Docs recibidos · esperando banco', 'Highlander 2024', 'Popular', 'RD$ 4.1M', 'En revisión'],
            ['Miguel Reyes|Sin vehículo · WhatsApp verificado', 'Pre-aprobación', '3 bancos', 'RD$ 2.0M', 'Comparando'],
            ['Ana López|Banco pidió income proof', 'Kia Sportage 2021', 'Caribe', 'RD$ 2.7M', 'Faltan docs'],
          ]} />
        </section>
        <aside className="sa-rail">
          <section className="card card-pad">
            <div className="sa-splitline"><h2>Solicitud AP-2047</h2><span className="chip chip-green">Pre-aprobada</span></div>
            <div className="sa-action-grid two" style={{ marginTop: 12 }}>
              <Mini label="Monto" value="RD$ 4.1M" />
              <Mini label="Inicial" value="RD$ 450K" />
              <Mini label="SLA" value="9h" />
              <Mini label="Score" value="90/100" tone="teal" />
            </div>
            <div className="col gap-8" style={{ marginTop: 12 }}>
              <AlertRow tone="green" ic="K" title="KYC aprobado" sub="Nombre extraído de cédula." action="Ver" />
              <AlertRow tone="amber" ic="D" title="Documento opcional" sub="Banco puede pedir dirección laboral." action="Pedir" />
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function DealersAdmin() {
  return (
    <div className="sa-work">
      <section className="card">
        <AdminTable cols={['Dealer', 'Inventario', 'Leads', 'Billing', 'Verificación']} rows={[
          ['Joselito Auto Import|Santo Domingo · 3 usuarios', '42 carros', '88 leads', 'RD$ 19,500', 'Verificado'],
          ['Premium Cars RD|Santiago · RNC pendiente', '19 carros', '31 leads', 'Trial', 'Pendiente'],
          ['Nava Auto|La Vega · pago vencido', '11 carros', '9 leads', 'RD$ 9,500', 'Vencido'],
        ]} />
      </section>
      <aside className="sa-rail"><section className="card card-pad"><h2>Dealer health</h2><div className="sa-splitline" style={{ marginTop: 12 }}><span className="small strong">Joselito Auto Import</span><span className="chip chip-green">92/100</span></div><div className="sa-progress"><i style={{ width: '92%' }} /></div><div className="sa-action-grid two"><Mini label="Lead response" value="14 min" /><Mini label="Fotos buenas" value="96%" /><Mini label="Apps" value="34" /><Mini label="Cierres" value="11" /></div></section></aside>
    </div>
  )
}

function BancosAdmin() {
  return (
    <div className="col gap-16">
      <div className="sa-split">
        <section className="card card-pad"><h2>Ranking por respuesta</h2><Funnel /></section>
        <section className="card card-pad"><h2>Configuración por banco</h2><div className="col gap-8" style={{ marginTop: 12 }}><AlertRow ic="%" title="Tasas y plazos" sub="Rangos por vehículo, inicial, score y salario." action="Editar" /><AlertRow ic="D" title="Documentos requeridos" sub="Ingreso, dirección, referencias, seguro." action="Editar" /><AlertRow ic="O" title="Oficiales" sub="Asignación, carga y permisos." action="Ver" /></div></section>
      </div>
      <EnrollBankCard />
    </div>
  )
}

function UsuariosAdmin() {
  return (
    <div className="col gap-16">
      <div className="sa-work">
        <section className="card"><AdminTable cols={['Usuario', 'Login', 'KYC', 'Solicitud', 'Riesgo']} rows={[
          ['Nashla Figueroa|Cédula termina 4411 · cuenta auto-creada', 'WhatsApp OTP', 'Aprobado', 'AP-2091', 'Bajo'],
          ['wa18294201557|Nombre pendiente de KYC', 'WhatsApp OTP', 'Pendiente', 'Sin app', 'Medio'],
          ['Ana López|Selfie no coincide claramente', 'Google', 'Manual', 'AP-2030', 'Alto'],
        ]} /></section>
        <aside className="sa-rail"><section className="card card-pad"><h2>Centro de identidad</h2><p className="small muted" style={{ margin: '8px 0 12px' }}>Super Admin puede ver datos sensibles solo con permiso y queda registro de auditoría.</p><div className="sa-action-grid two"><Mini label="Pendiente" value="19" tone="amber" /><Mini label="Fallidos" value="6" tone="red" /><Mini label="Manual" value="4" tone="blue" /><Mini label="Aprobados" value="812" tone="green" /></div></section></aside>
      </div>
      <KycPortraitBackfillCard />
      <VerifiedWithoutApplicationCard />
    </div>
  )
}

function VehiculosAdmin() {
  return (
    <div className="col gap-16">
      <KpiGrid rows={[
        { label: 'Publicados', value: '1,428', sub: '+86 esta semana' },
        { label: 'Sin precio', value: '18', sub: 'bloquean leads' },
        { label: 'Fotos débiles', value: '74', sub: 'menos de 5 fotos' },
        { label: 'Buen precio', value: '62%', sub: 'contra referencia' },
        { label: 'Guardados', value: '2,884', sub: 'intención alta' },
        { label: 'Calculadora', value: '5,204', sub: 'uso mensual' },
      ]} />
      <section className="card"><AdminTable cols={['Vehículo', 'Dealer', 'Precio', 'Analytics', 'Calidad']} rows={[
        ['Toyota RAV4 2022|VIN completo · 12 fotos', 'Joselito', 'US$ 31,900', '384 vistas · 21 leads', 'Excelente'],
        ['Hyundai Tucson 2020|Falta chasis · 4 fotos', 'Premium Cars', 'RD$ 1.58M', '92 vistas · 2 leads', 'Mejorar'],
        ['Honda CR-V 2021|18% sobre mercado', 'Nava Auto', 'US$ 34,500', '188 vistas · 0 leads', 'Alto'],
      ]} /></section>
    </div>
  )
}

function FacturacionAdmin() {
  return (
    <div className="sa-split">
      <section className="card card-pad"><h2>Ingresos SaaS</h2><div className="sa-action-grid" style={{ marginTop: 12 }}><Mini label="MRR" value="RD$ 421K" /><Mini label="Past due" value="RD$ 86K" tone="red" /><Mini label="Trials" value="18" tone="amber" /><Mini label="Add-ons" value="RD$ 54K" tone="teal" /></div><Funnel /></section>
      <section className="card card-pad"><h2>Facturas que requieren acción</h2><div className="col gap-8" style={{ marginTop: 12 }}><AlertRow tone="red" ic="$" title="Nava Auto" sub="6 días vencida · Dealer Pro" action="Cobrar" /><AlertRow tone="amber" ic="T" title="Premium Cars" sub="Trial termina mañana" action="Convertir" /><AlertRow ic="+" title="Marketplace sponsor" sub="3 dealers candidatos a add-on." action="Ofrecer" /></div></section>
    </div>
  )
}

function WhatsAppAdmin() {
  return (
    <div className="col gap-16">
      <div className="sa-split">
        <section className="card card-pad"><h2>Estado de entrega</h2><div className="sa-action-grid" style={{ marginTop: 12 }}><Mini label="En cola" value="12" tone="amber" /><Mini label="Fallidos 1h" value="3" tone="red" /><Mini label="OTP usados" value="71%" tone="green" /><Mini label="Gateway" value="OK" tone="teal" /></div></section>
        <section className="card card-pad"><h2>Plantillas críticas</h2><div className="col gap-8" style={{ marginTop: 12 }}><Mini label="OTP login" value="Activo" /><Mini label="Banco pidió docs" value="Activo" /><Mini label="Oferta aprobada" value="Activo" /></div></section>
      </div>
      <div className="sa-live-tools"><AdminLiveTools /></div>
    </div>
  )
}

function ModeracionAdmin() {
  return (
    <div className="sa-work">
      <section className="card"><AdminTable cols={['Caso', 'Entidad', 'Tipo', 'Riesgo', 'Acción']} rows={[
        ['Precio sospechoso|BMW X5 publicado 42% bajo referencia.', 'Dealer nuevo', 'Vehículo', 'Alto', 'Revisar'],
        ['Duplicado posible|Misma placa/fotos en dos dealers.', '2 dealers', 'Inventario', 'Medio', 'Unificar'],
        ['Cliente reportó dealer|No responde tras aprobación.', 'Auto Centro', 'Lead', 'Medio', 'Contactar'],
      ]} /></section>
      <aside className="sa-rail"><section className="card card-pad"><h2>Trust score plataforma</h2><div className="sa-splitline" style={{ marginTop: 12 }}><span className="small strong">Salud general</span><span className="chip chip-green">88/100</span></div><div className="sa-progress"><i style={{ width: '88%' }} /></div><p className="small muted">El mayor riesgo actual es inventario incompleto y dealers sin documentos completos.</p></section></aside>
    </div>
  )
}

function AjustesAdmin() {
  return (
    <div className="col gap-16">
      <div className="sa-split">
        <section className="card card-pad"><h2>Reglas de onboarding</h2><div className="col gap-8" style={{ marginTop: 12 }}><AlertRow ic="D" title="Dealer" sub="Logo, RNC, dirección, WhatsApp y usuario owner." action="Activo" /><AlertRow ic="B" title="Banco" sub="Oficial owner, tasas, documentos y SLA." action="Activo" /><AlertRow tone="amber" ic="V" title="Vehículo" sub="Precio, fotos, VIN/chasis, mileage, ubicación." action="Mejorar" /></div></section>
        <section className="card card-pad"><h2>Permisos Super Admin</h2><div className="col gap-8" style={{ marginTop: 12 }}><Mini label="Identidad sensible" value="Owner + auditoría" /><Mini label="Suspensiones" value="Owner + soporte senior" /><Mini label="Billing" value="Owner + finanzas" /><Mini label="Bancos" value="Owner + partnerships" /></div></section>
      </div>
      <UsdRateCard />
    </div>
  )
}

function AdminLiveTools() {
  const [wa, setWa] = useState(null)
  const [gw, setGw] = useState(null) // gateway status (reuse Reparando's worker)
  const [busy, setBusy] = useState(false)
  const [phone, setPhone] = useState('')
  const [testTo, setTestTo] = useState('')
  const [msg, setMsg] = useState('')
  const [hist, setHist] = useState([])
  const [histKind, setHistKind] = useState(null) // null | 'otp' | 'notif'
  const timer = useRef(null)
  const [healthState, setHealth] = useState(null)
  const [requeuing, setRequeuing] = useState(false)

  const loadHist = (k = histKind) => getNotifications(k).then(setHist).catch(() => {})
  useEffect(() => { loadHist() }, [histKind]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    try { setWa(await getWaStatus()) } catch (e) { setMsg(e.message || String(e)) }
    // Delivery health is mode-agnostic, so poll it alongside the worker status.
    getWaHealth().then(setHealth).catch(() => {})
  }
  useEffect(() => {
    load(); checkWaGateway().then(setGw).catch(() => {})
    timer.current = setInterval(load, 4000)
    return () => clearInterval(timer.current)
  }, [])

  const run = (fn) => async () => { setBusy(true); setMsg(''); try { await fn(); await load() } catch (e) { setMsg(e.message || String(e)) } finally { setBusy(false) } }
  const linkQr = run(() => waLinkQr())
  const startPair = run(() => { if (!phone.trim()) throw new Error('Ingresa el número'); return waStartPairing(phone) })
  const disconnect = run(() => waDisconnect())
  const testSend = async () => {
    setBusy(true); setMsg('')
    try { const r = await sendPhoneOtp(testTo, 'test'); setMsg(r.ok ? `Código de prueba enviado a ${r.phone || testTo}` : `Error: ${r.error || 'no se pudo enviar'}`); loadHist() }
    catch (e) { setMsg(e.message || String(e)) } finally { setBusy(false) }
  }

  const status = wa?.status || 'disconnected'
  const meta = STATUS_META[status] || STATUS_META.disconnected
  const connected = status === 'connected'
  // Gateway mode: AutoRD reuses Reparando's running worker + linked number.
  // When active, the QR/pairing UI here is irrelevant.
  const gateway = gw?.mode === 'reparando'
  // Heuristic: enabled but no recent heartbeat -> the worker probably isn't running.
  // Only meaningful for OUR worker; in gateway mode the heartbeat lives in the
  // other project, which is why delivery health (below) is the real signal.
  const stale = !gateway && wa?.enabled && wa?.last_seen_at && (Date.now() - new Date(wa.last_seen_at).getTime() > 30000)
  // Works in BOTH modes: stuck/stalled queue, or codes going out and never used.
  const health = healthState
  const bad = health?.verdict === 'down'
  const warn = health?.verdict === 'warn'
  // In gateway mode this is the ONLY liveness signal AutoRD has — previously
  // there was none at all, so a dead shared worker was completely silent here.
  const gatewayDown = gateway && gw?.ready === false

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 640 }}>
        <Link to="/" className="side-link" style={{ display: 'inline-flex', gap: 6, marginTop: 12 }}><ArrowLeft size={16} /> Volver al sitio</Link>

        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="row between center" style={{ marginBottom: 4 }}>
            <div className="row center gap-8">
              <div className="verify-ic ok" style={{ background: 'var(--teal-50)', color: 'var(--teal-700)' }}><ShieldCheck size={20} /></div>
              <h1 style={{ fontSize: 20 }}>WhatsApp del sistema</h1>
            </div>
            <span className={`chip ${gateway ? 'chip-green' : meta.cls}`}>{gateway ? 'Conectado (Reparando)' : meta.label}</span>
          </div>
          <p className="muted small" style={{ marginBottom: 16 }}>
            {gateway
              ? 'Los códigos se envían por WhatsApp reutilizando tu conexión de Reparando — sin costos de SMS.'
              : 'Vincula tu WhatsApp para enviar los códigos de verificación desde tu número — sin costos de SMS.'}
          </p>

          {stale && (
            <div className="notice" style={{ marginBottom: 14, borderColor: 'var(--amber-bd)', background: 'var(--amber-bg)' }}>
              <Info size={16} /><span>El worker de WhatsApp no está respondiendo. Asegúrate de que <code>autord-wa-worker</code> esté corriendo.</span>
            </div>
          )}
          {gatewayDown && (
            <div className="notice" style={{ marginBottom: 14, borderColor: 'var(--red-bd)', background: 'var(--red-bg)' }}>
              <Info size={16} /><span>El gateway de Reparando no tiene una conexión activa. Los códigos y avisos no se están enviando.</span>
            </div>
          )}
          {wa?.worker_error && <div className="notice" style={{ marginBottom: 14, borderColor: 'var(--red-bd)', background: 'var(--red-bg)' }}><Info size={16} /><span>{wa.worker_error}</span></div>}

          {/* Delivery health — the signal that works in BOTH modes. */}
          {health && (
            <div className="card" style={{ padding: 12, marginBottom: 14, borderColor: bad ? 'var(--red-bd)' : warn ? 'var(--amber-bd)' : 'var(--line)' }}>
              <div className="row between center" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div className="row center gap-8">
                  <span className="chip" style={{
                    background: bad ? 'var(--red-bg)' : warn ? 'var(--amber-bg)' : 'var(--green-bg)',
                    color: bad ? 'var(--red)' : warn ? 'var(--amber)' : 'var(--green)', fontWeight: 700,
                  }}>
                    {bad ? 'Entrega caída' : warn ? 'Revisar' : 'Entrega OK'}
                  </span>
                  <span className="small">{health.reason}</span>
                </div>
                {health.stuckSending > 0 && (
                  <button className="btn btn-outline btn-sm" disabled={requeuing} onClick={async () => {
                    setRequeuing(true)
                    const n = await requeueStuckWaMessages(5)
                    setMsg(n > 0 ? `${n} mensaje(s) devueltos a la cola.` : 'No había mensajes atascados.')
                    setRequeuing(false); load()
                  }}>
                    {requeuing ? <Loader2 size={14} className="spin" /> : null} Reintentar {health.stuckSending} atascado(s)
                  </button>
                )}
              </div>
              <div className="row wrap gap-16" style={{ marginTop: 10 }}>
                <HealthStat label="En cola" value={health.queued} bad={health.queued > 0} />
                <HealthStat label="Atascados" value={health.stuckSending} bad={health.stuckSending > 0} />
                <HealthStat label="Enviados (1h)" value={health.sent1h} />
                <HealthStat label="Fallidos (1h)" value={health.failed1h} bad={health.failed1h > 0} />
                <HealthStat label="Códigos (15 min)" value={`${health.otpsUsed15m}/${health.otps15m} usados`} />
              </div>
            </div>
          )}

          {gateway ? (
            <div className="col gap-12">
              <div className="kyc-banner">
                <div className="ic"><ShieldCheck size={20} /></div>
                <div><div className="strong">Conectado vía Reparando</div><div className="tiny" style={{ color: 'var(--green)' }}>Los códigos se envían desde {gw.sender ? `+${gw.sender}` : 'tu número de Reparando'}. No necesitas vincular nada aquí.</div></div>
              </div>
              <div className="field">
                <label>Enviar código de prueba</label>
                <div className="row gap-8">
                  <input className="input" placeholder="809-000-0000" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                  <button className="btn btn-primary" disabled={busy || !testTo} onClick={testSend}><Send size={15} /> Enviar</button>
                </div>
              </div>
            </div>
          ) : connected ? (
            <div className="col gap-12">
              <div className="kyc-banner">
                <div className="ic"><ShieldCheck size={20} /></div>
                <div><div className="strong">Conectado como {wa.phone_number || '—'}</div><div className="tiny" style={{ color: 'var(--green)' }}>Los códigos se envían desde este número.</div></div>
              </div>
              <div className="field">
                <label>Enviar código de prueba</label>
                <div className="row gap-8">
                  <input className="input" placeholder="809-000-0000" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                  <button className="btn btn-primary" disabled={busy || !testTo} onClick={testSend}><Send size={15} /> Enviar</button>
                </div>
              </div>
              <button className="btn btn-outline" disabled={busy} onClick={disconnect}><Power size={15} /> Desconectar</button>
            </div>
          ) : (
            <div className="col gap-14">
              {/* QR mode */}
              {status === 'qr' && wa?.qr ? (
                <div className="col center" style={{ alignItems: 'center', textAlign: 'center' }}>
                  <img src={wa.qr} alt="Código QR de WhatsApp" style={{ width: 260, height: 260, borderRadius: 12, border: '1px solid var(--line)' }} />
                  <div className="tiny muted" style={{ marginTop: 8 }}>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</div>
                </div>
              ) : (
                <button className="btn btn-navy btn-lg" disabled={busy} onClick={linkQr}>
                  {busy ? <Loader2 size={18} className="spin" /> : <QrCode size={18} />} Conectar por QR
                </button>
              )}

              {/* Pairing-code mode */}
              {status === 'pairing' && wa?.pairing_code ? (
                <div className="col center" style={{ alignItems: 'center', textAlign: 'center' }}>
                  <div className="tiny muted">Ingresa este código en WhatsApp → Dispositivos vinculados → Vincular con número</div>
                  <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 6, marginTop: 6 }}>{wa.pairing_code}</div>
                </div>
              ) : (
                <div className="field">
                  <label>O vincular con tu número (sin QR)</label>
                  <div className="row gap-8">
                    <input className="input" placeholder="1 809 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    <button className="btn btn-outline" disabled={busy} onClick={startPair}><Smartphone size={15} /> Obtener código</button>
                  </div>
                  <span className="help">Incluye el código de país (RD = 1).</span>
                </div>
              )}
            </div>
          )}

          {msg && <div className="notice" style={{ marginTop: 14 }}><Info size={16} /><span>{msg}</span></div>}
        </div>

        {/* Enroll a partner bank + its first owner account */}
        <EnrollBankCard />

        {/* USD -> DOP reference rate: most inventory is priced in dollars, every
            bank lends in pesos, and without this no USD car can be financed. */}
        <UsdRateCard />

        {/* Recover cédula portraits Didit still holds but we never stored */}
        <KycPortraitBackfillCard />

        {/* Verified identities that never became an application */}
        <VerifiedWithoutApplicationCard />

        {/* History of sent WhatsApp messages */}
        <div className="card card-pad" style={{ marginTop: 14 }}>
          <div className="row between center" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div className="row center gap-8"><History size={18} /><h2 style={{ fontSize: 16 }}>Historial de notificaciones</h2></div>
            <div className="row gap-8">
              {HIST_FILTERS.map((f) => (
                <button key={f.label} className={`btn btn-sm ${histKind === f.val ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setHistKind(f.val)}>{f.label}</button>
              ))}
            </div>
          </div>
          {hist.length === 0 ? (
            <div className="muted small">Sin notificaciones todavía.</div>
          ) : (
            <div className="col">
              {hist.map((h) => {
                const t = TYPE_META[h.type] || TYPE_META.other
                const TI = t.icon
                const ok = h.status === 'sent', fail = h.status === 'failed'
                return (
                  <div key={h.id} className="row between center" style={{ borderTop: '1px solid var(--line)', padding: '10px 0', gap: 10 }}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row center gap-8">
                        <span className="chip" style={{ fontSize: 11 }}><TI size={12} /> {t.label}</span>
                        <span className="small strong">+{h.to_phone}</span>
                      </div>
                      <div className="tiny muted" style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.body}</div>
                    </div>
                    <div className="col" style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                      <span className="chip" style={{ fontSize: 11, background: ok ? 'var(--green-bg)' : fail ? 'var(--red-bg)' : 'var(--line)', color: ok ? 'var(--green)' : fail ? 'var(--red)' : 'var(--muted)' }}>
                        {ok ? 'Enviado' : fail ? 'Falló' : 'En cola'}
                      </span>
                      <span className="tiny muted" style={{ marginTop: 3 }}>{fmtWhen(h.created_at)}{h.via ? ` · ${h.via}` : ''}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <p className="tiny muted" style={{ textAlign: 'center', marginTop: 12 }}>
          {gateway
            ? 'Modo gateway: usa el worker de Reparando. No requiere un worker de AutoRD.'
            : <>Requiere el worker <code>autord-wa-worker</code> corriendo 24/7.</>}
        </p>
      </div>
    </main>
  )
}

// Platform admin: enroll a partner bank (creates the bank + seeds its rate card
// + rules) and its first OWNER account, which can then self-manage its analysts.
function EnrollBankCard() {
  return <EnrollBankCardInner />
}

// The platform reference rate. It drives estimates shown before a bank is
// chosen; the binding figure is whatever the lending bank quotes. Left unset,
// no USD car can be financed at all — so this card says so plainly rather than
// looking like an optional setting.
function UsdRateCard() {
  const [meta, setMeta] = useState(undefined)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)

  const load = () => getUsdDopRateMeta().then((m) => {
    setMeta(m)
    setDraft(m.rate != null ? String(m.rate) : '')
  }).catch(() => setMeta({ rate: null, updatedAt: null }))
  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true); setErr(''); setOk(false)
    try {
      await setUsdDopRate(draft)
      await load()
      setOk(true)
    } catch (e) {
      setErr(e?.message || 'No se pudo guardar la tasa.')
    } finally {
      setSaving(false)
    }
  }

  const rate = meta?.rate ?? null
  const preview = Number(draft) > 0 ? Math.round(96000 * Number(draft)) : null

  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <div className="row between center" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <h3 className="row center gap-8" style={{ fontSize: 15, margin: 0 }}>
          <Landmark size={16} color="var(--teal-700)" /> Tasa de referencia USD → DOP
        </h3>
        {meta !== undefined && (
          <span className={`chip ${rate != null ? 'chip-green' : 'chip-amber'}`}>
            {rate != null ? `RD$ ${rate} por US$1` : 'Sin configurar'}
          </span>
        )}
      </div>

      {rate == null && meta !== undefined && (
        <div className="notice" style={{ borderColor: '#fed7aa', background: '#fff7ed', color: '#9a3412', marginBottom: 12 }}>
          <Info size={16} />
          <span>Sin tasa, los vehículos cotizados en US$ no se pueden financiar: la solicitud se detiene antes de enviarse al banco.</span>
        </div>
      )}

      <div className="row gap-8 wrap" style={{ alignItems: 'flex-end' }}>
        <label className="col gap-4" style={{ minWidth: 160 }}>
          <span className="tiny strong">DOP por 1 USD</span>
          <input className="input" inputMode="decimal" value={draft} placeholder="61"
            onChange={(e) => { setDraft(e.target.value.replace(/[^0-9.]/g, '')); setOk(false) }} />
        </label>
        <button className="btn btn-primary" onClick={save} disabled={saving || draft === ''}>
          {saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />} Guardar tasa
        </button>
      </div>

      {preview != null && (
        <div className="tiny muted" style={{ marginTop: 8 }}>
          Un vehículo de US$96,000 se mostraría como RD$ {preview.toLocaleString('en-US')}.
        </div>
      )}
      {meta?.updatedAt && (
        <div className="tiny muted" style={{ marginTop: 4 }}>
          Actualizada el {new Date(meta.updatedAt).toLocaleString('es-DO')}.
        </div>
      )}
      {err && <div className="notice" style={{ marginTop: 10, borderColor: '#fecaca', background: '#fff1f2', color: '#991b1b' }}><Info size={16} /><span>{err}</span></div>}
      {ok && <div className="notice" style={{ marginTop: 10 }}><Check size={16} /><span>Tasa guardada. Los estimados nuevos ya la usan; las solicitudes ya enviadas conservan la tasa con la que se crearon.</span></div>}
    </div>
  )
}

// The webhook only began storing the cédula portrait at v14, so every earlier
// verification shows no face in the bank expediente. KYC stays valid ~1 year and
// buyers open new solicitudes against the same old verification, so waiting for
// re-verification would leave a year of files faceless. Didit still has the
// images and re-issues URLs on request — this pulls them into our bucket once,
// after which they never expire again.
function KycPortraitBackfillCard() {
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')

  async function run(dryRun) {
    setBusy(true); setErr(''); setRes(null)
    try {
      setRes(await backfillKycPortraits({ limit: 100, dryRun }))
    } catch (e) {
      setErr(e?.message || 'No se pudo ejecutar el respaldo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <h3 className="row center gap-8" style={{ fontSize: 15, margin: '0 0 6px' }}>
        <ShieldCheck size={16} color="var(--teal-700)" /> Fotos de cédula (expediente)
      </h3>
      <p className="tiny muted" style={{ marginBottom: 12 }}>
        Recupera desde Didit la foto del titular impresa en la cédula y la guarda en AutoRD.
        Las verificaciones anteriores no la tienen, y por eso el expediente del banco aparece sin rostro.
      </p>
      <div className="row gap-8 wrap">
        <button className="btn btn-outline" onClick={() => run(true)} disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <Info size={16} />} Probar sin guardar
        </button>
        <button className="btn btn-primary" onClick={() => run(false)} disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />} Recuperar fotos
        </button>
      </div>
      {res && (
        <div className="notice" style={{ marginTop: 12 }}>
          <Info size={16} />
          <span>
            {res.dryRun ? 'Prueba: ' : ''}{res.captured} de {res.scanned} recuperadas
            {res.noPortrait ? ` · ${res.noPortrait} sin foto en Didit` : ''}
            {res.failures?.length ? ` · ${res.failures.length} con error` : ''}.
            {res.noPortrait === res.scanned && res.scanned > 0 && ' Didit no devolvió ninguna foto: revisa el workflow.'}
          </span>
        </div>
      )}
      {err && <div className="notice" style={{ marginTop: 12, borderColor: '#fecaca', background: '#fff1f2', color: '#991b1b' }}><Info size={16} /><span>{err}</span></div>}
    </div>
  )
}

function HealthStat({ label, value, bad }) {
  return (
    <div>
      <div className="tiny muted">{label}</div>
      <div className="strong small" style={bad ? { color: 'var(--red, #b91c1c)' } : undefined}>{value}</div>
    </div>
  )
}

// A buyer who passes KYC but abandons the wizard before "Enviar solicitud a
// bancos" leaves no application — invisible to every dealer and bank, despite
// being the highest-intent lead there is. This is the only place they surface.
function VerifiedWithoutApplicationCard() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    getVerifiedWithoutApplication()
      .then((r) => { if (alive) setRows(r) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [])

  const nudge = (r) => {
    const name = (r.name || '').split(' ')[0]
    const text = `Hola${name ? ` ${name}` : ''}, ya verificamos tu identidad en AutoRD ✅. Solo falta elegir los bancos para enviar tu solicitud — toma menos de un minuto: ${typeof window !== 'undefined' ? window.location.origin : ''}/financiamiento`
    return `https://wa.me/${String(r.phone || '').replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`
  }

  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <div className="row between center" style={{ marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div className="row center gap-8">
          <ShieldCheck size={18} />
          <h2 style={{ fontSize: 16 }}>Verificados sin solicitud</h2>
        </div>
        {rows?.length > 0 && <span className="chip">{rows.length}</span>}
      </div>
      <p className="tiny muted" style={{ marginBottom: 10 }}>
        Identidad verificada pero nunca enviaron la solicitud a bancos. Son los leads más calientes que tienes.
      </p>

      {rows === null ? (
        <div className="muted small row center gap-8"><Loader2 size={14} className="spin" /> Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="muted small">Nadie pendiente — todos los verificados completaron su solicitud.</div>
      ) : (
        <div className="col">
          {rows.map((r) => (
            <div key={r.profileId} className="row between center" style={{ borderTop: '1px solid var(--line)', padding: '10px 0', gap: 10, flexWrap: 'wrap' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row center gap-8" style={{ flexWrap: 'wrap' }}>
                  <span className="small strong">{r.name || 'Sin nombre'}</span>
                  {r.graced && <span className="chip" style={{ fontSize: 10.5 }}>cédula vencida · gracia</span>}
                </div>
                <div className="tiny muted" style={{ marginTop: 3 }}>
                  +{r.phone}{r.phoneVerified ? ' · WhatsApp verificado' : ''} · verificado {r.daysSince != null ? (r.daysSince < 1 ? 'hoy' : `hace ${Math.round(r.daysSince)} día${Math.round(r.daysSince) === 1 ? '' : 's'}`) : '—'}
                </div>
              </div>
              {r.phone && (
                <a className="btn btn-sm" href={nudge(r)} target="_blank" rel="noreferrer"
                  style={{ background: '#25D366', color: '#fff', border: 'none', flexShrink: 0 }}>
                  <WhatsAppIcon size={15} /> Recordar
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EnrollBankCardInner() {
  const [f, setF] = useState({ bankName: '', slug: '', color: '#0f766e', ownerName: '', ownerEmail: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null) // { email, tempPassword, slug }
  const [copied, setCopied] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const submit = async () => {
    setErr('')
    if (!f.bankName.trim()) { setErr('Ingresa el nombre del banco'); return }
    if (!/^\S+@\S+\.\S+$/.test(f.ownerEmail.trim())) { setErr('Correo del administrador inválido'); return }
    setSaving(true)
    try {
      const res = await enrollBank({
        bankName: f.bankName.trim(), slug: f.slug.trim() || undefined,
        color: f.color, ownerName: f.ownerName.trim() || undefined, ownerEmail: f.ownerEmail.trim(),
      })
      setDone({ email: f.ownerEmail.trim(), tempPassword: res.tempPassword, slug: res.slug })
    } catch (e) {
      setErr(e?.message === 'email_invalido' ? 'Correo inválido' : (e?.message || 'No se pudo enrolar el banco'))
    } finally { setSaving(false) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(`Correo: ${done.email}\nContraseña temporal: ${done.tempPassword}`); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch (_) { /* ignore */ }
  }
  const reset = () => { setDone(null); setF({ bankName: '', slug: '', color: '#0f766e', ownerName: '', ownerEmail: '' }) }

  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <div className="row center gap-8" style={{ marginBottom: 4 }}>
        <div className="verify-ic" style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--teal-50)', color: 'var(--teal-700)' }}><Landmark size={18} /></div>
        <h2 style={{ fontSize: 16 }}>Enrolar banco</h2>
      </div>
      <p className="muted small" style={{ marginBottom: 14 }}>Crea un banco socio con su tarjeta de tasas por defecto y la cuenta de administrador. Ese administrador podrá crear a sus analistas desde el portal del banco.</p>

      {done ? (
        <div className="col gap-12">
          <div className="notice" style={{ borderColor: 'var(--green-bd)', background: 'var(--green-bg)' }}>
            <KeyRound size={16} /><span>Banco creado (<strong>{done.slug}</strong>). Comparte estas credenciales con el administrador — la contraseña <strong>no se volverá a mostrar</strong>.</span>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="row between center" style={{ marginBottom: 6 }}><span className="tiny muted">Correo</span><span className="small strong">{done.email}</span></div>
            <div className="row between center"><span className="tiny muted">Contraseña temporal</span><span className="small strong" style={{ fontFamily: 'monospace' }}>{done.tempPassword}</span></div>
          </div>
          <div className="row gap-8">
            <button className="btn btn-outline grow" onClick={copy}>{copied ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar credenciales</>}</button>
            <button className="btn btn-primary" onClick={reset}>Enrolar otro</button>
          </div>
        </div>
      ) : (
        <div className="col gap-12">
          <div className="row gap-10 wrap">
            <label className="col gap-4 grow" style={{ minWidth: 180 }}><span className="tiny strong">Nombre del banco</span>
              <input className="input" value={f.bankName} onChange={set('bankName')} placeholder="Ej: Banco Vimenca" /></label>
            <label className="col gap-4" style={{ minWidth: 120 }}><span className="tiny strong">Slug (opcional)</span>
              <input className="input" value={f.slug} onChange={set('slug')} placeholder="banco-vimenca" /></label>
          </div>
          <div className="row gap-10 wrap center">
            <label className="col gap-4"><span className="tiny strong">Color</span>
              <input type="color" value={f.color} onChange={set('color')} style={{ width: 52, height: 38, border: '1px solid var(--line)', borderRadius: 8, background: '#fff', cursor: 'pointer' }} /></label>
            <label className="col gap-4 grow" style={{ minWidth: 160 }}><span className="tiny strong">Nombre del administrador</span>
              <input className="input" value={f.ownerName} onChange={set('ownerName')} placeholder="Ej: Carlos Gómez" /></label>
          </div>
          <label className="col gap-4"><span className="tiny strong">Correo del administrador</span>
            <input className="input" type="email" value={f.ownerEmail} onChange={set('ownerEmail')} placeholder="admin@bancovimenca.com" /></label>
          {err && <div className="tiny" style={{ color: '#dc2626' }}>{err}</div>}
          <button className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? <><Loader2 size={16} className="spin" /> Creando…</> : <><UserPlus size={16} /> Crear banco y administrador</>}</button>
        </div>
      )}
    </div>
  )
}
