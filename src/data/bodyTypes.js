import bodySuvs from '../assets/body-types/suvs.png'
import bodyTrucks from '../assets/body-types/trucks.png'
import bodySedans from '../assets/body-types/sedans.png'
import bodyCoupes from '../assets/body-types/coupes.png'
import bodyMinivans from '../assets/body-types/minivans.png'
import bodyHatchbacks from '../assets/body-types/hatchbacks.png'
import bodyConvertibles from '../assets/body-types/convertibles.png'
import bodyStationWagons from '../assets/body-types/station-wagons.png'

// Single source of truth for the "browse by body type" tiles (Home + /buscar).
// `type` matches vehicles.body_type; `label` is the plural display name.
export const BODY_TYPES = [
  { type: 'SUV', label: 'SUVs', image: bodySuvs },
  { type: 'Pickup', label: 'Camionetas', image: bodyTrucks },
  { type: 'Sedán', label: 'Sedanes', image: bodySedans },
  { type: 'Coupé', label: 'Coupés', image: bodyCoupes },
  { type: 'Minivan', label: 'Minivans', image: bodyMinivans },
  { type: 'Hatchback', label: 'Hatchbacks', image: bodyHatchbacks },
  { type: 'Convertible', label: 'Convertibles', image: bodyConvertibles },
  { type: 'Wagon', label: 'Familiares', image: bodyStationWagons },
]

export const TYPE_LABELS = Object.fromEntries(BODY_TYPES.map((b) => [b.type, b.label]))
