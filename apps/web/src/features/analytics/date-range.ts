import { subDays, subHours, startOfDay, endOfDay } from 'date-fns'

export interface DateRange {
  from: Date
  to: Date
}

export interface RangePreset {
  id: string
  label: string
  build: () => DateRange
}

/**
 * The date range presets, and the only place ranges are constructed.
 *
 * "Last 7 days" ends now rather than at midnight, because a dashboard that stops at
 * yesterday is useless for the question people actually open it to ask.
 */
export const RANGE_PRESETS: RangePreset[] = [
  {
    id: 'today',
    label: 'Today',
    build: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }),
  },
  {
    id: '24h',
    label: 'Last 24 hours',
    build: () => ({ from: subHours(new Date(), 24), to: new Date() }),
  },
  {
    id: '7d',
    label: 'Last 7 days',
    build: () => ({ from: subDays(new Date(), 7), to: new Date() }),
  },
  {
    id: '30d',
    label: 'Last 30 days',
    build: () => ({ from: subDays(new Date(), 30), to: new Date() }),
  },
  {
    id: '90d',
    label: 'Last 90 days',
    build: () => ({ from: subDays(new Date(), 90), to: new Date() }),
  },
]

export const DEFAULT_PRESET = '7d'

export function presetById(id: string): RangePreset {
  const preset =
    RANGE_PRESETS.find((p) => p.id === id) ?? RANGE_PRESETS.find((p) => p.id === DEFAULT_PRESET)
  if (!preset) throw new Error(`No date range preset called ${DEFAULT_PRESET}`)
  return preset
}

/** Ranges are serialised into query keys, so they need a stable representation. */
export function rangeKey(range: DateRange): string {
  return `${range.from.toISOString()}..${range.to.toISOString()}`
}

/**
 * A closed historical range cannot change, so its data can be cached far longer than a
 * range whose last bucket is still filling up.
 */
export function isHistorical(range: DateRange): boolean {
  return range.to.getTime() < Date.now() - 60 * 60 * 1000
}

export function staleTimeFor(range: DateRange): number {
  return isHistorical(range) ? 5 * 60_000 : 30_000
}
