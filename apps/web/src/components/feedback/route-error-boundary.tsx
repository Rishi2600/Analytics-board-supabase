import { Component, type ReactNode } from 'react'
import { ErrorState } from './error-state'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a screen that throws while rendering, so one broken screen leaves the navigation
 * working instead of blanking the whole app. The shell keys this by location, so moving to
 * another screen clears it.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="p-4 sm:p-6">
        <ErrorState
          title="This screen stopped working"
          description="Reload the screen to try again, or pick another one from the navigation. If it keeps happening, send us the message below."
          error={this.state.error}
          onRetry={() => {
            window.location.reload()
          }}
          retryLabel="Reload screen"
        />
      </div>
    )
  }
}
