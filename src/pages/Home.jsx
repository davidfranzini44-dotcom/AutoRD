import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search, Car, BadgeCheck, ShieldCheck, ArrowRight,
  Clock, MonitorSmartphone, Landmark,
  MonitorSmartphone as Monitor, Calculator, FileCheck,
  IdCard, Store, MapPin, SlidersHorizontal,
} from 'lucide-react'
import VehicleCard from '../components/VehicleCard'
import CarImage from '../components/CarImage'
import BrandLogo from '../components/BrandLogo'
import heroVehiclePhoto from '../assets/cars/suv-1.jpg'
import { BODY_TYPES } from '../data/bodyTypes'
import { listVehicles, listDealers } from '../data/api'
import { useFicha } from '../context/FichaContext'
import { fmtRD } from '../data/demo'
import { BANK_RATES, estimateMonthly, affordablePrice, fmtMoneyInput } from '../data/finance'

const SEARCH_TABS = [
  { id: 'todos', label: 'Todos los vehículos', shortLabel: 'Todos', icon: Car },
  { id: 'nuevos', label: 'Nuevos', shortLabel: 'Nuevos', icon: BadgeCheck },
  { id: 'certificados', label: 'Usados certificados', shortLabel: 'Certificados', icon: ShieldCheck },
]
const YEAR_RANGES = [
  { value: '2015-2024', label: '2015 - 2024' },
  { value: '2020-2024', label: '2020 - 2024' },
  { value: '2022-2024', label: '2022 - 2024' },
  { value: '2018-2021', label: '2018 - 2021' },
  { value: '', label: 'Todos los años' },
]
const PRICE_OPTIONS = [900000, 1300000, 1800000, 2450000]
const TRUST = [
  { icon: Landmark, t: 'Financiamiento real', d: 'con múltiples bancos' },
  { icon: Clock, t: 'Respuesta rápida', d: 'En minutos' },
  { icon: Monitor, t: '100% online', d: 'Sin filas, sin papeleos' },
  { icon: ShieldCheck, t: 'Seguridad y privacidad', d: 'Tus datos protegidos' },
]
const BRAND_LINKS = [
  { name: 'Toyota', count: 124 },
  { name: 'Honda', count: 98 },
  { name: 'Hyundai', count: 86 },
  { name: 'Kia', count: 74 },
  { name: 'Nissan', count: 68 },
  { name: 'BMW', count: 36 },
  { name: 'Mercedes-Benz', count: 32 },
  { name: 'Ford', count: 29 },
]
const VERIFIED_DEALERS = [
  { name: 'AutoPlaza RD', location: 'Santo Domingo', inventory: 128, initials: 'AP' },
  { name: 'Núñez Motors', location: 'Santiago', inventory: 96, initials: 'NM' },
  { name: 'Capital Auto Gallery', location: 'La Romana', inventory: 75, initials: 'CA' },
]
const FINANCE_CONFIDENCE = [
  { icon: ShieldCheck, text: 'Sin impactar tu crédito' },
  { icon: FileCheck, text: '100% confidencial' },
  { icon: Landmark, text: '+10 bancos te responden' },
]
const HOME_TRUST_STEPS = [
  { icon: IdCard, title: 'KYC verificado', text: 'Tu cédula y prueba de vida protegidas desde el inicio.' },
  { icon: FileCheck, title: 'Autorización crediticia online', text: 'Das permiso al banco para evaluar tu solicitud sin papeleo.' },
  { icon: Landmark, title: 'Respuesta de bancos en minutos', text: 'Recibe opciones reales para avanzar con el vehículo elegido.' },
]
const BODY_TYPE_PRICES = {
  SUV: 'Desde RD$ 650K',
  Pickup: 'Desde RD$ 720K',
  Sedán: 'Desde RD$ 450K',
  Coupé: 'Desde RD$ 850K',
  Minivan: 'Desde RD$ 600K',
  Hatchback: 'Desde RD$ 420K',
  Convertible: 'Desde RD$ 1.2M',
  Wagon: 'Desde RD$ 520K',
}
export default function Home() {
  const navigate = useNavigate()
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [segment, setSegment] = useState('todos')
  const [tipo, setTipo] = useState('todos')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [anioRange, setAnioRange] = useState('2015-2024')
  const [precioMax, setPrecioMax] = useState('2450000')
  const [ubicacion, setUbicacion] = useState('Santo Domingo')
  const [sort, setSort] = useState('relevancia')
  const [showCalculator, setShowCalculator] = useState(false)
  const [calcPrice, setCalcPrice] = useState(1250000)
  const [calcDownPct, setCalcDownPct] = useState(20)
  const [calcTerm, setCalcTerm] = useState(60)
  const [calcIncome, setCalcIncome] = useState('')

  useEffect(() => {
    let alive = true
    listVehicles({ tab: 'todos' })
      .then((d) => { if (alive) setAll(d) })
      .catch(() => { if (alive) setAll([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const [dealers, setDealers] = useState([])
  useEffect(() => {
    let alive = true
    listDealers().then((d) => { if (alive) setDealers(d) }).catch(() => {})
    return () => { alive = false }
  }, [])
  const homeDealers = dealers.length
    ? [...dealers].sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0)).slice(0, 3)
        .map((d) => ({ name: d.name, slug: d.slug, initials: d.initials, location: d.city || 'RD', inventory: d.vehicles.length, verified: d.verified }))
    : VERIFIED_DEALERS

  // "Explorar por tipo" shows 6 at a time; the arrow pages to the other types.
  const [btPage, setBtPage] = useState(0)
  const btWindow = btPage === 0 ? BODY_TYPES.slice(0, 6) : BODY_TYPES.slice(-6)
  const cycleBodytypes = () => setBtPage((p) => (p === 0 ? 1 : 0))

  const options = useMemo(() => {
    const unique = (items) => [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es-DO'))
    return {
      types: unique(all.map((v) => v.bodyType)),
      makes: unique(all.map((v) => v.make)),
      models: unique(all.filter((v) => !marca || v.make === marca).map((v) => v.model)),
      locations: unique(all.map((v) => v.location)),
    }
  }, [all, marca])

  const list = useMemo(() => {
    let r = all.filter((v) => {
      if (segment === 'nuevos' && !(v.condition === 'Nuevo' || v.year >= 2024 || v.mileage === 0)) return false
      if (segment === 'certificados' && !v.certified) return false
      if (tipo !== 'todos' && v.bodyType !== tipo) return false
      if (marca && v.make !== marca) return false
      if (modelo && v.model !== modelo) return false
      if (ubicacion && v.location !== ubicacion) return false
      if (precioMax && v.price > Number(precioMax)) return false
      if (anioRange) {
        const [min, max] = anioRange.split('-').map(Number)
        if (v.year < min || v.year > max) return false
      }
      return true
    })
    r = [...r].sort((a, b) => {
      if (sort === 'menor') return a.price - b.price
      if (sort === 'mayor') return b.price - a.price
      if (sort === 'nuevo') return b.year - a.year
      return 0
    })
    return r
  }, [all, segment, tipo, marca, modelo, ubicacion, precioMax, anioRange, sort])

  const featuredList = list.slice(0, 5)
  const recentList = all.slice(5, 10)
  const calcApr = BANK_RATES.popular
  const calcDown = Math.round(calcPrice * (calcDownPct / 100))
  const calcPrincipal = Math.max(0, calcPrice - calcDown)
  const calcMonthly = estimateMonthly(calcPrincipal, calcApr, calcTerm)
  const incomeNum = Number(String(calcIncome).replace(/[^\d]/g, '')) || 0
  const afford = affordablePrice({ income: incomeNum, down: calcDown, apr: calcApr, months: calcTerm })
  const approvedEstimate = afford.price || 0
  const approvedSearchLimit = approvedEstimate > 0
    ? Math.ceil((approvedEstimate * 1.1) / 50000) * 50000
    : 0
  const preapprovalAmount = approvedEstimate || calcPrice
  const calcYears = Math.min(7, Math.max(4, Math.round(calcTerm / 12)))
  const preapLink = incomeNum > 0
    ? `/financiamiento?ingreso=${incomeNum}&monto=${preapprovalAmount}&plazo=${calcYears}`
    : '/financiamiento'

  useEffect(() => {
    try {
      if (incomeNum > 0) sessionStorage.setItem('autord_calc', JSON.stringify({ ingreso: incomeNum, monto: preapprovalAmount, plazo: calcYears }))
    } catch { /* ignore storage errors */ }
  }, [incomeNum, preapprovalAmount, calcYears])

  const resetFilters = () => {
    setSegment('todos'); setTipo('todos'); setMarca(''); setModelo('')
    setAnioRange(''); setPrecioMax(''); setUbicacion('')
  }
  const runSearch = () => {
    const params = new URLSearchParams()
    if (segment === 'nuevos') params.set('condicion', 'nuevo')
    if (segment === 'certificados') params.set('condicion', 'certified')
    if (tipo && tipo !== 'todos') params.set('tipo', tipo)
    if (marca) params.set('marca', marca)
    if (modelo) params.set('modelo', modelo)
    if (precioMax) params.set('precioMax', precioMax)
    if (ubicacion) params.set('ubicacion', ubicacion)
    if (anioRange) {
      const [min, max] = anioRange.split('-')
      if (min) params.set('anioMin', min)
      if (max) params.set('anioMax', max)
    }
    navigate(`/buscar${params.toString() ? `?${params.toString()}` : ''}`)
  }
  const toggleCalculator = () => {
    setShowCalculator((open) => !open)
    if (!showCalculator) window.setTimeout(() => {
      document.getElementById('calculadora-cuotas')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 40)
  }

  return (
    <main className="page">
      <div className="container">
        {/* ---------------- Hero ---------------- */}
        <section className="hero2">
          <div className="hero2-photo"><CarImage make="Toyota" model="RAV4" bodyType="SUV" seed="hero" photo={heroVehiclePhoto} label="Vehículo" /></div>
          <div className="hero2-text">
            <h1>Compra tu vehículo<br />con financiamiento real</h1>
            <p>Encuentra tu próximo vehículo y obtén ofertas de los mejores bancos de la República Dominicana.</p>
            <div className="hero2-trust">
              <span><i className="ht-ic"><MonitorSmartphone size={17} /></i> 100% Online</span>
              <span><i className="ht-ic"><Landmark size={17} /></i> Respuesta de bancos</span>
              <span><i className="ht-ic"><ShieldCheck size={17} /></i> Seguridad y transparencia</span>
            </div>
          </div>
        </section>

        {/* ---------------- Advanced search ---------------- */}
        <div className="search-bar">
          <div className="search-tabs">
            {SEARCH_TABS.map((item) => {
              const Icon = item.icon
              return (
                <button key={item.id} className={`search-tab ${segment === item.id ? 'active' : ''}`} onClick={() => setSegment(item.id)}>
                  <Icon size={15} />
                  <span className="tab-label-full">{item.label}</span>
                  <span className="tab-label-short">{item.shortLabel}</span>
                </button>
              )
            })}
          </div>
          <div className="search-fields">
            <SearchSelect label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="todos">Todos</option>
              {options.types.map((t) => <option key={t} value={t}>{t}</option>)}
            </SearchSelect>
            <SearchSelect label="Marca" value={marca} onChange={(e) => { setMarca(e.target.value); setModelo('') }}>
              <option value="">Todas</option>
              {options.makes.map((m) => <option key={m} value={m}>{m}</option>)}
            </SearchSelect>
            <SearchSelect label="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)}>
              <option value="">Todos</option>
              {options.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </SearchSelect>
            <SearchSelect label="Año" value={anioRange} onChange={(e) => setAnioRange(e.target.value)}>
              {YEAR_RANGES.map((r) => <option key={r.label} value={r.value}>{r.label}</option>)}
            </SearchSelect>
            <SearchSelect label="Precio máx." value={precioMax} onChange={(e) => setPrecioMax(e.target.value)}>
              <option value="">Sin límite</option>
              {PRICE_OPTIONS.map((p) => <option key={p} value={p}>{fmtRD(p)}</option>)}
            </SearchSelect>
            <SearchSelect label="Ubicación" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)}>
              <option value="">Todas</option>
              {options.locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </SearchSelect>
            <button className="btn sp-btn" type="button" onClick={runSearch}><Search size={17} /> Buscar</button>
          </div>
          <div className="search-bar-note">
            <Link to="/buscar" className="search-advanced-cta"><SlidersHorizontal size={15} /> Búsqueda avanzada</Link>
          </div>
        </div>

        {/* ---------------- Discovery + financing ---------------- */}
        <section className="home-discovery-row" aria-label="Explorar vehículos y financiamiento">
          <div className="bodytype-section bodytype-section--showcase" aria-labelledby="bodytype-title">
            <div className="section-title compact-title">
              <h2 id="bodytype-title">Explorar por tipo de vehículo</h2>
              <Link to="/buscar" className="link-teal">Ver todos <ArrowRight size={15} /></Link>
            </div>
            <div className="bodytype-row bodytype-row--showcase" key={btPage}>
              {btWindow.map((b) => (
                <Link
                  key={b.type}
                  className="bt-item"
                  to={`/buscar?tipo=${encodeURIComponent(b.type)}`}
                >
                  <img className="bt-image" src={b.image} alt="" aria-hidden="true" />
                  <span className="bt-label">{b.label}</span>
                  <small>{BODY_TYPE_PRICES[b.type]}</small>
                </Link>
              ))}
            </div>
            <button type="button" className="bodytype-more-arrow" aria-label="Ver más tipos de vehículos" onClick={cycleBodytypes}>
              <ArrowRight size={18} />
            </button>
          </div>

          <aside className="finance-eligibility-card">
            <h2>¿Cuánto puedes financiar?</h2>
            <p>Verifica tu elegibilidad sin afectar tu puntaje de crédito.</p>

            <div className="finance-eligibility-pills">
              {FINANCE_CONFIDENCE.map((item) => {
                const Icon = item.icon
                return <span key={item.text}><Icon size={14} /> {item.text}</span>
              })}
            </div>

            <div className="finance-eligibility-actions">
              <Link to={preapLink} className={`btn btn-primary eligibility-cta ${approvedEstimate > 0 ? 'has-estimate' : ''}`}>
                {approvedEstimate > 0 ? (
                  <>
                    <span>Solicitar pre-aprobación</span>
                    <strong>{fmtRD(approvedEstimate)}</strong>
                  </>
                ) : 'Verificar elegibilidad'}
              </Link>
              <button
                type="button"
                className={`btn btn-outline calc-toggle ${showCalculator ? 'active' : ''}`}
                onClick={toggleCalculator}
                aria-expanded={showCalculator}
                aria-controls="calculadora-cuotas"
              >
                <Calculator size={16} /> {showCalculator ? 'Ocultar' : 'Calculadora'}
              </button>
            </div>
          </aside>
        </section>

        {showCalculator && (
          <section className="inline-finance-calculator" id="calculadora-cuotas" aria-label="Calculadora de cuotas">
            <div className="inline-calc-head">
              <div>
                <span className="section-kicker"><Calculator size={14} /> Calculadora</span>
                <h2>Calcula tu cuota estimada</h2>
                <p>Ajusta el precio, inicial y plazo para tener una referencia antes de pedir ofertas reales.</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCalculator(false)}>Cerrar</button>
            </div>

            <div className="inline-calc-grid">
              <div className="inline-calc-controls">
                <div className="calc-field">
                  <label>Precio del vehículo</label>
                  <input className="input" type="text" value={fmtRD(calcPrice)} readOnly />
                  <input className="range" type="range" min="200000" max="5000000" step="50000" value={calcPrice} onChange={(e) => setCalcPrice(Number(e.target.value))} />
                  <div className="range-labels"><span>RD$ 200,000</span><span>RD$ 5,000,000</span></div>
                </div>

                <div className="calc-field">
                  <label>Inicial</label>
                  <input className="input" type="text" value={`${calcDownPct}% (${fmtRD(calcDown)})`} readOnly />
                  <input className="range" type="range" min="10" max="50" step="5" value={calcDownPct} onChange={(e) => setCalcDownPct(Number(e.target.value))} />
                  <div className="range-labels"><span>10%</span><span>25%</span><span>50%</span></div>
                </div>

                <div className="calc-field">
                  <label>Plazo</label>
                  <select className="select" value={calcTerm} onChange={(e) => setCalcTerm(Number(e.target.value))}>
                    <option value={36}>36 meses</option>
                    <option value={48}>48 meses</option>
                    <option value={60}>60 meses</option>
                    <option value={72}>72 meses</option>
                    <option value={84}>84 meses</option>
                  </select>
                </div>

                <div className="calc-field">
                  <label>Ingreso mensual opcional</label>
                  <input className="input" type="text" inputMode="numeric" value={calcIncome} onChange={(e) => setCalcIncome(fmtMoneyInput(e.target.value))} placeholder="RD$ 85,000" />
                </div>
              </div>

              <aside className="inline-calc-result">
                <span>Cuota estimada</span>
                <strong>{fmtRD(calcMonthly)}<small>/mes</small></strong>
                <p>Tasa referencial desde {calcApr.toFixed(2)}%. El banco confirma condiciones finales.</p>
                <div className="inline-calc-breakdown">
                  <div><span>Monto a financiar</span><b>{fmtRD(calcPrincipal)}</b></div>
                  <div><span>Inicial</span><b>{fmtRD(calcDown)}</b></div>
                  <div><span>Plazo</span><b>{calcTerm} meses</b></div>
                  {approvedEstimate > 0 && <div><span>Estimado aprobado</span><b>{fmtRD(approvedEstimate)}</b></div>}
                  {approvedSearchLimit > 0 && <div><span>Rango sugerido (+10%)</span><b>{fmtRD(approvedSearchLimit)}</b></div>}
                </div>
                <div className="inline-calc-actions">
                  <Link to={preapLink} className="btn btn-primary">
                    {approvedEstimate > 0 ? `Solicitar pre-aprobación por ${fmtRD(approvedEstimate)}` : 'Solicitar pre-aprobación'}
                  </Link>
                  {approvedSearchLimit > 0 && (
                    <Link to={`/buscar?precioMax=${approvedSearchLimit}`} className="btn btn-outline">
                      Ver vehículos hasta {fmtRD(approvedSearchLimit)}
                    </Link>
                  )}
                </div>
              </aside>
            </div>
          </section>
        )}

        <section className="home-trust-strip" aria-label="Proceso seguro de financiamiento">
          {HOME_TRUST_STEPS.map((step) => {
            const Icon = step.icon
            return (
              <article className="home-trust-item" key={step.title}>
                <span><Icon size={19} /></span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                </div>
              </article>
            )
          })}
        </section>

        <section className="featured-panel" id="vehiculos-destacados">
          <div className="section-title">
            <h2>Vehículos destacados</h2>
            <Link to="/buscar" className="link-teal">Ver todos los vehículos <ArrowRight size={15} /></Link>
          </div>

          {loading ? (
            <div className="featured-home-grid">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="vcard" style={{ height: 320, background: 'var(--surface-2)' }} />)}</div>
          ) : list.length === 0 ? (
            <div className="card card-pad muted" style={{ textAlign: 'center', boxShadow: 'none' }}>Sin resultados. <button className="link-teal" onClick={resetFilters}>Limpiar filtros</button></div>
          ) : (
            <div className="featured-home-grid">{featuredList.map((v) => <VehicleCard key={v.id} v={v} />)}</div>
          )}
        </section>

        {/* ---------------- Recent listings ---------------- */}
        {!loading && recentList.length > 0 && (
          <section className="home-section">
            <div className="section-title">
              <h2>Recién publicados</h2>
              <Link to="/buscar" className="link-teal">Ver todos <ArrowRight size={15} /></Link>
            </div>
            <div className="recent-row">
              {recentList.map((v) => <RecentCard key={v.id} v={v} />)}
            </div>
          </section>
        )}

        {/* ---------------- Explore by brand ---------------- */}
        <section className="home-section">
          <div className="section-title">
            <h2>Explorar por marca</h2>
            <Link to="/buscar" className="link-teal">Ver todas las marcas <ArrowRight size={15} /></Link>
          </div>
          <div className="brand-grid">
            {BRAND_LINKS.map((brand) => (
              <Link
                key={brand.name}
                className="brand-tile"
                to={`/buscar?marca=${encodeURIComponent(brand.name)}`}
              >
                <BrandLogo make={brand.name} size={40} />
                <strong>{brand.name}</strong>
                <span>{brand.count} vehículos</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ---------------- Verified dealers ---------------- */}
        <section className="home-section">
          <div className="section-title">
            <h2>Dealers verificados</h2>
            <Link to="/dealers" className="link-teal">Ver dealers <ArrowRight size={15} /></Link>
          </div>
          <div className="dealer-grid">
            {homeDealers.map((dealer) => <DealerCard key={dealer.slug || dealer.name} dealer={dealer} />)}
          </div>
        </section>

        {/* ---------------- Sell CTA ---------------- */}
        <section className="sell-cta">
          <div>
            <h2>¿Quieres vender tu vehículo?</h2>
            <p>Publica tu vehículo o registra tu dealer en AutoRD para recibir compradores listos para financiar.</p>
          </div>
          <div className="sell-actions">
            <Link to="/ingresar" className="btn btn-primary"><Car size={16} /> Publicar vehículo</Link>
            <Link to="/ingresar" className="btn btn-outline"><Store size={16} /> Soy dealer</Link>
          </div>
          <div className="sell-photo" aria-hidden="true">
            <CarImage make="Ford" model="Ranger" bodyType="Pickup" seed="seller" label="Vehículo en venta" />
          </div>
        </section>

        {/* ---------------- Trust strip ---------------- */}
        <div className="trust-strip final-trust">
          {TRUST.map((t) => {
            const Icon = t.icon
            return (
              <div className="t" key={t.t}>
                <div className="trust-ic"><Icon size={19} /></div>
                <div><div className="lbl">{t.t}</div><div className="sub">{t.d}</div></div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}

function SearchSelect({ label, value, onChange, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select className="select" value={value} onChange={onChange}>{children}</select>
    </div>
  )
}

function RecentCard({ v }) {
  const { open } = useFicha()
  const badge = v.condition === 'Nuevo' ? 'nuevo' : v.certified ? 'certified' : 'used'
  const badgeText = v.condition === 'Nuevo' ? 'Nuevo' : v.certified ? 'Usado certificado' : 'Usado'
  const BadgeIcon = badge === 'nuevo' ? BadgeCheck : badge === 'certified' ? ShieldCheck : Car

  return (
    <div
      className="recent-card"
      role="button"
      tabIndex={0}
      aria-label={`Ver ${v.make} ${v.model} ${v.year}`}
      onClick={() => open(v)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(v) } }}
    >
      <div className="recent-photo">
        <span className={`badge-corner recent-badge ${badge}`}>
          <BadgeIcon size={13} strokeWidth={2.5} />
          {badgeText}
        </span>
        <CarImage make={v.make} model={v.model} bodyType={v.bodyType} seed={v.id} tone={v.tone} label={`${v.make} ${v.model}`} />
      </div>
      <div className="recent-body">
        <strong>{v.make} {v.model}</strong>
        <span>{v.year} · {v.trim} · {Number(v.mileage).toLocaleString('es-DO')} km</span>
        <b>{fmtRD(v.price)}</b>
        <em><MapPin size={12} /> {v.location}</em>
      </div>
    </div>
  )
}

function DealerCard({ dealer }) {
  const inner = (
    <>
      <div className="dealer-mark">{dealer.initials}</div>
      <div className="dealer-main">
        <div className="dealer-name">
          <strong>{dealer.name}</strong>
          {dealer.verified !== false && <BadgeCheck size={16} />}
        </div>
        <span><MapPin size={13} /> {dealer.location}</span>
        <p>{dealer.inventory} vehículo{dealer.inventory === 1 ? '' : 's'}</p>
        <div className="dealer-badges">
          {dealer.verified !== false && <span className="chip chip-teal"><ShieldCheck size={13} /> Dealer verificado</span>}
          <span className="chip chip-teal"><Landmark size={13} /> Financiamiento disponible</span>
        </div>
      </div>
    </>
  )
  return dealer.slug
    ? <Link to={`/dealers/${dealer.slug}`} className="dealer-card" style={{ cursor: 'pointer' }}>{inner}</Link>
    : <article className="dealer-card">{inner}</article>
}
