import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export function NotFoundRoute() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="text-center">
        <p className="text-sm font-medium">That page does not exist</p>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be out of date, or the project may have been deleted.
        </p>
        <Button asChild className="mt-4">
          <Link to="/">Go to your dashboard</Link>
        </Button>
      </div>
    </main>
  )
}
