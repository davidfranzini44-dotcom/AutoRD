// Shared option lists for vehicle forms (post + dealer inventory edit).
export const BRANDS = [
  'Toyota', 'Honda', 'Hyundai', 'Kia', 'Nissan', 'Mazda', 'Mitsubishi', 'Ford',
  'Chevrolet', 'Volkswagen', 'Lexus', 'Mercedes-Benz', 'BMW', 'Audi', 'Suzuki',
  'Jeep', 'Land Rover', 'Porsche', 'Subaru', 'Peugeot',
]
export const YEARS = Array.from({ length: 2027 - 2004 + 1 }, (_, i) => 2027 - i)
export const TRANSMISSIONS = ['Automática', 'Manual']
export const FUELS = ['Gasolina', 'Diésel', 'Híbrido', 'Eléctrico', 'Gas (GLP)']
export const COLORS = ['Blanco', 'Negro', 'Gris', 'Plata', 'Rojo', 'Azul', 'Verde', 'Beige', 'Marrón', 'Dorado', 'Naranja', 'Amarillo']
export const CONDITIONS = [
  { v: 'nuevo', l: 'Nuevo' },
  { v: 'usado', l: 'Usado' },
  { v: 'certificado', l: 'Usado certificado' },
]

// Equipment / accesorios (mirrors supercarros' list) — saved to vehicles.features.
export const ACCESSORIES = [
  'Alarma', 'Bolsa de aire (chofer)', 'Bolsa de aire (laterales)', 'Bolsa de aire (pasajero)',
  'Frenos ABS', 'Seguros eléctricos', 'Sensores de parqueo', '3 filas de asientos',
  'Aire acondicionado digital', 'Aire acondicionado doble', 'Apple CarPlay', 'Asientos eléctricos',
  'Baúl eléctrico', 'Bluetooth', 'Calefacción', 'Cámara de reversa', 'CD box', 'Cruise control',
  'DVD', 'Guía hidráulico', 'Guía multifunción', 'Limpia vidrios traseros', 'Llave inteligente',
  'Pintura de fábrica', 'Radio AM/FM', 'Radio Multimedia', 'Retrovisores eléctricos',
  'Sistema de navegación', 'Sonido profesional', 'Sun roof', 'Vidrios eléctricos',
  'Versión americana', 'Aros de fábrica', 'Aros de magnesio',
]
