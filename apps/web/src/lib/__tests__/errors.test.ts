import { describe, expect, it } from 'vitest'
import { errorMessage } from '../errors'

describe('errorMessage', () => {
  it('reads an Error', () => {
    expect(errorMessage(new Error('rollup lag exceeded'))).toBe('rollup lag exceeded')
  })

  it('reads a Supabase style error object, which is not an Error instance', () => {
    expect(errorMessage({ message: 'permission denied', code: '42501' })).toBe('permission denied')
  })

  it('passes a string through', () => {
    expect(errorMessage('plain failure')).toBe('plain failure')
  })

  it('never renders [object Object]', () => {
    // The whole reason this helper exists.
    expect(errorMessage({ unexpected: 'shape' })).not.toContain('[object Object]')
  })

  it('returns an empty string for no error', () => {
    expect(errorMessage(null)).toBe('')
    expect(errorMessage(undefined)).toBe('')
  })
})
