import { formatInteger } from '@/lib/format'
import { formatInProjectZone } from '@/lib/tz'
import { swatchClass } from './series-styles'

interface TooltipPayloadItem {
  name?: string
  value?: number | string
  dataKey?: string | number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string | number
  timeZone: string
  labelPattern?: string
  /** Series order, so a swatch matches the line it describes. */
  series?: string[]
}

/**
 * The tooltip, styled to match the card it sits inside rather than the library default.
 *
 * Values go through the same formatter as the rest of the product, so a number here and
 * the same number in a table never disagree about grouping or rounding.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  timeZone,
  labelPattern = 'd MMM, HH:mm',
  series = [],
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const heading =
    typeof label === 'string' || typeof label === 'number'
      ? formatInProjectZone(new Date(label), timeZone, labelPattern)
      : ''

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-sm">
      <p className="mb-1.5 text-xs text-muted-foreground">{heading}</p>
      <ul className="space-y-1">
        {payload.map((item, index) => {
          const name = String(item.name ?? item.dataKey ?? '')
          const seriesIndex = series.indexOf(name)
          return (
            <li key={`${name}-${String(index)}`} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className={`size-2 shrink-0 rounded-[2px] ${swatchClass(seriesIndex < 0 ? index : seriesIndex)}`}
              />
              <span className="text-muted-foreground">{name}</span>
              <span className="value ml-auto">{formatInteger(Number(item.value))}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
