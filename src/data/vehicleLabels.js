export function mileageLabel(vehicle, { newText = '0 km (nuevo)' } = {}) {
  const mileage = Number(vehicle?.mileage)
  if (!Number.isFinite(mileage) || mileage <= 0) {
    return vehicle?.condition === 'Nuevo' ? newText : 'Millaje N/D'
  }
  return `${mileage.toLocaleString('es-DO')} km`
}
