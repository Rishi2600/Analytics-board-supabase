import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

interface ErrorStateProps {
  /** What failed, in the user's words. Never "Something went wrong". */
  title?: string
  /** What to do about it. */
  description?: string
  /** The underlying failure. Shown verbatim, because a support conversation needs it. */
  error?: unknown
  onRetry?: () => void
  className?: string
}

/**
 * The error state.
 *
 * It names what failed and what to do next. The raw message is shown rather than hidden:
 * "could not load events" tells a user nothing they can act on or report, and hiding the
 * detail only moves the debugging cost onto whoever answers the support email.
 */
export function ErrorState({
  title = 'This did not load',
  description = 'The request failed before it returned any data. Trying again usually resolves it.',
  error,
  onRetry,
  className,
}: ErrorStateProps) {
  const detail = errorMessage(error)

  return (
    <div
      className={cn(
        'flex h-full min-h-40 flex-col items-center justify-center gap-2 px-6 py-10 text-center',
        className,
      )}
      role="alert"
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {detail ? (
        <p className="mt-1 max-w-md rounded-sm bg-muted px-2 py-1 font-mono text-xs break-words text-muted-foreground">
          {detail}
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}
