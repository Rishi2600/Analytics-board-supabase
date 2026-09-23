import { ChartNoAxesColumn } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { ThemeToggle } from './theme-toggle'

interface Props {
  /** The page's own heading, and the browser tab title. */
  title: string
  description?: ReactNode
  children: ReactNode
}

/** The frame for screens outside a project: sign in, first run, invites. */
export function AuthLayout({ title, description, children }: Props) {
  useEffect(() => {
    document.title = `${title} - Analytics`
  }, [title])

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-12 items-center justify-between px-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground [&_svg]:size-3.5">
            <ChartNoAxesColumn aria-hidden />
          </span>
          Analytics
        </span>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-12 pb-12 sm:pt-24">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-medium text-balance">{title}</h1>
            {description ? (
              <p className="text-sm text-pretty text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
