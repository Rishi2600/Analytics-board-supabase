import { ChartSpline, Globe, Inbox } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { TimeSeriesChart } from '@/components/charts/time-series-chart'
import { DataCard } from '@/components/data/data-card'
import { DateRangePicker } from '@/components/data/date-range-picker'
import { DeltaBadge } from '@/components/data/delta-badge'
import { MetricStrip, type Metric } from '@/components/data/metric-strip'
import { RankedCard } from '@/components/data/ranked-card'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { ChartSkeleton, MetricStripSkeleton } from '@/components/feedback/skeletons'
import { PageHeader } from '@/components/layout/page-header'
import { Provenance } from '@/components/layout/provenance'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  useBreakdown,
  useSummary,
  useTimeseries,
  useTopEvents,
  type Summary,
} from '@/features/analytics/api'
import { DEFAULT_PRESET, presetById } from '@/features/analytics/date-range'
import { pivotSeries } from '@/features/analytics/pivot'
import { useProject } from '@/features/projects/api'
import { formatDecimal, formatInteger } from '@/lib/format'

const RESOLUTION_LABELS: Record<string, string> = { hour: 'Hourly', day: 'Daily', week: 'Weekly' }

export function OverviewRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const range = useMemo(() => presetById(preset).build(), [preset])

  const project = useProject(projectId)
  const summary = useSummary(projectId, range)
  const timeseries = useTimeseries(projectId, range)
  const topEvents = useTopEvents(projectId, range, 8)
  const pages = useBreakdown(projectId, range, 'page_view', 'path', 8)
  const countries = useBreakdown(projectId, range, null, 'country', 8)

  const timeZone = project.data?.timezone ?? summary.data?.timezone ?? 'Etc/UTC'
  const chart = useMemo(() => pivotSeries(timeseries.data ?? []), [timeseries.data])
  const hasNoData = summary.isSuccess && summary.data.total_events === 0

  return (
    <>
      <PageHeader
        title="Overview"
        actions={<DateRangePicker value={preset} onChange={setPreset} />}
      >
        <Provenance projectId={projectId} timeZone={timeZone} range={range} />
      </PageHeader>

      <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        {summary.isPending ? (
          <MetricStripSkeleton />
        ) : summary.isError ? (
          <ErrorState
            className="p-0"
            title="The headline numbers did not load"
            description="Your events are safe; this is a read that failed. Try again, or pick a shorter range."
            error={summary.error}
            onRetry={() => void summary.refetch()}
          />
        ) : hasNoData ? (
          <Card className="py-0">
            <EmptyState
              icon={Inbox}
              title="No events yet"
              description="Install the snippet on your site to start collecting. This screen fills in within about five minutes of the first event."
              action={
                <Button asChild>
                  <Link to={`/p/${projectId}/settings?tab=install`}>Get the snippet</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <MetricStrip metrics={headlineMetrics(summary.data)} />
        )}

        <DataCard
          title="Events over time"
          action={
            chart.data.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {RESOLUTION_LABELS[chart.resolution] ?? 'Daily'}
              </span>
            ) : null
          }
        >
          {timeseries.isPending ? (
            <ChartSkeleton />
          ) : timeseries.isError ? (
            <ErrorState
              title="The chart did not load"
              description="The time series query failed. Try again, or pick a shorter range."
              error={timeseries.error}
              onRetry={() => void timeseries.refetch()}
            />
          ) : chart.data.length === 0 ? (
            <EmptyState
              icon={ChartSpline}
              title="Nothing in this range"
              description="No events were recorded between these dates. Pick a longer range above."
            />
          ) : (
            <div className="p-2 pt-4">
              <TimeSeriesChart
                data={chart.data}
                series={chart.series}
                timeZone={timeZone}
                resolution={chart.resolution}
                label={`Events over time, by event name, for ${presetById(preset).label.toLowerCase()}`}
              />
            </div>
          )}
        </DataCard>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <RankedCard
            title="Top events"
            query={topEvents}
            toItems={(rows) =>
              rows.map((r) => ({ label: r.event_name, value: r.event_count, share: r.share }))
            }
            emptyTitle="No events in this range"
            emptyDescription="Events are ranked here by volume once they arrive."
          />
          <RankedCard
            title="Top pages"
            query={pages}
            toItems={(rows) =>
              rows.map((r) => ({ label: r.prop_value, value: r.event_count, share: r.share }))
            }
            emptyTitle="No page views in this range"
            emptyDescription="Call page() from the SDK to record which pages people visit."
          />
        </div>

        <RankedCard
          title="Top countries"
          icon={Globe}
          query={countries}
          toItems={(rows) =>
            rows.map((r) => ({ label: r.prop_value, value: r.event_count, share: r.share }))
          }
          emptyTitle="No country data in this range"
          emptyDescription="Country is worked out from each request as it arrives, so it appears with the first events."
        />
      </div>
    </>
  )
}

function headlineMetrics(summary: Summary): Metric[] {
  const readout = (label: string, value: string, current: number, previous: number): Metric => ({
    label,
    value,
    detail: (
      <>
        <DeltaBadge current={current} previous={previous} />
        <span>vs previous period</span>
      </>
    ),
  })

  return [
    readout(
      'Total events',
      formatInteger(summary.total_events),
      summary.total_events,
      summary.prev_total_events,
    ),
    readout(
      'Unique users',
      formatInteger(summary.unique_users),
      summary.unique_users,
      summary.prev_unique_users,
    ),
    readout('Sessions', formatInteger(summary.sessions), summary.sessions, summary.prev_sessions),
    readout(
      'Events per user',
      formatDecimal(summary.events_per_user),
      summary.events_per_user,
      summary.prev_events_per_user,
    ),
  ]
}
