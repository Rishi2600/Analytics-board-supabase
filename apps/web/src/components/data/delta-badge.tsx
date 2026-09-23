import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { computeDelta } from '@/lib/format'

/**
 * Period over period change. The sign and the arrow carry the meaning; the colour on the
 * arrow only reinforces it.
 */
export function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const delta = computeDelta(current, previous)
  const Icon = delta.direction === 'up' ? ArrowUp : delta.direction === 'down' ? ArrowDown : Minus
  const tone =
    delta.direction === 'up'
      ? 'text-ok'
      : delta.direction === 'down'
        ? 'text-destructive'
        : 'text-muted-foreground'

  return (
    <Badge variant="outline" className="value">
      <Icon data-icon="inline-start" className={tone} aria-hidden />
      {delta.label}
    </Badge>
  )
}
