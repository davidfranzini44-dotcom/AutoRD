// ============================================================
// AutoRD — local demo data (no backend)
// ============================================================

export const fmtRD = (n) =>
  'RD$ ' + Number(n).toLocaleString('es-DO', { maximumFractionDigits: 0 })

// Currency-aware price formatter — dealers list in DOP (RD$) or USD (US$).
export const fmtMoney = (n, currency = 'DOP') =>
  (currency === 'USD' ? 'US$ ' : 'RD$ ') + Number(n || 0).toLocaleString('es-DO', { maximumFractionDigits: 0 })

export const banks = [
  { id: 'popular', name: 'Banco Popular', color: '#1a3a6b', initials: 'BP' },
  { id: 'banreservas', name: 'Banreservas', color: '#0f766e', initials: 'BR' },
  { id: 'bhd', name: 'BHD', color: '#12805c', initials: 'BHD' },
  { id: 'scotiabank', name: 'Scotiabank', color: '#c8352b', initials: 'SC' },
]

const photoSet = (folder, prefix, count) =>
  Array.from({ length: count }, (_, i) => `/vehicle-photos/joselito/${folder}/${prefix}-${String(i + 1).padStart(2, '0')}.jpg`)

const JOSELITO_PHOTOS = {
  rx: photoSet('lexus-rx-350-f-sport-2022', 'rx', 12),
  grandHighlander: photoSet('toyota-grand-highlander-2024', 'grand-highlander', 12),
  lx: photoSet('lexus-lx-600-luxury-2024', 'lx', 11),
}

