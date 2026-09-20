import { Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { DateRangePicker } from '@/components/data/date-range-picker'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEventNames, useFunnel } from '@/features/analytics/api'
import { presetById } from '@/features/analytics/date-range'
import { useProject } from '@/features/projects/api'
import { formatInteger, formatPercent } from '@/lib/format'
import { timeZoneLabel } from '@/lib/tz'

const WINDOW_OPTIONS = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '1 day' },
  { hours: 24 * 7, label: '7 days' },
  { hours: 24 * 30, label: '30 days' },
]

export function FunnelsRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [preset, setPreset] = useState('30d')
  const [steps, setSteps] = useState<string[]>([])
  const [windowHours, setWindowHours] = useState(24)

  const range = useMemo(() => presetById(preset).build(), [preset])
  const project = useProject(projectId)
  const eventNames = useEventNames(projectId)
  const funnel = useFunnel(projectId, steps, windowHours, range)

  const timeZone = project.data?.timezone ?? 'Etc/UTC'
  const available = eventNames.data ?? []

  // Default to the first few events the project actually sends, so the screen shows
  // something real on first visit rather than an empty builder.
  const effectiveSteps = steps.length > 0 ? steps : available.slice(0, 3).map((e) => e.event_name)

  const activeFunnel = useFunnel(projectId, effectiveSteps, windowHours, range)
  const result = steps.length > 0 ? funnel : activeFunnel

  return (
    <>
      <PageHeader
        title="Funnels"
        meta={timeZoneLabel(timeZone)}
        actions={<DateRangePicker value={preset} onChange={setPreset} />}
      />

      <div className="space-y-6 p-6">
        <section className="space-y-4 rounded-md border bg-card p-4">
          <div className="space-y-2">
            <Label className="text-xs">Steps, in order</Label>
            {effectiveSteps.map((step, index) => (
              <div key={`${step}-${String(index)}`} className="flex items-center gap-2">
                <span className="value w-5 text-xs text-muted-foreground">{index + 1}</span>
                <Select
                  value={step}
                  onValueChange={(value) => {
                    const next = [...effectiveSteps]
                    next[index] = value
                    setSteps(next)
                  }}
                >
                  <SelectTrigger className="w-64" size="sm">
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
                {effectiveSteps.length > 2 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove step ${String(index + 1)}`}
                    onClick={() => {
                      setSteps(effectiveSteps.filter((_, i) => i !== index))
                    }}
                  >
                    <X size={16} />
                  </Button>
                ) : null}
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              disabled={effectiveSteps.length >= 8 || available.length === 0}
              onClick={() => {
                const next = available.find((e) => !effectiveSteps.includes(e.event_name))
                setSteps([...effectiveSteps, next?.event_name ?? available[0]?.event_name ?? ''])
              }}
            >
              <Plus size={16} /> Add step
            </Button>
          </div>

          <div className="max-w-48">
            <Label htmlFor="funnel-window" className="text-xs">
              Conversion window
            </Label>
            <Select
              value={String(windowHours)}
              onValueChange={(value) => {
                setWindowHours(Number(value))
              }}
            >
              <SelectTrigger id="funnel-window" className="mt-1.5 w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((option) => (
                  <SelectItem key={option.hours} value={String(option.hours)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              How long someone has to reach the next step before they stop counting.
            </p>
          </div>
        </section>

        <section className="rounded-md border bg-card">
          <div className="border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">Conversion</h2>
          </div>

          {available.length === 0 && eventNames.isSuccess ? (
            <EmptyState
              title="No events to build a funnel from"
              description="A funnel needs at least two event types. Install the snippet and send a few events first."
            />
          ) : result.isPending ? (
            <TableSkeleton rows={4} columns={4} />
          ) : result.isError ? (
            <ErrorState
              title="The funnel did not compute"
              description="Funnels read individual events rather than rollups, so a very wide date range can be refused. Try a narrower one."
              error={result.error}
              onRetry={() => void result.refetch()}
            />
          ) : !result.data || result.data.length === 0 ? (
            <EmptyState
              title="Nobody completed the first step"
              description="No user did the first event in this range, so there is nothing to convert from. Try a wider range or a more common first step."
            />
          ) : (
            <ul className="divide-y divide-border">
              {result.data.map((step) => (
                <li key={`${String(step.step_index)}-${step.event_name}`} className="px-4 py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="value w-5 text-xs text-muted-foreground">
                      {step.step_index + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium">{step.event_name}</span>
                    <span className="value text-sm">{formatInteger(step.users)}</span>
                    <span className="value w-16 text-right text-xs text-muted-foreground">
                      {formatPercent(step.conversion_from_first)}
                    </span>
                  </div>

                  <div className="mt-2 ml-8">
                    <div className="h-2 w-full overflow-hidden rounded-sm bg-muted">
                      <div
                        className="h-full bg-chart-1"
                        style={{ width: `${String(step.conversion_from_first * 100)}%` }}
                      />
                    </div>
                    {step.step_index > 0 ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {formatPercent(step.conversion_from_previous)} of the previous step,{' '}
                        {formatPercent(1 - step.conversion_from_previous)} dropped off
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
