import { Funnel } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { DataCard } from '@/components/data/data-card'
import { DateRangePicker } from '@/components/data/date-range-picker'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { PageHeader } from '@/components/layout/page-header'
import { Provenance } from '@/components/layout/provenance'
import { useEventNames, useFunnel, type FunnelStep } from '@/features/analytics/api'
import { FunnelBuilder } from '@/features/analytics/funnel-builder'
import { presetById } from '@/features/analytics/date-range'
import { useProject } from '@/features/projects/api'
import { formatInteger, formatPercent } from '@/lib/format'

export function FunnelsRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [preset, setPreset] = useState('30d')
  const [chosenSteps, setChosenSteps] = useState<string[]>([])
  const [windowHours, setWindowHours] = useState(24)

  const range = useMemo(() => presetById(preset).build(), [preset])
  const project = useProject(projectId)
  const eventNames = useEventNames(projectId)
  const available = (eventNames.data ?? []).map((e) => e.event_name)

  // Until someone picks steps, start from the first three events the project actually
  // sends, so the screen shows a real funnel on the first visit rather than an empty builder.
  const steps = chosenSteps.length > 0 ? chosenSteps : available.slice(0, 3)
  const funnel = useFunnel(projectId, steps, windowHours, range)
  const timeZone = project.data?.timezone ?? 'Etc/UTC'

  return (
    <>
      <PageHeader title="Funnels" actions={<DateRangePicker value={preset} onChange={setPreset} />}>
        <Provenance projectId={projectId} timeZone={timeZone} range={range} showFreshness={false} />
      </PageHeader>

      <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <FunnelBuilder
          steps={steps}
          available={available}
          windowHours={windowHours}
          onStepsChange={setChosenSteps}
          onWindowChange={setWindowHours}
        />

        <DataCard title="Conversion">
          {eventNames.isSuccess && available.length < 2 ? (
            <EmptyState
              icon={Funnel}
              title="Not enough events for a funnel"
              description="A funnel needs at least two kinds of event. Install the snippet and send a few first."
            />
          ) : funnel.isPending ? (
            <TableSkeleton rows={4} columns={3} />
          ) : funnel.isError ? (
            <ErrorState
              title="The funnel did not compute"
              description="Funnels read individual events rather than aggregates, so a long range can time out. Pick a shorter range and try again."
              error={funnel.error}
              onRetry={() => void funnel.refetch()}
            />
          ) : funnel.data.length === 0 || funnel.data[0]?.users === 0 ? (
            <EmptyState
              icon={Funnel}
              title="Nobody did the first step"
              description="No user did the first event in this range, so there is nothing to convert from. Pick a longer range or a more common first step."
            />
          ) : (
            <FunnelSteps steps={funnel.data} />
          )}
        </DataCard>
      </div>
    </>
  )
}

function FunnelSteps({ steps }: { steps: FunnelStep[] }) {
  return (
    <ol aria-label="Conversion by step" className="flex flex-col">
      {steps.map((step) => (
        <li
          key={step.step_index}
          className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="tabular w-5 text-sm text-muted-foreground">{step.step_index + 1}</span>
            <span className="min-w-0 flex-1 text-sm font-medium wrap-anywhere">
              {step.event_name}
            </span>
            <span className="text-sm">
              <span className="value">{formatInteger(step.users)}</span> users
            </span>
            <span className="value w-16 text-right text-sm text-muted-foreground">
              {formatPercent(step.conversion_from_first)}
            </span>
          </div>
          <div className="ml-8 h-2 overflow-hidden rounded-sm bg-muted" aria-hidden>
            <div
              className="h-full bg-chart-1"
              style={{ width: `${String(step.conversion_from_first * 100)}%` }}
            />
          </div>
          {step.step_index > 0 ? (
            <p className="tabular ml-8 text-xs text-muted-foreground">
              {formatPercent(step.conversion_from_previous)} of the previous step continued,{' '}
              {formatPercent(1 - step.conversion_from_previous)} dropped off.
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
