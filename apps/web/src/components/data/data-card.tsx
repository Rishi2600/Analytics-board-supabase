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
        {/* With an action beside the title, the description runs full width underneath it
            rather than squeezing into the column left of the button. */}
        {description ? (
          <CardDescription className={cn(action && 'col-span-2')}>{description}</CardDescription>
        ) : null}
        {action ? <CardAction className="row-span-1">{action}</CardAction> : null}
      </CardHeader>
      <div className="min-w-0">{children}</div>
      {footer ? (
        <CardFooter className="text-xs text-pretty text-muted-foreground">{footer}</CardFooter>
      ) : null}
    </Card>
  )
}
