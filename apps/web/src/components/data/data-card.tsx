import type { ReactNode } from 'react'
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface DataCardProps {
  title: ReactNode
  description?: ReactNode
  /** One control, right aligned on the title row. */
  action?: ReactNode
  /** A standing note about the data, such as how keys are stored. */
  footer?: ReactNode
  children: ReactNode
  className?: string
}

/** A panel with a one-row header: title left, control right, hairline beneath. */
export function DataCard({
  title,
  description,
  action,
  footer,
  children,
  className,
}: DataCardProps) {
  return (
    <Card size="sm" className={cn('gap-0 py-0', className)}>
      <CardHeader className="border-b pt-3">
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <div className="min-w-0">{children}</div>
      {footer ? (
        <CardFooter className="text-xs text-pretty text-muted-foreground">{footer}</CardFooter>
      ) : null}
    </Card>
  )
}
