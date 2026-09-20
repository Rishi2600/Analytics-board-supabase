import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { PageHeader } from '@/components/layout/page-header'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEventNames, useRetention } from '@/features/analytics/api'
import { presetById } from '@/features/analytics/date-range'
import { useProject } from '@/features/projects/api'
import { formatInteger, formatPercent } from '@/lib/format'
import { timeZoneLabel } from '@/lib/tz'

const PERIODS = 8

export function RetentionRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [cohortEvent, setCohortEvent] = useState<string>('')
  const [returnEvent, setReturnEvent] = useState<string>('')

  const range = useMemo(() => presetById('90d').build(), [])
  const project = useProject(projectId)
  const eventNames = useEventNames(projectId)

  const available = eventNames.data ?? []
  const effectiveCohort = cohortEvent || available[0]?.event_name || ''
  const effectiveReturn = returnEvent || available[0]?.event_name || ''

  const retention = useRetention(
    projectId,
    effectiveCohort,
    effectiveReturn,
    PERIODS,
    period,
    range,
  )

  const timeZone = project.data?.timezone ?? 'Etc/UTC'

  const grid = useMemo(() => {
    const byCohort = new Map<string, { size: number; cells: Map<number, number> }>()
    for (const cell of retention.data ?? []) {
      const entry = byCohort.get(cell.cohort_start) ?? { size: cell.cohort_size, cells: new Map() }
      entry.size = cell.cohort_size
      entry.cells.set(cell.period_number, cell.rate)
      byCohort.set(cell.cohort_start, entry)
    }
    return [...byCohort.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12)
  }, [retention.data])

  return (
    <>
      <PageHeader
        title="Retention"
        meta={timeZoneLabel(timeZone)}
        actions={
          <Tabs
            value={period}
            onValueChange={(value) => {
              setPeriod(value === 'month' ? 'month' : 'week')
            }}
          >
            <TabsList>
              <TabsTrigger value="week">Weekly</TabsTrigger>
              <TabsTrigger value="month">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <div className="space-y-6 p-6">
        <section className="flex flex-wrap items-end gap-4 rounded-md border bg-card p-4">
          <div className="min-w-52">
            <Label htmlFor="cohort-event" className="text-xs">
              Cohort by first
            </Label>
            <Select value={effectiveCohort} onValueChange={setCohortEvent}>
              <SelectTrigger id="cohort-event" className="mt-1.5 w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {available.map((e) => (
                  <SelectItem key={e.event_name} value={e.event_name}>
                    {e.event_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-52">
            <Label htmlFor="return-event" className="text-xs">
              Counted as returning when they
            </Label>
            <Select value={effectiveReturn} onValueChange={setReturnEvent}>
              <SelectTrigger id="return-event" className="mt-1.5 w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {available.map((e) => (
                  <SelectItem key={e.event_name} value={e.event_name}>
                    {e.event_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="w-full text-xs text-muted-foreground">
            A user's cohort is the period of their first ever cohort event, not their first one
            inside this range. Anchoring on the range would move people between cohorts every time
            the dates changed.
          </p>
        </section>

        <section className="overflow-x-auto rounded-md border bg-card">
          <div className="border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">Cohorts</h2>
          </div>

          {available.length === 0 && eventNames.isSuccess ? (
            <EmptyState
              title="No events to build cohorts from"
              description="Retention needs at least one event type. Install the snippet and send some events first."
            />
          ) : retention.isPending ? (
            <TableSkeleton rows={6} columns={6} />
          ) : retention.isError ? (
            <ErrorState
              title="Retention did not compute"
              description="This reads individual events rather than rollups, so it is bounded by your raw retention window."
              error={retention.error}
              onRetry={() => void retention.refetch()}
            />
          ) : grid.length === 0 ? (
            <EmptyState
              title="No cohorts in this range"
              description="Nobody performed the cohort event in the last 90 days, so there are no cohorts to follow."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Cohort</th>
                  <th className="border-l px-3 py-2 text-right font-medium">Users</th>
                  {Array.from({ length: PERIODS }, (_, i) => (
                    <th key={i} className="border-l px-3 py-2 text-right font-medium">
                      {period === 'week' ? `W${String(i)}` : `M${String(i)}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map(([cohort, entry]) => (
                  <tr key={cohort} className="border-b last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap">{cohort}</td>
                    <td className="value border-l px-3 py-2 text-right">
                      {formatInteger(entry.size)}
                    </td>
                    {Array.from({ length: PERIODS }, (_, i) => {
                      const rate = entry.cells.get(i)
                      return (
                        <td key={i} className="border-l p-0">
                          {rate === undefined ? (
                            <div className="px-3 py-2 text-right text-xs text-muted-foreground">
                              -
                            </div>
                          ) : (
                            <div
                              className="value px-3 py-2 text-right text-xs"
                              // Colour scale from the chart palette, not the accent. The
                              // number is always present, so colour is reinforcement
                              // rather than the only carrier of meaning.
                              style={{
                                backgroundColor: `color-mix(in oklab, var(--chart-1) ${String(Math.round(rate * 100))}%, transparent)`,
                              }}
                            >
                              {formatPercent(rate)}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  )
}
