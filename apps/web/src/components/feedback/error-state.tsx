import { CircleAlert, RotateCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

interface ErrorStateProps {
  /** What failed, in the user's words. Never "Something went wrong". */
  title?: string
  /** What to do about it. */
  description?: string
  /** The underlying failure, shown verbatim because a support conversation needs it. */
  error?: unknown
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({
  title = 'This did not load',
  description = 'The request failed before it returned any data. Try again, and if it keeps failing, narrow the date range.',
  error,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  const detail = errorMessage(error)

  return (
    <div className={cn('p-4', className)}>
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>{description}</span>
          {detail ? (
            <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs break-all text-muted-foreground">
              {detail}
            </code>
          ) : null}
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCw data-icon="inline-start" />
              {retryLabel}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    </div>
  )
}
