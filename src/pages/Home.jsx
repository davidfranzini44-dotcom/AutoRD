import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Car, BadgeCheck, ShieldCheck, ArrowRight,
  Clock, MonitorSmartphone, Landmark,
  MonitorSmartphone as Monitor, Calculator, FileCheck, LockKeyhole,
  IdCard, Store, MapPin,
} from 'lucide-react'
import VehicleCard from '../components/VehicleCard'
import CarImage from '../components/CarImage'
import BrandLogo from '../components/BrandLogo'
import { BODY_TYPES } from '../data/bodyTypes'
import { listVehicles } from '../data/api'
import { useFicha } from '../context/FichaContext'
import { fmtRD } from '../data/demo'
import { BANK_RATES, estimateMonthly, affordablePrice, fmtMoneyInput } from '../data/finance'

const SEARCH_TABS = [
  { id: 'todos', label: 'Todos los vehículos', icon: Car },
  { id: 'nuevos', label: 'Nuevos', icon: BadgeCheck },
  { id: 'certificados', label: 'Usados certificados', icon: ShieldCheck },
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
export default function Home() {
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

  const featuredList = list.slice(0, 4)
  const recentList = all.slice(5, 10)
  const calcApr = BANK_RATES.popular
  const calcDown = Math.round(calcPrice * (calcDownPct / 100))
  const calcPrincipal = Math.max(0, calcPrice - calcDown)
  const calcMonthly = estimateMonthly(calcPrincipal, calcApr, calcTerm)
  const incomeNum = Number(String(calcIncome).replace(/[^\d]/g, '')) || 0
  // Salary-based affordability: monthly income (≈30% DTI) -> max financeable price.
  const afford = affordablePrice({ income: incomeNum, down: 0, apr: calcApr, months: calcTerm })
  // Carry what they entered here into the pre-approval so we don't re-ask it.
  const calcYears = Math.min(7, Math.max(4, Math.round(calcTerm / 12)))
  const preapLink = incomeNum > 0
    ? `/financiamiento?ingreso=${incomeNum}&monto=${calcPrice}&plazo=${calcYears}`
    : '/financiamiento'

  // Remember the calculator inputs so the financing flow (from a car, the nav, etc.)
  // can reuse them and skip questions the customer already answered.
  useEffect(() => {
    try {
      if (incomeNum > 0) sessionStorage.setItem('autord_calc', JSON.stringify({ ingreso: incomeNum, monto: calcPrice, plazo: calcYears }))
    } catch { /* ignore storage errors */ }
  }, [incomeNum, calcPrice, calcYears])

  const resetFilters = () => {
    setSegment('todos'); setTipo('todos'); setMarca(''); setModelo('')
    setAnioRange(''); setPrecioMax(''); setUbicacion('')
  }
  const runSearch = () => document.getElementById('vehiculos-destacados')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <main className="page">
      <div className="container">
        {/* ---------------- Hero ---------------- */}
        <section className="hero2">
          <div className="hero2-photo"><CarImage make="Toyota" model="RAV4" bodyType="SUV" seed="hero" label="Vehículo" /></div>
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
                  <Icon size={15} /> {item.label}
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
        </div>

        {/* ---------------- Explorar por tipo de vehículo ---------------- */}
        <section className="bodytype-section" aria-labelledby="bodytype-title">
          <h2 id="bodytype-title">Explorar por tipo de vehículo</h2>
          <div className="bodytype-row">
            {BODY_TYPES.map((b) => (
              <Link
                key={b.type}
                className="bt-item"
                to={`/buscar?tipo=${encodeURIComponent(b.type)}`}
              >
                <img className="bt-image" src={b.image} alt="" aria-hidden="true" />
                <span className="bt-label">{b.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ---------------- Financing calculator ---------------- */}
        <section className="finance-calculator">
          <div className="finance-copy">
            <span className="section-kicker"><Calculator size={14} /> Financiamiento</span>
            <h2>Calcula tu cuota antes de aplicar</h2>
            <p>Simula tu financiamiento y recibe ofertas de bancos aliados sin salir de AutoRD.</p>

            <div className="calc-grid">
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
                <div className="range-labels"><span>10%</span><span>20%</span><span>30%</span><span>40%</span><span>50%</span></div>
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
                <label>Tu ingreso mensual (salario)</label>
                <input className="input" type="text" inputMode="numeric" value={calcIncome} onChange={(e) => setCalcIncome(fmtMoneyInput(e.target.value))} placeholder="RD$ 85,000" />
                <div className="range-labels"><span>Para estimar cuánto puedes financiar</span></div>
              </div>
            </div>

            <div className="calc-note">
              <FileCheck size={16} />
              <span>Estos valores son estimados y pueden variar según el perfil y la entidad financiera.</span>
            </div>
          </div>

          <aside className="payment-card">
            <div className="payment-label">Cuota estimada</div>
            <div className="payment-amount">{fmtRD(calcMonthly)}<span>/mes</span></div>
            <div className="payment-rate">Tasa referencial desde {calcApr.toFixed(2)}%</div>
            <div className="payment-breakdown">
              <div><span>Precio del vehículo</span><strong>{fmtRD(calcPrice)}</strong></div>
              <div><span>Inicial ({calcDownPct}%)</span><strong>- {fmtRD(calcDown)}</strong></div>
              <div><span>Monto a financiar</span><strong>{fmtRD(calcPrincipal)}</strong></div>
              <div><span>Plazo</span><strong>{calcTerm} meses</strong></div>
              <div><span>Cuota estimada</span><strong>{fmtRD(calcMonthly)}/mes</strong></div>
            </div>
            <div style={{ borderTop: '1px solid var(--line)', margin: '14px 0', paddingTop: 14 }}>
              <div className="payment-label" style={{ marginBottom: 2 }}>Con tu salario podrías financiar hasta</div>
              {afford.price > 0 ? (
                <>
                  <div className="payment-amount" style={{ fontSize: 24 }}>{fmtRD(afford.price)}</div>
                  <Link to={`/buscar?precioMax=${afford.price}`} className="btn btn-outline btn-block btn-sm" style={{ marginTop: 10 }}>Ver carros hasta {fmtRD(afford.price)}</Link>
                </>
              ) : (
                <div className="small" style={{ color: 'var(--muted)', marginTop: 4 }}>Ingresa tu salario mensual arriba para calcularlo.</div>
              )}
            </div>
            <Link to={preapLink} className="btn btn-primary btn-block">Solicitar pre-aprobación</Link>
          </aside>

          <div className="finance-proof">
            <ProofItem icon={IdCard} title="KYC con cédula" text="Validación de identidad y prueba de vida." />
            <ProofItem icon={FileCheck} title="Autorización crediticia" text="Consentimiento para que el banco consulte crédito." />
            <ProofItem icon={Landmark} title="Banco responde" text="El banco evalúa tu solicitud y te responde." />
          </div>

          <div className="finance-safe-note">
            <span><LockKeyhole size={24} /></span>
            <div>
              <strong>Tus datos están protegidos</strong>
              <p>Utilizamos estándares de seguridad y privacidad para proteger tu información.</p>
            </div>
          </div>
        </section>

        {/* ---------------- Results row ---------------- */}
        <div className="results-strip">
          <span>{loading ? 'Cargando inventario…' : <><strong>{list.length.toLocaleString('es-DO')}</strong> vehículos disponibles</>}</span>
          <label className="results-sort">Ordenar por:
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="relevancia">Más relevantes</option>
              <option value="menor">Menor precio</option>
              <option value="mayor">Mayor precio</option>
              <option value="nuevo">Año más reciente</option>
            </select>
          </label>
        </div>

        <section className="featured-panel" id="vehiculos-destacados">
          <div className="section-title">
            <h2>Vehículos destacados</h2>
            <Link to="/buscar" className="link-teal">Ver todos <ArrowRight size={15} /></Link>
          </div>

          {loading ? (
            <div className="grid grid-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="vcard" style={{ height: 320, background: 'var(--surface-2)' }} />)}</div>
          ) : list.length === 0 ? (
            <div className="card card-pad muted" style={{ textAlign: 'center', boxShadow: 'none' }}>Sin resultados. <button className="link-teal" onClick={resetFilters}>Limpiar filtros</button></div>
          ) : (
            <div className="grid grid-4">{featuredList.map((v) => <VehicleCard key={v.id} v={v} />)}</div>
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
            <Link to="/buscar" className="link-teal">Ver dealers <ArrowRight size={15} /></Link>
          </div>
          <div className="dealer-grid">
            {VERIFIED_DEALERS.map((dealer) => <DealerCard key={dealer.name} dealer={dealer} />)}
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

function ProofItem({ icon: Icon, title, text }) {
  return (
    <div className="proof-item">
      <span><Icon size={20} /></span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  )
}

function RecentCard({ v }) {
  const { open } = useFicha()
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
  return (
    <article className="dealer-card">
      <div className="dealer-mark">{dealer.initials}</div>
      <div className="dealer-main">
        <div className="dealer-name">
          <strong>{dealer.name}</strong>
          <BadgeCheck size={16} />
        </div>
        <span><MapPin size={13} /> {dealer.location}</span>
        <p>{dealer.inventory} vehículos</p>
        <div className="dealer-badges">
          <span className="chip chip-teal"><ShieldCheck size={13} /> Dealer verificado</span>
          <span className="chip chip-teal"><Landmark size={13} /> Financiamiento disponible</span>
        </div>
      </div>
    </article>
  )
}
