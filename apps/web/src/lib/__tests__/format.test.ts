import { describe, expect, it } from 'vitest'
import {
  computeDelta,
  formatBytes,
  formatCompact,
  formatDecimal,
  formatDuration,
  formatInteger,
  formatPercent,
} from '../format'

describe('formatInteger', () => {
  it('groups thousands', () => {
    expect(formatInteger(1284402)).toBe('1,284,402')
  })

  it('renders a dash for missing values rather than zero', () => {
    // Zero and "we do not have this number" are different facts, and a dashboard that
    // shows 0 for the second one is lying.
    expect(formatInteger(null)).toBe('-')
    expect(formatInteger(undefined)).toBe('-')
    expect(formatInteger(0)).toBe('0')
  })

  it('refuses to render a non finite value', () => {
    expect(formatInteger(Number.NaN)).toBe('-')
    expect(formatInteger(Number.POSITIVE_INFINITY)).toBe('-')
  })
})

describe('formatCompact', () => {
  it('shortens large numbers for axis ticks', () => {
    expect(formatCompact(1284402)).toBe('1.3M')
    expect(formatCompact(48201)).toBe('48.2K')
  })
})

describe('formatDecimal and formatPercent', () => {
  it('keeps one decimal place for ratios', () => {
    expect(formatDecimal(26.63)).toBe('26.6')
  })

  it('takes a ratio rather than an already multiplied percentage', () => {
    expect(formatPercent(0.124)).toBe('12.4%')
  })
})

describe('computeDelta', () => {
  it('reports period over period growth', () => {
    const delta = computeDelta(112, 100)
    expect(delta.direction).toBe('up')
    expect(delta.label).toBe('+12.0%')
  })

  it('reports a decline', () => {
    expect(computeDelta(90, 100).direction).toBe('down')
  })

  it('treats a tiny change as flat', () => {
    expect(computeDelta(100.01, 100).direction).toBe('flat')
  })

  it('does not report infinite growth from a zero baseline', () => {
    // The first week of data would otherwise look like a permanent triumph.
    const delta = computeDelta(500, 0)
    expect(delta.direction).toBe('unknown')
    expect(delta.label).toBe('New')
    expect(delta.ratio).toBeNull()
  })

  it('reports zero to zero as no change rather than unknown', () => {
    expect(computeDelta(0, 0).direction).toBe('flat')
  })
})

describe('formatDuration', () => {
  it('uses milliseconds below a second', () => {
    expect(formatDuration(340)).toBe('340ms')
  })

  it('uses seconds below a minute', () => {
    expect(formatDuration(1200)).toBe('1.2s')
  })

  it('uses minutes and seconds above a minute', () => {
    expect(formatDuration(125000)).toBe('2m 5s')
  })

  it('uses hours and minutes above an hour, rather than hundreds of minutes', () => {
    expect(formatDuration(4 * 3_600_000 + 10 * 60_000)).toBe('4h 10m')
  })

  it('uses days and hours above a day', () => {
    expect(formatDuration(3 * 86_400_000 + 2 * 3_600_000)).toBe('3d 2h')
  })
})

describe('formatBytes', () => {
  it('scales to the right unit', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
