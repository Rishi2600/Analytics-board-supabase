import { useEffect, type ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  /** A provenance line or a short description, shown under the title. */
  children?: ReactNode
  /** Controls, right aligned on wide screens and wrapped under the title on narrow ones. */
  actions?: ReactNode
}

export function PageHeader({ title, children, actions }: PageHeaderProps) {
  // A single page app keeps one document title unless told otherwise, so screen reader users
  // hear nothing change when they move between screens, and every tab reads the same.
  useEffect(() => {
    document.title = `${title} - Analytics`
  }, [title])

  return (
    <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-lg leading-tight font-medium text-balance">{title}</h1>
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
