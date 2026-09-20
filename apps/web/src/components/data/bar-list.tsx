import { formatInteger, formatPercent } from '@/lib/format'

export interface BarListItem {
  label: string
  value: number
  share: number
}

/**
 * A ranked list with an inline proportion bar.
 *
 * This is what a pie chart should have been. It is sortable, it reads top to bottom, it
 * puts the exact number next to the label, and it stays legible past six categories.
 */
export function BarList({ items }: { items: BarListItem[] }) {
  const max = Math.max(...items.map((i) => i.value), 1)

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.label} className="relative flex items-center gap-3 px-4 py-2">
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-r-sm bg-primary/8"
            style={{ width: `${String((item.value / max) * 100)}%` }}
          />
          <span className="relative min-w-0 flex-1 truncate text-sm">{item.label}</span>
          <span className="value relative text-sm">{formatInteger(item.value)}</span>
          <span className="value relative w-14 text-right text-xs text-muted-foreground">
            {formatPercent(item.share)}
          </span>
        </li>
      ))}
    </ul>
  )
}