export const vehicles = [
  {
    id: 'honda-crv-2021',
    make: 'Honda', model: 'CR-V', year: 2019,
    trim: 'EX', transmission: 'Automática', fuel: 'Gasolina', engine: '2.4L', drivetrain: '4x2',
    mileage: 45000, color: 'Gris', bodyType: 'SUV',
    price: 1250000, condition: 'Usado', certified: true,
    location: 'Santo Domingo', dealer: 'Auto América', dealerVerified: true,
    financing: true, tone: '#4b5563',
    monthly: 28400, downPct: 20, apr: 9.5, termYears: 7,
    photos: 24,
    description:
      'Honda CR-V EX-L 2021 en excelentes condiciones. Mantenimientos al día. Versión full con asientos en cuero, sunroof, cámara de retroceso y más.',
    features: ['Asientos en cuero', 'Sunroof', 'Cámara de retroceso', 'CarPlay / Android Auto', 'Sensores de parqueo', 'Llave inteligente'],
  },
  {
    id: 'toyota-rav4-2020',
    make: 'Toyota', model: 'RAV4', year: 2020,
    trim: 'XLE', transmission: 'Automática', fuel: 'Gasolina', engine: '2.5L', drivetrain: '4x4',
    mileage: 36500, color: 'Blanco', bodyType: 'SUV',
    price: 1850000, condition: 'Usado', certified: true,
    location: 'Santo Domingo', dealer: 'Top Auto RD', dealerVerified: true,
    financing: true, tone: '#e2e8f0',
    monthly: 42000, downPct: 20, apr: 9.75, termYears: 7,
    photos: 18,
    description:
      'Toyota RAV4 XLE 2020, un solo dueño, importada. Ideal para familia. Muy económica y confiable, lista para financiamiento.',
    features: ['Pantalla táctil', 'Cámara de retroceso', 'Control de crucero', 'Bluetooth', 'Rines de aleación', 'Faros LED'],
  },
  {
    id: 'kia-sportage-2024',
    make: 'Kia', model: 'Sportage', year: 2024,
    trim: 'LX', transmission: 'Automática', fuel: 'Gasolina', engine: '2.0L', drivetrain: '4x2',
    mileage: 0, color: 'Gris grafito', bodyType: 'SUV',
    price: 2150000, condition: 'Nuevo', certified: false,
    location: 'Santo Domingo', dealer: 'Autoimport SRL', dealerVerified: true,
    financing: true, tone: '#334155',
    monthly: 48900, downPct: 20, apr: 8.95, termYears: 7,
    photos: 30,
    description:
      'Kia Sportage 2024 nueva, cero kilómetros, garantía de agencia. Diseño moderno, tecnología de asistencia al conductor y gran eficiencia.',
    features: ['0 km garantía', 'Pantalla panorámica', 'Asistente de carril', 'Climatizador', 'Arranque por botón', 'Apple CarPlay'],
  },
  {
    id: 'mazda-cx5-2018',
    make: 'Mazda', model: 'CX-5', year: 2018,
    trim: 'Touring', transmission: 'Automática', fuel: 'Gasolina', engine: '2.5L',
    mileage: 68000, color: 'Blanco perla', bodyType: 'SUV',
    price: 1040000, condition: 'Usado', certified: false,
    location: 'Santo Domingo', dealer: 'Top Auto RD', dealerVerified: true,
    financing: true, tone: '#f1f5f9',
    monthly: 23600, downPct: 20, apr: 10.25, termYears: 6,
    photos: 15,
    description:
      'Mazda CX-5 Touring 2018 muy cuidada, interior impecable. Excelente relación precio-calidad, apta para financiamiento con inicial baja.',
    features: ['Cuero y tela', 'Cámara de retroceso', 'Sensores traseros', 'Bluetooth', 'Cruise control', 'Rines de aleación'],
  },
  {
    id: 'hyundai-tucson-2022',
    make: 'Hyundai', model: 'Tucson', year: 2022,
    trim: 'Limited', transmission: 'Automática', fuel: 'Gasolina', engine: '2.0L',
    mileage: 21000, color: 'Negro', bodyType: 'SUV',
    price: 1980000, condition: 'Usado', certified: true,
    location: 'Santo Domingo', dealer: 'Auto América', dealerVerified: true,
    financing: true, tone: '#1f2937',
    monthly: 44200, downPct: 20, apr: 9.25, termYears: 7,
    photos: 20,
    description:
      'Hyundai Tucson Limited 2022 full equipo, poco uso, como nueva. Tecnología de punta y excelente confort para la ciudad.',
    features: ['Techo panorámico', 'Asientos ventilados', 'Pantalla digital', 'Cámara 360', 'Carga inalámbrica', 'Keyless'],
  },
  {
    id: 'nissan-sentra-2021',
    make: 'Nissan', model: 'Sentra', year: 2021,
    trim: 'SR', transmission: 'Automática', fuel: 'Gasolina', engine: '2.0L',
    mileage: 39000, color: 'Rojo', bodyType: 'Sedán',
    price: 890000, condition: 'Usado', certified: false,
    location: 'Santiago', dealer: 'Autoimport SRL', dealerVerified: false,
    financing: true, tone: '#991b1b',
    monthly: 20100, downPct: 20, apr: 10.5, termYears: 6,
    photos: 16,
    description:
      'Nissan Sentra SR 2021 deportivo, muy económico en combustible. Ideal como primer vehículo financiado.',
    features: ['Pantalla táctil', 'Cámara de retroceso', 'Rines deportivos', 'Bluetooth', 'Modo Sport', 'Faros LED'],
  },
  {
    id: 'toyota-corolla-2022', make: 'Toyota', model: 'Corolla', year: 2022,
    trim: 'LE', transmission: 'Automática', fuel: 'Gasolina', engine: '1.8L',
    mileage: 28000, color: 'Plata', bodyType: 'Sedán',
    price: 1180000, condition: 'Usado', certified: true,
    location: 'Santo Domingo', dealer: 'Auto América', dealerVerified: true,
    financing: true, tone: '#94a3b8', monthly: 26300, downPct: 20, apr: 9.5, termYears: 7, photos: 19,
    description: 'Toyota Corolla LE 2022, súper económico y confiable. Ideal para ciudad, bajo consumo de combustible.',
    features: ['Pantalla táctil', 'CarPlay', 'Cámara de retroceso', 'Control de crucero', 'Sensores', 'Faros LED'],
  },
  {
    id: 'honda-civic-2020', make: 'Honda', model: 'Civic', year: 2020,
    trim: 'Sport', transmission: 'Automática', fuel: 'Gasolina', engine: '2.0L',
    mileage: 45000, color: 'Negro', bodyType: 'Sedán',
    price: 1090000, condition: 'Usado', certified: false,
    location: 'Santiago', dealer: 'Top Auto RD', dealerVerified: true,
    financing: true, tone: '#1f2937', monthly: 24500, downPct: 20, apr: 9.9, termYears: 7, photos: 17,
    description: 'Honda Civic Sport 2020, deportivo y eficiente. Rines de fábrica, pantalla multimedia.',
    features: ['Modo Sport', 'Pantalla táctil', 'Cámara de retroceso', 'Bluetooth', 'Rines de aleación', 'Keyless'],
  },
  {
    id: 'hyundai-santafe-2021', make: 'Hyundai', model: 'Santa Fe', year: 2021,
    trim: 'Limited', transmission: 'Automática', fuel: 'Gasolina', engine: '2.5L',
    mileage: 33000, color: 'Blanco', bodyType: 'SUV',
    price: 1890000, condition: 'Usado', certified: true,
    location: 'La Romana', dealer: 'Autoimport SRL', dealerVerified: true,
    financing: true, tone: '#e2e8f0', monthly: 42100, downPct: 20, apr: 9.25, termYears: 7, photos: 22,
    description: 'Hyundai Santa Fe Limited 2021, 3 filas de asientos, ideal para familia grande. Full equipo.',
    features: ['3 filas', 'Asientos en piel', 'Techo panorámico', 'Cámara 360', 'Pantalla digital', 'Keyless'],
  },
  {
    id: 'ford-ranger-2023', make: 'Ford', model: 'Ranger', year: 2023,
    trim: 'XLT', transmission: 'Automática', fuel: 'Diésel', engine: '2.0L Turbo',
    mileage: 19000, color: 'Azul', bodyType: 'Pickup',
    price: 2280000, condition: 'Usado', certified: true,
    location: 'Santiago', dealer: 'Top Auto RD', dealerVerified: true,
    financing: true, tone: '#1e3a5f', monthly: 50800, downPct: 20, apr: 9.0, termYears: 7, photos: 26,
    description: 'Ford Ranger XLT 2023 diésel, doble cabina 4x4. Poco uso, ideal para trabajo y aventura.',
    features: ['4x4', 'Doble cabina', 'Pantalla táctil', 'Cámara de retroceso', 'Control de descenso', 'Faros LED'],
  },
  {
    id: 'kia-picanto-2021', make: 'Kia', model: 'Picanto', year: 2021,
    trim: 'LX', transmission: 'Manual', fuel: 'Gasolina', engine: '1.2L',
    mileage: 31000, color: 'Rojo', bodyType: 'Hatchback',
    price: 690000, condition: 'Usado', certified: false,
    location: 'Santo Domingo', dealer: 'Auto América', dealerVerified: true,
    financing: true, tone: '#b91c1c', monthly: 15600, downPct: 20, apr: 10.75, termYears: 6, photos: 14,
    description: 'Kia Picanto LX 2021, compacto y muy económico. Perfecto para ciudad y primer carro.',
    features: ['Pantalla táctil', 'Bluetooth', 'Cámara de retroceso', 'Aire acondicionado', 'USB', 'Rines'],
  },
  {
    id: 'toyota-hilux-2022', make: 'Toyota', model: 'Hilux', year: 2022,
    trim: 'SR', transmission: 'Automática', fuel: 'Diésel', engine: '2.4L Turbo',
    mileage: 41000, color: 'Gris', bodyType: 'Pickup',
    price: 2450000, condition: 'Usado', certified: true,
    location: 'Santiago', dealer: 'Autoimport SRL', dealerVerified: true,
    financing: true, tone: '#4b5563', monthly: 54600, downPct: 20, apr: 8.95, termYears: 7, photos: 28,
    description: 'Toyota Hilux SR 2022 diésel 4x4, la pickup más confiable. Excelente para trabajo pesado.',
    features: ['4x4', 'Doble cabina', 'Cámara de retroceso', 'Pantalla táctil', 'Control de tracción', 'Bluetooth'],
  },
  {
    id: 'lexus-rx-350-f-sport-2022-joselito', make: 'Lexus', model: 'RX', year: 2022,
    trim: '350 F Sport', transmission: 'Automática', fuel: 'Gasolina', engine: '6 cilindros',
    drivetrain: 'AWD', mileage: 0, color: 'Blanco', bodyType: 'SUV',
    price: 3570000, condition: 'Usado', certified: false,
    location: 'Santiago', dealer: 'Joselito Auto Import', dealerVerified: true,
    dealerSlug: 'joselito-auto-import', dealerWhatsapp: '18095015858', dealerPhone: '18097249999',
    lat: 19.4517, lng: -70.6970,
    financing: true, tone: '#f8fafc', monthly: 74700, downPct: 20, apr: 9.75, termYears: 7, photos: JOSELITO_PHOTOS.rx.length,
    coverPhoto: JOSELITO_PHOTOS.rx[0], photoUrls: JOSELITO_PHOTOS.rx,
    description: 'Lexus RX 350 F Sport 2022 en blanco con interior rojo, tracción AWD y equipamiento premium. Precio convertido desde US$ 59,500.',
    features: ['AWD', 'Apple CarPlay', 'Asientos en piel', 'Cámara de reversa', 'Sensores de parqueo', 'Sistema de navegación'],
  },
  {
    id: 'toyota-grand-highlander-platinum-hybrid-2024-joselito', make: 'Toyota', model: 'Grand Highlander', year: 2024,
    trim: 'Max Platinum Hybrid', transmission: 'Automática', fuel: 'Híbrido', engine: '4 cilindros híbrido',
    drivetrain: '4WD', mileage: 0, color: 'Blanco perla', bodyType: 'SUV',
    price: 5130000, condition: 'Usado', certified: false,
    location: 'Santiago', dealer: 'Joselito Auto Import', dealerVerified: true,
    dealerSlug: 'joselito-auto-import', dealerWhatsapp: '18095015858', dealerPhone: '18097249999',
    lat: 19.4517, lng: -70.6970,
    financing: true, tone: '#e5e7eb', monthly: 107300, downPct: 20, apr: 9.75, termYears: 7, photos: JOSELITO_PHOTOS.grandHighlander.length,
    coverPhoto: JOSELITO_PHOTOS.grandHighlander[0], photoUrls: JOSELITO_PHOTOS.grandHighlander,
    description: 'Toyota Grand Highlander Max Platinum Hybrid 2024, 4WD, tres filas y cabina premium en negro. Precio convertido desde US$ 85,500.',
    features: ['4WD', 'Híbrido', '3 filas', 'Asientos en piel', 'Techo panorámico', 'Sistema de navegación'],
  },
  {
    id: 'lexus-lx-600-luxury-2024-joselito', make: 'Lexus', model: 'LX', year: 2024,
    trim: '600 Luxury', transmission: 'Automática', fuel: 'Gasolina', engine: '6 cilindros',
    drivetrain: '4WD', mileage: 0, color: 'Blanco perla', bodyType: 'SUV',
    price: 9600000, condition: 'Usado', certified: false,
    location: 'Santiago', dealer: 'Joselito Auto Import', dealerVerified: true,
    dealerSlug: 'joselito-auto-import', dealerWhatsapp: '18095015858', dealerPhone: '18097249999',
    lat: 19.4517, lng: -70.6970,
    financing: true, tone: '#eef2f7', monthly: 200800, downPct: 20, apr: 9.75, termYears: 7, photos: JOSELITO_PHOTOS.lx.length,
    coverPhoto: JOSELITO_PHOTOS.lx[0], photoUrls: JOSELITO_PHOTOS.lx,
    description: 'Lexus LX 600 Luxury 2024, 4WD, tres filas, interior negro y paquete de lujo. Precio convertido desde US$ 160,000.',
    features: ['4WD', '3 filas', 'Apple CarPlay', 'Asientos en piel', 'Cámara de reversa', 'Sistema de navegación'],
  },
]

