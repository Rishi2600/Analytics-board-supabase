import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'
import App from './App'

describe('toolchain', () => {
  it('renders the application root', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeInTheDocument()
  })

  it('resolves the @ alias and renders a shadcn primitive', () => {
    render(<Button>Create key</Button>)
    expect(screen.getByRole('button', { name: 'Create key' })).toBeInTheDocument()
  })
})
