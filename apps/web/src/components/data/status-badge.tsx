import { CircleCheck, CircleDashed, CircleX, LoaderCircle, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'

export type StatusTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'busy'

const TONES = {
  ok: { icon: CircleCheck, className: 'text-ok' },
  warn: { icon: TriangleAlert, className: 'text-warn' },
  danger: { icon: CircleX, className: 'text-destructive' },
  neutral: { icon: CircleDashed, className: 'text-muted-foreground' },
  busy: { icon: LoaderCircle, className: 'text-muted-foreground' },
} as const

/** A state in words, with a coloured icon beside it. The word carries the meaning. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const { icon: Icon, className } = TONES[tone]
  return (
    <Badge variant="outline">
      <Icon data-icon="inline-start" className={className} aria-hidden />
      {children}
    </Badge>
  )
}
