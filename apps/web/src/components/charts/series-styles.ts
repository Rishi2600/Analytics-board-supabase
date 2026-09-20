/**
 * Chart series styling, as CSS classes rather than colour values.
 *
 * The obvious approach is to read the chart tokens out of the computed style and hand
 * Recharts a hex string. That works, and it costs a piece of state, an effect that reruns
 * on every theme change, and a window where the chart is painted with the previous
 * theme's colours.
 *
 * These are utility classes generated from the same --color-chart-* tokens in index.css,
 * so the browser resolves them. A theme switch restyles the chart with no JavaScript
 * involved, and index.css remains the only file in the repository containing a colour.
 *
 * The class names are written out in full because Tailwind scans source text: a template
 * string like `stroke-chart-${i}` produces no CSS at all.
 */

export const SERIES_STROKE = [
  'stroke-chart-1',
  'stroke-chart-2',
  'stroke-chart-3',
  'stroke-chart-4',
  'stroke-chart-5',
  'stroke-chart-6',
] as const

export const SERIES_SWATCH = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
  'bg-chart-6',
] as const

/** Six is a deliberate ceiling: past six lines nobody can read a legend. */
export const MAX_SERIES = SERIES_STROKE.length

export function strokeClass(index: number): string {
  return SERIES_STROKE[index % MAX_SERIES] ?? SERIES_STROKE[0]
}

export function swatchClass(index: number): string {
  return SERIES_SWATCH[index % MAX_SERIES] ?? SERIES_SWATCH[0]
}
