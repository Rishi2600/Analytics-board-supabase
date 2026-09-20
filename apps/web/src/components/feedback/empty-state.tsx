import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** What is not here. Sentence case, no apology. */
  title: string
  /** What will appear here, and what makes it appear. */
  description: string
  /** One action. Two actions in an empty state means we do not know what the user should do. */
  action?: ReactNode
  className?: string
}

/**
 * The empty state every data surface ships alongside its happy path.
 *
 * An empty chart with no explanation is indistinguishable from a broken one, and a new
 * user cannot tell whether they installed the snippet wrong or simply have no traffic yet.
 * Saying which, and giving them the next step, is the whole job.
 */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex h-full min-h-40 flex-col items-center justify-center gap-2 px-6 py-10 text-center',
        className,
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
