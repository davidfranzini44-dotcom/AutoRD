// The WhatsApp messages AutoRD sends, in one place.
//
// Before this, message text was assembled inline at five call sites
// (AdminPanel, BankPanel, DealerFinancing, DealerLeads...), so the wording a
// client received depended on which screen happened to send it and there was no
// way to review what the platform actually says.
//
// Two rules the render function enforces rather than trusts:
//   * an unknown template throws instead of returning '' — queueing an empty
//     body would send a blank WhatsApp to a real person.
//   * a missing variable throws instead of interpolating undefined — "Hola
//     undefined" is worse than no message at all.
// Both are cheap to get wrong and impossible to take back once sent.

const req = (...names) => names

export const WA_TEMPLATES = {
  solicitud_recibida: {
    label: 'Solicitud recibida',
    vars: req('cliente'),
    render: (v) => `Hola ${v.cliente}, recibimos tu solicitud de financiamiento en AutoRD. La enviamos a los bancos que autorizaste y te avisamos por aquí en cuanto respondan.`,
  },
  solicitud_en_revision: {
    label: 'Solicitud en revisión',
    vars: req('cliente', 'banco'),
    render: (v) => `Hola ${v.cliente}, ${v.banco} está revisando tu solicitud de financiamiento. Normalmente responden en 1 a 3 días laborables.`,
  },
  // Wording fixed by the brief.
  banco_solicita_info: {
    label: 'Banco solicita información',
    vars: req('cliente', 'banco', 'link'),
    render: (v) => `Hola ${v.cliente}, ${v.banco} necesita completar información para continuar tu solicitud de financiamiento. Completa aquí: ${v.link}`,
  },
  preaprobacion_lista: {
    label: 'Pre-aprobación lista',
    vars: req('cliente', 'banco', 'monto', 'link'),
    render: (v) => `Hola ${v.cliente}, buenas noticias: ${v.banco} te pre-aprobó hasta ${v.monto}. Mira las condiciones y busca tu carro aquí: ${v.link}`,
  },
  aprobacion_lista: {
    label: 'Aprobación lista',
    vars: req('cliente', 'banco', 'link'),
    render: (v) => `Hola ${v.cliente}, ${v.banco} aprobó tu financiamiento. Revisa las condiciones y los próximos pasos aquí: ${v.link}`,
  },
  aprobacion_vence_pronto: {
    label: 'Aprobación vence pronto',
    vars: req('cliente', 'banco', 'fecha', 'link'),
    render: (v) => `Hola ${v.cliente}, tu aprobación con ${v.banco} vence el ${v.fecha}. Si aún te interesa, avísanos antes de esa fecha: ${v.link}`,
  },
  aprobacion_expirada: {
    label: 'Aprobación expirada',
    vars: req('cliente', 'banco', 'link'),
    render: (v) => `Hola ${v.cliente}, tu aprobación con ${v.banco} venció. Podemos actualizar tu solicitud y pedir condiciones vigentes: ${v.link}`,
  },
  vehiculo_no_disponible: {
    label: 'Vehículo guardado ya no disponible',
    vars: req('cliente', 'vehiculo'),
    render: (v) => `Hola ${v.cliente}, el ${v.vehiculo} que guardaste ya no está disponible. Si quieres te ayudamos a buscar algo parecido dentro de tu presupuesto.`,
  },
  dealer_respondio: {
    label: 'Dealer respondió',
    vars: req('cliente', 'dealer'),
    render: (v) => `Hola ${v.cliente}, ${v.dealer} respondió a tu consulta en AutoRD. Puedes seguir la conversación por aquí.`,
  },
}

export const WA_TEMPLATE_KEYS = Object.keys(WA_TEMPLATES)

/**
 * Render a template. Throws rather than producing a message that should not be
 * sent — the caller is about to write this to a real person's phone.
 */
export function renderWaTemplate(key, vars = {}) {
  const tpl = WA_TEMPLATES[key]
  if (!tpl) throw new Error(`Plantilla de WhatsApp desconocida: ${key}`)

  const missing = tpl.vars.filter((n) => {
    const v = vars[n]
    return v == null || String(v).trim() === ''
  })
  if (missing.length) {
    throw new Error(`Faltan datos para la plantilla ${key}: ${missing.join(', ')}`)
  }

  const body = tpl.render(vars)
  // Belt and braces: if a template ever gains a ${} that is not declared in
  // vars, this catches it before the message goes out.
  if (/undefined|null|\{\w+\}/.test(body)) {
    throw new Error(`La plantilla ${key} produjo un mensaje incompleto`)
  }
  return body
}

// wa.me caps the prefilled text; long bodies get silently truncated mid-word.
export const WA_SOFT_LIMIT = 640

export function waLink(phone, body) {
  const digits = String(phone || '').replace(/[^\d]/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`
}
