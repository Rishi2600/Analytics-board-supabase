import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** What is not here. Sentence case, no apology. */
  title: string
  /** What will appear here, and what makes it appear. */
  description: string
  icon?: LucideIcon
  /** One action. Two means we do not know what the user should do next. */
  action?: ReactNode
  className?: string
}

/**
 * An empty chart with no explanation looks exactly like a broken one. This says which it
 * is, and what to do next.
 */
export function EmptyState({ title, description, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <Empty className={cn('min-h-40 py-8', className)}>
      <EmptyHeader>
        {Icon ? (
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
        ) : null}
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}
