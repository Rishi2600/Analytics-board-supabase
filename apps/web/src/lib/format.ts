/**
 * Number, date and duration formatting for the whole product.
 *
 * One module, because "1,284,402" and "1.28M" appearing on the same screen for the same
 * value is the kind of detail that makes people stop trusting the numbers. Everything is
 * locale aware through Intl rather than hand rolled.
 */

const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US'

const integerFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
const compactFormat = new Intl.NumberFormat(locale, {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const decimalFormat = new Intl.NumberFormat(locale, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
// Always one decimal, so a column of percentages lines up: "17.0%" beside "17.1%", not "17%".
const percentFormat = new Intl.NumberFormat(locale, {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** 1284402 -> "1,284,402". The exact value, for tables and KPI cards. */
export function formatInteger(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return integerFormat.format(value)
}

/** 1284402 -> "1.3M". For axis ticks and anywhere space is tight. */
export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return compactFormat.format(value)
}

/** 26.63 -> "26.6". For ratios such as events per user. */
export function formatDecimal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return decimalFormat.format(value)
}

/** 0.124 -> "12.4%". Takes a ratio, not an already multiplied percentage. */
export function formatPercent(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return '-'
  return percentFormat.format(ratio)
}

export interface Delta {
  ratio: number | null
  label: string
  direction: 'up' | 'down' | 'flat' | 'unknown'
}

/**
 * Period over period change.
 *
 * Growth from zero is reported as unknown rather than as an infinite percentage. "+Inf%"
 * or "+100%" from a zero baseline is noise that makes a first week of data look like a
 * triumph or a catastrophe at random.
 */
export function computeDelta(current: number, previous: number): Delta {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { ratio: null, label: '-', direction: 'unknown' }
  }
  if (previous === 0) {
    return current === 0
      ? { ratio: 0, label: 'No change', direction: 'flat' }
      : { ratio: null, label: 'New', direction: 'unknown' }
  }

  const ratio = (current - previous) / previous
  if (Math.abs(ratio) < 0.0005) return { ratio: 0, label: 'No change', direction: 'flat' }

  const sign = ratio > 0 ? '+' : ''
  return {
    ratio,
    label: `${sign}${percentFormat.format(ratio)}`,
    direction: ratio > 0 ? 'up' : 'down',
  }
}

/** Milliseconds to a short human duration: "340ms", "1.2s", "2m 5s", "4h 10m", "3d 2h". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${decimalFormat.format(ms / 1000)}s`
  if (ms < 3_600_000) {
    const minutes = Math.floor(ms / 60_000)
    const seconds = Math.round((ms % 60_000) / 1000)
    return `${minutes}m ${seconds}s`
  }
  if (ms < 86_400_000) {
    const hours = Math.floor(ms / 3_600_000)
    const minutes = Math.round((ms % 3_600_000) / 60_000)
    return `${hours}h ${minutes}m`
  }
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.round((ms % 86_400_000) / 3_600_000)
  return `${integerFormat.format(days)}d ${hours}h`
}

/** "2 min ago", "4 days ago". Used for last-seen style columns. */
export function formatRelative(input: string | Date | null | undefined): string {
  if (!input) return 'Never'
  const then = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(then.getTime())) return '-'

  const seconds = Math.round((Date.now() - then.getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
  ]

  let value = seconds
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return rtf.format(-value, unit)
    value = Math.round(value / size)
  }
  return rtf.format(-value, 'year')
}

/** Byte counts for export file sizes. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? Math.round(value) : decimalFormat.format(value)} ${units[unit]}`
}
