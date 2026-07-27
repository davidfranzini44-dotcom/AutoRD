// The 31 provincias of the Dominican Republic plus the Distrito Nacional.
// Used for the client's declared address and for the bank's own record of it —
// a free-text address alone can never be grouped or filtered by region.
export const PROVINCIAS = [
  'Azua', 'Bahoruco', 'Barahona', 'Dajabón', 'Distrito Nacional', 'Duarte',
  'El Seibo', 'Elías Piña', 'Espaillat', 'Hato Mayor', 'Hermanas Mirabal',
  'Independencia', 'La Altagracia', 'La Romana', 'La Vega',
  'María Trinidad Sánchez', 'Monseñor Nouel', 'Monte Cristi', 'Monte Plata',
  'Pedernales', 'Peravia', 'Puerto Plata', 'Samaná', 'San Cristóbal',
  'San José de Ocoa', 'San Juan', 'San Pedro de Macorís', 'Sánchez Ramírez',
  'Santiago', 'Santiago Rodríguez', 'Santo Domingo', 'Valverde',
]

// Full address for display: "Calle Duarte 45, Gazcue" + "Distrito Nacional".
export function formatAddress(addressLine, provincia) {
  return [addressLine, provincia].map((s) => (s || '').trim()).filter(Boolean).join(', ') || null
}
