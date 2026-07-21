// Resolve an SEO slug (e.g. "toyota", "honda-civic", "suvs") to a marketplace
// filter + page metadata. Returns null when the slug maps to nothing, so the
// landing page can render a friendly not-found.
export const seoSlug = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

// Plural/singular body-type slugs → the bodyType value stored on vehicles.
const TYPE_MAP = {
  suv: 'SUV', suvs: 'SUV',
  sedan: 'Sedán', sedanes: 'Sedán',
  pickup: 'Pickup', pickups: 'Pickup', camioneta: 'Pickup', camionetas: 'Pickup',
  hatchback: 'Hatchback', hatchbacks: 'Hatchback',
  coupe: 'Coupé', coupes: 'Coupé',
}

export function resolveSeo(slug, vehicles = []) {
  const s = seoSlug(slug)
  if (!s) return null

  // Body type (e.g. /suvs)
  if (TYPE_MAP[s]) {
    const tipo = TYPE_MAP[s]
    return {
      kind: 'tipo', params: { tipo },
      title: `${tipo} en venta en República Dominicana | AutoRD`,
      heading: `${tipo} en venta`,
      description: `Explora ${tipo} disponibles en AutoRD con financiamiento a través de bancos dominicanos. Compara precios, cuotas y dealers verificados.`,
      match: (v) => v.bodyType === tipo,
    }
  }

  const makes = [...new Set(vehicles.map((v) => v.make).filter(Boolean))]
  const makeBySlug = Object.fromEntries(makes.map((m) => [seoSlug(m), m]))

  // Make (e.g. /toyota)
  if (makeBySlug[s]) {
    const make = makeBySlug[s]
    return {
      kind: 'marca', params: { marca: make },
      title: `${make} en venta en República Dominicana | AutoRD`,
      heading: `${make} en venta`,
      description: `Carros ${make} disponibles en AutoRD. Compara precios y cuotas mensuales y solicita financiamiento con los bancos.`,
      match: (v) => v.make === make,
    }
  }

  // Make + model (e.g. /honda-civic) — first segment(s) form a known make.
  const parts = s.split('-')
  for (let i = 1; i < parts.length; i += 1) {
    const make = makeBySlug[parts.slice(0, i).join('-')]
    if (!make) continue
    const modelSlug = parts.slice(i).join('-')
    const models = [...new Set(vehicles.filter((v) => v.make === make).map((v) => v.model).filter(Boolean))]
    const model = models.find((m) => seoSlug(m) === modelSlug)
    if (model) {
      return {
        kind: 'modelo', params: { marca: make, modelo: model },
        title: `${make} ${model} en venta en República Dominicana | AutoRD`,
        heading: `${make} ${model} en venta`,
        description: `${make} ${model} disponibles en AutoRD con financiamiento bancario. Compara versiones, precios y cuotas mensuales.`,
        match: (v) => v.make === make && v.model === model,
      }
    }
  }
  return null
}

// A handful of popular category links for internal linking / crawlability.
export const POPULAR_SEO = [
  { slug: 'suvs', label: 'SUVs' },
  { slug: 'sedanes', label: 'Sedanes' },
  { slug: 'pickups', label: 'Pickups' },
  { slug: 'toyota', label: 'Toyota' },
  { slug: 'honda', label: 'Honda' },
  { slug: 'hyundai', label: 'Hyundai' },
  { slug: 'kia', label: 'Kia' },
]