export const getVehicle = (id) => vehicles.find((v) => v.id === id)

// Customer financing status (demo)
export const financingCase = {
  vehicle: vehicles[0],
  requestedAmount: 1000000,
  down: 250000,
  term: 7,
  timeline: [
    { key: 'kyc', name: 'KYC aprobado', sub: 'Identidad verificada · 12 jul 2026', state: 'done' },
    { key: 'consent', name: 'Consentimiento firmado', sub: 'Autorización de consulta crediticia', state: 'done' },
    { key: 'sent', name: 'Solicitud enviada a bancos', sub: '4 bancos seleccionados', state: 'done' },
    { key: 'eval', name: 'Bancos evaluando', sub: 'Los bancos revisan tu solicitud', state: 'current' },
    { key: 'offers', name: 'Ofertas recibidas', sub: '1 oferta disponible', state: 'current' },
  ],
  responses: [
    {
      bankId: 'bhd', status: 'offer', label: 'Oferta recibida · Pre-aprobado',
      apr: 9.25, term: 7, down: 250000, monthly: 27950, note: 'Sujeto a verificación de ingresos.',
    },
    {
      bankId: 'banreservas', status: 'evaluating', label: 'En evaluación',
      note: 'Tu solicitud está siendo revisada por el comité de crédito.',
    },
    {
      bankId: 'popular', status: 'pending', label: 'Pendiente',
      note: 'Aún no ha iniciado la evaluación.',
    },
    {
      bankId: 'scotiabank', status: 'docs', label: 'Pendiente documentos',
      note: 'El banco solicita comprobante de ingresos para continuar.',
    },
  ],
}

