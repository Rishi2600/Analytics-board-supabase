import { AppRouter } from '@/app/router'
import { Providers } from '@/app/providers'

export default function App() {
  return (
    <Providers>
      <AppRouter />
    </Providers>
  )
}
