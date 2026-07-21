function median(values) {
  const nums = values.map(Number).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (!nums.length) return 0
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function sameSegment(vehicle, peer) {
  if (!vehicle?.bodyType || !peer?.bodyType || vehicle.bodyType !== peer.bodyType) return false
  if (vehicle.condition === 'Nuevo') return peer.condition === 'Nuevo'
  return peer.condition !== 'Nuevo'
}

export function buildPriceInsight(vehicle, vehicles = []) {
  const price = Number(vehicle?.price || 0)
  if (!vehicle || !price) return null

  const peers = vehicles.filter((peer) => peer?.id !== vehicle.id && Number(peer.price || 0) > 0)
  let segment = peers.filter((peer) => sameSegment(vehicle, peer))
  if (segment.length < 2) segment = peers.filter((peer) => peer.bodyType === vehicle.bodyType)
  if (segment.length < 2) segment = peers
  if (segment.length < 2) return null

  let reference = median(segment.map((peer) => peer.price))
  const segmentYear = median(segment.map((peer) => peer.year))
  const vehicleYear = Number(vehicle.year || 0)
  if (segmentYear && vehicleYear) {
    reference *= 1 + clamp((vehicleYear - segmentYear) * 0.035, -0.18, 0.18)
  }

  const segmentMileage = median(segment.map((peer) => peer.mileage))
  const vehicleMileage = Number(vehicle.mileage || 0)
  if (segmentMileage && vehicleMileage >= 0) {
    reference *= 1 + clamp((segmentMileage - vehicleMileage) / 500000, -0.1, 0.1)
  }
  if (vehicle.certified) reference *= 1.03

  const marketPrice = Math.round(reference / 50000) * 50000
  const delta = (price - marketPrice) / marketPrice
  if (delta <= -0.08) {
    return { tone: 'good', label: 'Buen precio', summary: 'Bajo la referencia local', marketPrice, delta }
  }
  if (delta <= 0.06) {
    return { tone: 'fair', label: 'Precio justo', summary: 'En rango del mercado', marketPrice, delta }
  }
  return { tone: 'review', label: 'Ver referencia', summary: 'Sobre la referencia local', marketPrice, delta }
}

export function withPriceInsights(vehicles = []) {
  return vehicles.map((vehicle) => ({
    ...vehicle,
    priceInsight: buildPriceInsight(vehicle, vehicles),
  }))
}