// Dealer panel
export const dealerMetrics = [
  { icon: 'inventory', value: 128, label: 'Inventario activo' },
  { icon: 'leads', value: 24, label: 'Leads este mes' },
  { icon: 'finance', value: 18, label: 'Solicitudes de financiamiento' },
  { icon: 'approved', value: 8, label: 'Compradores aprobados' },
  { icon: 'sales', value: 15, label: 'Ventas potenciales' },
]

export const dealerInventory = [
  { id: 'honda-crv-2021', vehicle: 'Honda CR-V 2021', price: 1250000, status: 'Publicado', views: 1240, leads: 6, requests: 3 },
  { id: 'toyota-rav4-2020', vehicle: 'Toyota RAV4 2020', price: 1650000, status: 'Publicado', views: 980, leads: 4, requests: 2 },
  { id: 'kia-sportage-2024', vehicle: 'Kia Sportage 2024', price: 2150000, status: 'Publicado', views: 1520, leads: 9, requests: 5 },
  { id: 'mazda-cx5-2018', vehicle: 'Mazda CX-5 2018', price: 1040000, status: 'Reservado', views: 640, leads: 3, requests: 1 },
  { id: 'hyundai-tucson-2022', vehicle: 'Hyundai Tucson 2022', price: 1980000, status: 'Publicado', views: 720, leads: 2, requests: 1 },
]

