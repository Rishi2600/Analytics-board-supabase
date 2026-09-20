import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { TimeSeriesChart } from '@/components/charts/time-series-chart'
import { DateRangePicker } from '@/components/data/date-range-picker'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { ChartSkeleton, TableSkeleton } from '@/components/feedback/skeletons'
import { PageHeader } from '@/components/layout/page-header'
import { useIngestionHealth, useRejectionReasons, useRollupStatus } from '@/features/analytics/api'
import { useApiKeys } from '@/features/keys/api'
import { DEFAULT_PRESET, presetById } from '@/features/analytics/date-range'
import { useProject } from '@/features/projects/api'
import { formatDuration, formatInteger, formatRelative } from '@/lib/format'
import { timeZoneLabel } from '@/lib/tz'

/**
 * The screen that makes the other screens believable.
 *
 * Every other page shows numbers. This one shows whether those numbers can be trusted
 * right now: what was refused and why, how far behind aggregation is, and when the job
 * last succeeded.
 */
export function HealthRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const range = useMemo(() => presetById(preset).build(), [preset])

  const project = useProject(projectId)
  const health = useIngestionHealth(projectId, range)
  const reasons = useRejectionReasons(projectId, range)
  const rollup = useRollupStatus(projectId)
  const keys = useApiKeys(projectId)

  const timeZone = project.data?.timezone ?? 'Etc/UTC'

  const chart = useMemo(
    () => ({
      data: (health.data ?? []).map((point) => ({
        bucket: point.bucket,
        Accepted: point.accepted,
        Rejected: point.rejected,
      })),
      series: ['Accepted', 'Rejected'],
    }),
    [health.data],
  )

  const totals = useMemo(() => {
    const accepted = (health.data ?? []).reduce((sum, p) => sum + p.accepted, 0)
    const rejected = (health.data ?? []).reduce((sum, p) => sum + p.rejected, 0)
    return { accepted, rejected }
  }, [health.data])

  const lagSeconds = rollup.data?.lag_seconds ?? null
  const lagHealthy = lagSeconds !== null && lagSeconds < 15 * 60

  return (
    <>
      <PageHeader
        title="Ingestion health"
        meta={timeZoneLabel(timeZone)}
        actions={<DateRangePicker value={preset} onChange={setPreset} />}
      />

      <div className="space-y-6 p-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard label="Accepted" value={formatInteger(totals.accepted)} />
          <StatusCard
            label="Rejected"
            value={formatInteger(totals.rejected)}
            tone={totals.rejected > 0 ? 'warn' : undefined}
          />
          <StatusCard
            label="Aggregation lag"
            value={lagSeconds === null ? 'Unknown' : formatDuration(lagSeconds * 1000)}
            tone={lagSeconds === null ? undefined : lagHealthy ? 'ok' : 'warn'}
            hint={lagHealthy ? 'Rollups are current' : 'Rollups are behind; numbers may be stale'}
          />
          <StatusCard
            label="Last rollup"
            value={rollup.data?.last_run_at ? formatRelative(rollup.data.last_run_at) : 'Never'}
            tone={rollup.data?.last_status === 'failed' ? 'danger' : undefined}
            hint={rollup.data?.last_error ?? undefined}
          />
        </section>

        <section className="rounded-md border bg-card">
          <div className="border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">Accepted and rejected over time</h2>
          </div>
          {health.isPending ? (
            <ChartSkeleton height={220} />
          ) : health.isError ? (
            <ErrorState
              title="The health chart did not load"
              error={health.error}
              onRetry={() => void health.refetch()}
            />
          ) : chart.data.length === 0 ? (
            <EmptyState
              title="No ingestion activity"
              description="Nothing has been sent to this project in this range."
            />
          ) : (
            <div className="p-2">
              <TimeSeriesChart
                data={chart.data}
                series={chart.series}
                timeZone={timeZone}
                resolution="hour"
                height={220}
              />
            </div>
          )}
        </section>

        <section className="rounded-md border bg-card">
          <div className="border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">Why events were rejected</h2>
          </div>
          {reasons.isPending ? (
            <TableSkeleton rows={3} columns={3} />
          ) : reasons.isError ? (
            <ErrorState
              title="Rejection reasons did not load"
              error={reasons.error}
              onRetry={() => void reasons.refetch()}
            />
          ) : reasons.data.length === 0 ? (
            <EmptyState
              title="Nothing was rejected"
              description="Every event sent in this range was accepted. This is the state you want."
            />
          ) : (
            <ul className="divide-y divide-border">
              {reasons.data.map((reason) => (
                <li key={reason.reason} className="px-4 py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="flex-1 text-sm font-medium">{reason.reason}</span>
                    <span className="value text-sm">{formatInteger(reason.total)}</span>
                    <span className="w-24 text-right text-xs text-muted-foreground">
                      {formatRelative(reason.last_seen)}
                    </span>
                  </div>
                  {reason.sample ? (
                    <pre className="mt-2 max-h-32 overflow-auto rounded-sm border bg-muted p-2 font-mono text-xs text-muted-foreground">
                      {JSON.stringify(reason.sample, null, 2)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border bg-card">
          <div className="border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">Keys sending events</h2>
          </div>
          {keys.isPending ? (
            <TableSkeleton rows={3} columns={3} />
          ) : keys.isError ? (
            <ErrorState
              title="The key list did not load"
              error={keys.error}
              onRetry={() => void keys.refetch()}
            />
          ) : keys.data.length === 0 ? (
            <EmptyState
              title="No keys yet"
              description="Create an API key in settings so your app can send events."
            />
          ) : (
            <ul className="divide-y divide-border">
              {keys.data.map((key) => (
                <li key={key.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex-1 text-sm">{key.name}</span>
                  <span className="value text-xs text-muted-foreground">{key.key_prefix}</span>
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {key.revoked_at ? 'Revoked' : formatRelative(key.last_used_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function StatusCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'danger'
  hint?: string
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-ok'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'danger'
          ? 'text-destructive'
          : ''

  return (
    <div className="rounded-md border bg-card p-4">
      <p className={`value text-2xl leading-none font-medium ${toneClass}`}>{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
