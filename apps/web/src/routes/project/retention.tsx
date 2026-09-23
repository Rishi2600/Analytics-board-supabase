import { addMonths, addWeeks, format, isAfter, parseISO } from 'date-fns'
import { Repeat } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { DataCard } from '@/components/data/data-card'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { PageHeader } from '@/components/layout/page-header'
import { Provenance } from '@/components/layout/provenance'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useEventNames, useRetention } from '@/features/analytics/api'
import { presetById } from '@/features/analytics/date-range'
import { RetentionTable, type CohortRow } from '@/features/analytics/retention-table'
import { useProject } from '@/features/projects/api'

const PERIODS = 8

export function RetentionRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [cohortEvent, setCohortEvent] = useState('')
  const [returnEvent, setReturnEvent] = useState('')

  // Cohorts need history, so this screen always looks back 90 days.
  const range = useMemo(() => presetById('90d').build(), [])
  const project = useProject(projectId)
  const eventNames = useEventNames(projectId)

  const available = (eventNames.data ?? []).map((e) => e.event_name)
  const cohort = cohortEvent || available[0] || ''
  const returning = returnEvent || available[0] || ''
  const retention = useRetention(projectId, cohort, returning, PERIODS, period, range)
  const timeZone = project.data?.timezone ?? 'Etc/UTC'

  const rows = useMemo(() => {
    const byCohort = new Map<string, CohortRow>()
    for (const cell of retention.data ?? []) {
      const row = byCohort.get(cell.cohort_start) ?? {
        label: format(parseISO(cell.cohort_start), period === 'week' ? 'd MMM yyyy' : 'MMM yyyy'),
        size: cell.cohort_size,
        rates: new Map<number, number>(),
      }
      // A cohort from last week has no week five yet. The function still returns a zero for
      // it, which would read as "nobody came back", so unreached periods are left out.
      const start = parseISO(cell.cohort_start)
      const periodStart =
        period === 'week'
          ? addWeeks(start, cell.period_number)
          : addMonths(start, cell.period_number)
      if (!isAfter(periodStart, new Date())) row.rates.set(cell.period_number, cell.rate)
      byCohort.set(cell.cohort_start, row)
    }
    return [...byCohort.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .map(([, row]) => row)
  }, [retention.data, period])

  return (
    <>
      <PageHeader
        title="Retention"
        actions={
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            aria-label="Cohort period"
            value={period}
            onValueChange={(value) => {
              if (value === 'week' || value === 'month') setPeriod(value)
            }}
          >
            <ToggleGroupItem value="week">Weekly</ToggleGroupItem>
            <ToggleGroupItem value="month">Monthly</ToggleGroupItem>
          </ToggleGroup>
        }
      >
        <Provenance projectId={projectId} timeZone={timeZone} range={range} showFreshness={false} />
      </PageHeader>

      <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <Card size="sm">
          <CardContent>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <EventField
                id="cohort-event"
                label="Cohort by their first"
                value={cohort}
                options={available}
                onChange={setCohortEvent}
              />
              <EventField
                id="return-event"
                label="Count them as back when they"
                value={returning}
                options={available}
                onChange={setReturnEvent}
              />
            </FieldGroup>
            <FieldDescription className="mt-3 text-xs">
              A person joins the cohort of their first ever cohort event, not their first one in
              this range, so nobody moves between cohorts when the dates change.
            </FieldDescription>
          </CardContent>
        </Card>

        <DataCard title="Cohorts">
          {eventNames.isSuccess && available.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="No events to build cohorts from"
              description="Retention needs at least one kind of event. Install the snippet and send some first."
            />
          ) : retention.isPending ? (
            <TableSkeleton rows={6} columns={6} />
          ) : retention.isError ? (
            <ErrorState
              title="Retention did not compute"
              description="Retention reads individual events rather than aggregates, so it can time out on a large project. Try again."
              error={retention.error}
              onRetry={() => void retention.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="No cohorts in the last 90 days"
              description="Nobody did the cohort event for the first time in the last 90 days. Pick a different first event above."
            />
          ) : (
            <RetentionTable rows={rows} period={period} periods={PERIODS} />
          )}
        </DataCard>
      </div>
    </>
  )
}

function EventField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}
