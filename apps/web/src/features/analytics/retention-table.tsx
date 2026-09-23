import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatInteger, formatPercent } from '@/lib/format'

export interface CohortRow {
  label: string
  size: number
  rates: Map<number, number>
}

/** Mixing more than this much of the chart colour into a cell drops the printed
 *  percentage below 4.5:1 in one of the themes. */
const MAX_MIX = 55

export function RetentionTable({
  rows,
  period,
  periods,
}: {
  rows: CohortRow[]
  period: 'week' | 'month'
  periods: number
}) {
  const unit = period === 'week' ? 'Week' : 'Month'

  return (
    <Table>
      <TableCaption className="sr-only">
        Share of each cohort that came back, by {period} since their first event
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className="pl-4">
            Cohort
          </TableHead>
          <TableHead scope="col" className="border-l text-right">
            People
          </TableHead>
          {Array.from({ length: periods }, (_, i) => (
            <TableHead key={i} scope="col" className="border-l text-right whitespace-nowrap">
              {unit} {i}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label} className="hover:bg-transparent">
            <TableHead scope="row" className="pl-4 font-normal whitespace-nowrap">
              {row.label}
            </TableHead>
            <TableCell className="value border-l text-right">{formatInteger(row.size)}</TableCell>
            {Array.from({ length: periods }, (_, i) => {
              const rate = row.rates.get(i)
              return rate === undefined ? (
                <TableCell key={i} className="border-l text-right text-muted-foreground">
                  <span className="sr-only">Not reached yet</span>
                  <span aria-hidden>-</span>
                </TableCell>
              ) : (
                <TableCell
                  key={i}
                  className="value border-l text-right"
                  style={{
                    backgroundColor: `color-mix(in oklab, var(--chart-1) ${String(Math.round(rate * MAX_MIX))}%, transparent)`,
                  }}
                >
                  {formatPercent(rate)}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