export const dealerLeads = [
  { customer: 'Juan Pérez', vehicle: 'Toyota RAV4 2020', amount: 1650000, kyc: 'aprobado', bank: 'evaluating', salesperson: 'María R.' },
  { customer: 'María García', vehicle: 'Honda CR-V 2021', amount: 1250000, kyc: 'aprobado', bank: 'pending', salesperson: 'Sin asignar' },
  { customer: 'Carlos Jiménez', vehicle: 'Kia Sportage 2024', amount: 2150000, kyc: 'aprobado', bank: 'offer', salesperson: 'Pedro M.' },
  { customer: 'Ana Reyes', vehicle: 'Mazda CX-5 2018', amount: 1040000, kyc: 'pendiente', bank: 'pending', salesperson: 'Sin asignar' },
  { customer: 'Luis Then', vehicle: 'Hyundai Tucson 2022', amount: 1980000, kyc: 'aprobado', bank: 'docs', salesperson: 'María R.' },
]

// Bank panel
export const bankMetrics = [
  { icon: 'new', value: 12, label: 'Nuevas hoy' },
  { icon: 'eval', value: 18, label: 'En evaluación' },
  { icon: 'docs', value: 5, label: 'Pendiente documentos' },
  { icon: 'approved', value: 22, label: 'Pre-aprobadas' },
]

export const bankApplications = [
  { id: 'AP-2041', customer: 'Juan Pérez', cedula: '402-1234567-8', vehicle: 'Toyota RAV4 2020', dealer: 'Top Auto RD', amount: 1650000, down: 330000, term: 7, income: 95000, employment: 'Asalariado', kyc: 'aprobado', consent: true, status: 'nueva' },
  { id: 'AP-2038', customer: 'María García', cedula: '001-9876543-2', vehicle: 'Honda CR-V 2021', dealer: 'Auto América', amount: 1250000, down: 250000, term: 6, income: 78000, employment: 'Asalariado', kyc: 'aprobado', consent: true, status: 'evaluando' },
  { id: 'AP-2035', customer: 'Carlos Jiménez', cedula: '031-4455667-1', vehicle: 'Kia Sportage 2024', dealer: 'Autoimport SRL', amount: 2150000, down: 430000, term: 7, income: 140000, employment: 'Negocio propio', kyc: 'aprobado', consent: true, status: 'preaprobada' },
  { id: 'AP-2030', customer: 'Luis Then', cedula: '402-7788990-4', vehicle: 'Hyundai Tucson 2022', dealer: 'Auto América', amount: 1980000, down: 396000, term: 7, income: 62000, employment: 'Asalariado', kyc: 'aprobado', consent: true, status: 'docs' },
  { id: 'AP-2022', customer: 'Ana Reyes', cedula: '001-2233445-9', vehicle: 'Mazda CX-5 2018', dealer: 'Top Auto RD', amount: 1040000, down: 156000, term: 6, income: 54000, employment: 'Independiente', kyc: 'aprobado', consent: true, status: 'rechazada' },
]

export const bankStatusMeta = {
  nueva: { label: 'Nueva', chip: 'chip-blue' },
  evaluando: { label: 'En evaluación', chip: 'chip-amber' },
  docs: { label: 'Pendiente documentos', chip: 'chip-amber' },
  preaprobada: { label: 'Pre-aprobada', chip: 'chip-green' },
  rechazada: { label: 'Rechazada', chip: 'chip-red' },
}
