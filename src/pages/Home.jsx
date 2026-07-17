import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Car, BadgeCheck, ShieldCheck, ArrowRight, ChevronRight,
  Clock, MonitorSmartphone, Landmark, Smartphone, Check,
  MonitorSmartphone as Monitor, Calculator, FileCheck, LockKeyhole,
  IdCard, Store, Headphones, Building2,
} from 'lucide-react'
import VehicleCard from '../components/VehicleCard'
import CarImage from '../components/CarImage'
import BankLogo from '../components/BankLogo'
import bodyConvertibles from '../assets/body-types/convertibles.png'
import bodyCoupes from '../assets/body-types/coupes.png'
import bodyHatchbacks from '../assets/body-types/hatchbacks.png'
import bodyMinivans from '../assets/body-types/minivans.png'
import bodySedans from '../assets/body-types/sedans.png'
import bodyStationWagons from '../assets/body-types/station-wagons.png'
import bodySuvs from '../assets/body-types/suvs.png'
import bodyTrucks from '../assets/body-types/trucks.png'
import { listVehicles } from '../data/api'
import { fmtRD } from '../data/demo'

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
const BANK_BOXES = [
  { slug: 'popular', name: 'Banco Popular' },
  { slug: 'bhd', name: 'Banco BHD' },
  { slug: 'banreservas', name: 'Banreservas' },
  { slug: 'scotiabank', name: 'Scotiabank' },
]
const BODY_TYPES = [
  { type: 'SUV', label: 'SUVs', image: bodySuvs },
  { type: 'Pickup', label: 'Camionetas', image: bodyTrucks },
  { type: 'Sedán', label: 'Sedanes', image: bodySedans },
  { type: 'Coupé', label: 'Coupés', image: bodyCoupes },
  { type: 'Minivan', label: 'Minivans', image: bodyMinivans },
  { type: 'Hatchback', label: 'Hatchbacks', image: bodyHatchbacks },
  { type: 'Convertible', label: 'Convertibles', image: bodyConvertibles },
  { type: 'Wagon', label: 'Familiares', image: bodyStationWagons },
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
const BANK_RATES = { popular: 9.75, bhd: 9.5, banreservas: 9.95, scotiabank: 10.25 }

const estimateMonthly = (principal, apr, months) => {
  const rate = apr / 100 / 12
  if (!principal || !months) return 0
  if (!rate) return Math.round(principal / months)
  return Math.round((principal * rate) / (1 - Math.pow(1 + rate, -months)))
}

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
  const [calcBank, setCalcBank] = useState('popular')

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
  const calcApr = BANK_RATES[calcBank] || BANK_RATES.popular
  const calcDown = Math.round(calcPrice * (calcDownPct / 100))
  const calcPrincipal = Math.max(0, calcPrice - calcDown)
  const calcMonthly = estimateMonthly(calcPrincipal, calcApr, calcTerm)

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
              <button
                key={b.type}
                className={`bt-item ${tipo === b.type ? 'active' : ''}`}
                onClick={() => {
                  const next = tipo === b.type ? 'todos' : b.type
                  setTipo(next)
                  // Browse-by-type shows all of that type: broaden the other filters.
                  if (next !== 'todos') { setUbicacion(''); setPrecioMax(''); setAnioRange(''); setSegment('todos') }
                  runSearch()
                }}
              >
                <img className="bt-image" src={b.image} alt="" aria-hidden="true" />
                <span className="bt-label">{b.label}</span>
              </button>
            ))}
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
            <div className="grid grid-4">{list.map((v) => <VehicleCard key={v.id} v={v} />)}</div>
          )}
        </section>

        {/* ---------------- Trust strip ---------------- */}
        <div className="trust-strip" style={{ marginTop: 22 }}>
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

        {/* ---------------- Financing banner ---------------- */}
        <div className="fin-banner-lt" style={{ marginTop: 22 }}>
          <div className="fin-illus" aria-hidden="true">
            <div className="fi-phone"><Smartphone size={22} /></div>
            <div className="fi-shield"><Check size={20} strokeWidth={3.5} /></div>
          </div>
          <div>
            <h3>Financiamiento seguro, rápido y transparente</h3>
            <p>Nuestro proceso 100% digital te conecta con los mejores bancos de la República Dominicana.</p>
          </div>
          <div className="banks-boxes">
            {BANK_BOXES.map((b) => <span key={b.slug} className="bank-box" title={b.name}><BankLogo slug={b.slug} name={b.name} size={b.slug === 'bhd' ? 30 : 21} /></span>)}
            <Link to="/como-funciona" className="link-teal">Ver todos los bancos <ChevronRight size={14} /></Link>
          </div>
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
