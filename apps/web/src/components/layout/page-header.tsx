import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  /** Shown beside the title. Used for the project timezone, which qualifies every number
   *  on the screen and therefore belongs next to the title rather than in settings. */
  meta?: ReactNode
  /** Primary action, right aligned on the same row as the title. */
  actions?: ReactNode
}

/**
 * One row: title left, controls right, hairline rule beneath. Part of the structural
 * signature, so every screen uses this rather than assembling its own header.
 */
export function PageHeader({ title, meta, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-medium">{title}</h1>
        {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
