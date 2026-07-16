import { Check, Clock, Loader, X, FileWarning } from 'lucide-react'

// Maps a financing/application status to a chip style + icon + label.
const MAP = {
  aprobado:   { cls: 'chip-green', icon: Check,       label: 'KYC aprobado' },
  pendiente:  { cls: 'chip-amber', icon: Clock,       label: 'KYC pendiente' },
  offer:      { cls: 'chip-green', icon: Check,       label: 'Oferta recibida' },
  approved:   { cls: 'chip-green', icon: Check,       label: 'Aprobado' },
  evaluating: { cls: 'chip-amber', icon: Loader,      label: 'En evaluación' },
  pending:    { cls: 'chip-blue',  icon: Clock,       label: 'Pendiente' },
  docs:       { cls: 'chip-amber', icon: FileWarning, label: 'Pendiente documentos' },
  rejected:   { cls: 'chip-red',   icon: X,           label: 'Rechazado' },
}

export default function StatusChip({ status, children }) {
  const m = MAP[status] || { cls: 'chip', icon: Clock, label: status }
  const Icon = m.icon
  return (
    <span className={`chip ${m.cls}`}>
      <Icon size={13} strokeWidth={2.5} />
      {children || m.label}
    </span>
  )
}
