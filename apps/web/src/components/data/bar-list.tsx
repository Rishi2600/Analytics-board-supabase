import { formatInteger, formatPercent } from '@/lib/format'

export interface BarListItem {
  label: string
  value: number
  share: number
}

/**
 * A ranked list with a proportion bar behind each row. What a pie chart should have been:
 * it reads top to bottom, puts the exact number beside the label, and stays legible past six
 * categories. Labels wrap rather than truncate, so a long path is always readable in full.
 */
export function BarList({ items, label }: { items: BarListItem[]; label: string }) {
  const max = Math.max(...items.map((i) => i.value), 1)

  return (
    <ul aria-label={label} className="flex flex-col py-1">
      {items.map((item) => (
        <li key={item.label} className="relative flex items-start gap-3 px-4 py-2 text-sm">
          <div
            aria-hidden
            className="absolute inset-y-0.5 left-2 rounded-sm bg-chart-1/12"
            style={{ width: `calc(${String((item.value / max) * 100)}% - 1rem)` }}
          />
          <span className="relative min-w-0 flex-1 wrap-anywhere">{item.label}</span>
          <span className="value relative">{formatInteger(item.value)}</span>
          <span className="value relative w-14 text-right text-muted-foreground">
            {formatPercent(item.share)}
          </span>
        </li>
      ))}
    </ul>
  )
}
