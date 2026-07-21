import { TrendingDown, BadgeDollarSign, Search } from 'lucide-react'

const ICONS = {
  good: TrendingDown,
  fair: BadgeDollarSign,
  review: Search,
}

export default function PriceSignal({ insight, compact = false }) {
  if (!insight) return null
  const Icon = ICONS[insight.tone] || BadgeDollarSign
  return (
    <span
      className={`price-signal ${insight.tone || 'fair'} ${compact ? 'compact' : ''}`}
      title={insight.summary}
    >
      <Icon size={13} />
      {insight.label}
    </span>
  )
}
