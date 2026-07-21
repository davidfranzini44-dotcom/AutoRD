function vehicleUrl(vehicle) {
  const id = typeof vehicle === 'string' ? vehicle : vehicle?.id
  if (!id) return window.location.href
  return `${window.location.origin}/vehiculo/${id}`
}

function vehicleTitle(vehicle) {
  if (!vehicle || typeof vehicle === 'string') return 'AutoRD'
  return `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.year || ''}`.trim() || 'AutoRD'
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }
  const node = document.createElement('textarea')
  node.value = text
  node.setAttribute('readonly', '')
  node.style.position = 'fixed'
  node.style.opacity = '0'
  document.body.appendChild(node)
  node.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(node)
  return copied
}

export async function shareVehicle(vehicle) {
  const url = vehicleUrl(vehicle)
  const title = vehicleTitle(vehicle)
  if (navigator.share) {
    try {
      await navigator.share({ title, text: `Mira este vehiculo en AutoRD: ${title}`, url })
      return 'shared'
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled'
    }
  }
  await copyText(url)
  return 'copied'
}
