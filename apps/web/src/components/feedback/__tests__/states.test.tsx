import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from '../empty-state'
import { ErrorState } from '../error-state'

describe('EmptyState', () => {
  it('says what will appear and how to make it appear', () => {
    render(
      <EmptyState
        title="No events yet"
        description="Install the snippet on your site to start collecting."
      />,
    )
    expect(screen.getByText('No events yet')).toBeInTheDocument()
    expect(screen.getByText(/Install the snippet/)).toBeInTheDocument()
  })
})

describe('ErrorState', () => {
  it('shows the underlying failure rather than hiding it', () => {
    render(<ErrorState error={new Error('connection refused')} />)
    expect(screen.getByText('connection refused')).toBeInTheDocument()
  })

  it('is announced to assistive technology', () => {
    render(<ErrorState />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('never says something went wrong', () => {
    render(<ErrorState />)
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
  })
})
