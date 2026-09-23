import { Link } from 'react-router'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Button } from '@/components/ui/button'

export function NotFoundRoute() {
  return (
    <AuthLayout
      title="That page does not exist"
      description="The link may be out of date, or the project it pointed to may have been deleted."
    >
      <Button asChild>
        <Link to="/">Go to your dashboard</Link>
      </Button>
    </AuthLayout>
  )
}
