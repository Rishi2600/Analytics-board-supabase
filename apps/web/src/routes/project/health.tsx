import { Activity } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { TimeSeriesChart } from '@/components/charts/time-series-chart'
import { DataCard } from '@/components/data/data-card'
import { DateRangePicker } from '@/components/data/date-range-picker'
import { MetricStrip, type Metric } from '@/components/data/metric-strip'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { ChartSkeleton } from '@/components/feedback/skeletons'
import { PageHeader } from '@/components/layout/page-header'
import { Provenance } from '@/components/layout/provenance'
import { useIngestionHealth, useRollupStatus } from '@/features/analytics/api'
import { DEFAULT_PRESET, presetById } from '@/features/analytics/date-range'
import { RejectionReasonsCard } from '@/features/analytics/rejection-reasons-card'
import { KeysSendingCard } from '@/features/keys/keys-sending-card'
import { useProject } from '@/features/projects/api'
import { formatDuration, formatInteger, formatRelative } from '@/lib/format'
import { formatInProjectZone } from '@/lib/tz'

/** Rollups run every five minutes. Past three missed runs, the numbers are stale. */
const STALE_AFTER_SECONDS = 15 * 60

/**
 * The screen that makes the other screens believable: what was refused and why, how far
 * behind aggregation is, and when the job last succeeded.
 */
export function HealthRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const range = useMemo(() => presetById(preset).build(), [preset])

  const project = useProject(projectId)
  const health = useIngestionHealth(projectId, range)
  const rollup = useRollupStatus(projectId)
  const timeZone = project.data?.timezone ?? 'Etc/UTC'

  const chart = useMemo(
    () => ({
      data: (health.data ?? []).map((p) => ({
        bucket: p.bucket,
        Accepted: p.accepted,
        Refused: p.rejected,
      })),
      series: ['Accepted', 'Refused'],
    }),
    [health.data],
  )
  const accepted = (health.data ?? []).reduce((sum, p) => sum + p.accepted, 0)
  const refused = (health.data ?? []).reduce((sum, p) => sum + p.rejected, 0)
  const lag = rollup.data?.lag_seconds ?? null

  const metrics: Metric[] = [
    { label: 'Accepted', value: health.isSuccess ? formatInteger(accepted) : '-' },
    {
      label: 'Refused',
      value: health.isSuccess ? formatInteger(refused) : '-',
      detail:
        health.isSuccess && refused > 0 ? (
          <StatusBadge tone="warn">Some refused</StatusBadge>
        ) : health.isSuccess ? (
          <StatusBadge tone="ok">None refused</StatusBadge>
        ) : null,
    },
    {
      label: 'Aggregation lag',
      value: lag === null ? 'Unknown' : formatDuration(lag * 1000),
      detail:
        lag === null ? (
          <StatusBadge tone="neutral">Not run yet</StatusBadge>
        ) : lag > STALE_AFTER_SECONDS ? (
          <>
            <StatusBadge tone="warn">Behind</StatusBadge>
            <span>Numbers may be stale</span>
          </>
        ) : (
          <StatusBadge tone="ok">Current</StatusBadge>
        ),
    },
    {
      label: 'Last rollup',
      value: rollup.data?.last_run_at
        ? formatInProjectZone(rollup.data.last_run_at, timeZone, 'HH:mm')
        : 'Never',
      detail:
        rollup.data?.last_status === 'failed' ? (
          <>
            <StatusBadge tone="danger">Failed</StatusBadge>
            <span className="wrap-anywhere">{rollup.data.last_error ?? 'No reason recorded'}</span>
          </>
        ) : rollup.data?.last_status ? (
          <>
            <StatusBadge tone="ok">Succeeded</StatusBadge>
            <span>{formatRelative(rollup.data.last_run_at)}</span>
          </>
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        title="Ingestion health"
        actions={<DateRangePicker value={preset} onChange={setPreset} />}
      >
        <Provenance projectId={projectId} timeZone={timeZone} range={range} showFreshness={false} />
      </PageHeader>

      <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <MetricStrip metrics={metrics} />

        <DataCard title="Accepted and refused over time">
          {health.isPending ? (
            <ChartSkeleton />
          ) : health.isError ? (
            <ErrorState
              title="The health chart did not load"
              description="This is a read that failed; ingestion itself is unaffected. Try again."
              error={health.error}
              onRetry={() => void health.refetch()}
            />
          ) : chart.data.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Nothing was sent in this range"
              description="Once your app sends events, accepted and refused counts appear here hour by hour."
            />
          ) : (
            <div className="p-2 pt-4">
              <TimeSeriesChart
                data={chart.data}
                series={chart.series}
                timeZone={timeZone}
                resolution="hour"
                label="Accepted and refused events per hour"
              />
            </div>
          )}
        </DataCard>

        <RejectionReasonsCard projectId={projectId} range={range} />

        <KeysSendingCard projectId={projectId} />
      </div>
    </>
  )
}
