/**
 * Chart colours come from the --chart-* tokens in index.css, handed to Recharts as CSS
 * variables so the browser resolves them and a theme switch needs no JavaScript.
 */
const SERIES_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const

/** Six is a deliberate ceiling: past six lines nobody can read a legend. */
export const MAX_SERIES = SERIES_COLORS.length

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % MAX_SERIES] ?? SERIES_COLORS[0]
}
