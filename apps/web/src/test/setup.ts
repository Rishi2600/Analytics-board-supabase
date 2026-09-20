import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// React Testing Library does not auto-clean when globals are enabled through a
// non-default setup path, so unmount between tests to keep them independent.
afterEach(() => {
  cleanup()
})
