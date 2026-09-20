import { describe, expect, it } from 'vitest'
import { formatInProjectZone, isValidTimeZone, timeZoneLabel } from '../tz'

describe('timezone helpers', () => {
  it('accepts a real IANA name', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true)
    expect(isValidTimeZone('Etc/UTC')).toBe(true)
  })

  it('rejects a name nothing knows', () => {
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
  })

  it('renders a timestamp in the project zone, not the browser zone', () => {
    // 18:30 UTC is the next calendar day in Asia/Kolkata. This is exactly the off-by-one
    // that makes a customer's daily totals disagree with ours.
    const instant = '2026-09-20T18:30:00.000Z'
    expect(formatInProjectZone(instant, 'Asia/Kolkata', 'yyyy-MM-dd')).toBe('2026-09-21')
    expect(formatInProjectZone(instant, 'Etc/UTC', 'yyyy-MM-dd')).toBe('2026-09-20')
  })

  it('makes an underscore name readable', () => {
    expect(timeZoneLabel('America/New_York')).toBe('America/New York')
  })
})
