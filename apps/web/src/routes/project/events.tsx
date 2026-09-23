import { ChartSpline, ListFilter } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { TimeSeriesChart } from '@/components/charts/time-series-chart'
import { DataCard } from '@/components/data/data-card'
import { DateRangePicker } from '@/components/data/date-range-picker'
import { RankedCard } from '@/components/data/ranked-card'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { ChartSkeleton } from '@/components/feedback/skeletons'
import { PageHeader } from '@/components/layout/page-header'
import { Provenance } from '@/components/layout/provenance'
import { Button } from '@/components/ui/button'
import {
  useBreakdown,
  useEventNames,
  usePropertyKeys,
  useTimeseries,
} from '@/features/analytics/api'
import { DEFAULT_PRESET, presetById } from '@/features/analytics/date-range'
import {
  ALL_EVENTS,
  ExplorerFilterBar,
  NOTHING,
  type ExplorerFilters,
} from '@/features/analytics/explorer-filters'
import { pivotSeries } from '@/features/analytics/pivot'
import { SaveViewDialog } from '@/features/analytics/save-view-dialog'
import type { SavedViewQuery } from '@/features/analytics/saved-views'
import { SavedViewsCard } from '@/features/analytics/saved-views-card'
import { useProject } from '@/features/projects/api'

const INITIAL: ExplorerFilters = {
  event: ALL_EVENTS,
  filterKey: NOTHING,
  filterValue: '',
  breakdown: NOTHING,
}

export function EventsRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const [filters, setFilters] = useState(INITIAL)
  const [saving, setSaving] = useState(false)

  const range = useMemo(() => presetById(preset).build(), [preset])
  const project = useProject(projectId)
  const eventNames = useEventNames(projectId)
  const propertyKeys = usePropertyKeys(projectId)

  const event = filters.event === ALL_EVENTS ? null : filters.event
  const filterKey = filters.filterKey === NOTHING ? null : filters.filterKey
  const filterValue = filters.filterValue.trim()
  const breakdown = filters.breakdown === NOTHING ? null : filters.breakdown

  const timeseries = useTimeseries(projectId, range, {
    events: event ? [event] : undefined,
    ...(filterKey && filterValue ? { filterKey, filterValue } : {}),
  })
  const breakdownRows = useBreakdown(projectId, range, event, breakdown, 20)

  const timeZone = project.data?.timezone ?? 'Etc/UTC'
  const chart = useMemo(() => pivotSeries(timeseries.data ?? []), [timeseries.data])

  const currentQuery: SavedViewQuery = {
    events: event ? [event] : [],
    filterKey,
    filterValue: filterValue || null,
    breakdown,
    preset,
  }

  const applyView = (query: SavedViewQuery) => {
    setFilters({
      event: query.events[0] ?? ALL_EVENTS,
      filterKey: query.filterKey ?? NOTHING,
      filterValue: query.filterValue ?? '',
      breakdown: query.breakdown ?? NOTHING,
    })
    setPreset(query.preset)
  }

  return (
    <>
      <PageHeader
        title="Events explorer"
        actions={
          <>
            <DateRangePicker value={preset} onChange={setPreset} />
            <Button
              onClick={() => {
                setSaving(true)
              }}
            >
              Save view
            </Button>
          </>
        }
      >
        <Provenance projectId={projectId} timeZone={timeZone} range={range} />
      </PageHeader>

      <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
        <ExplorerFilterBar
          value={filters}
          onChange={setFilters}
          eventNames={(eventNames.data ?? []).map((e) => e.event_name)}
          propertyKeys={(propertyKeys.data ?? []).map((p) => p.prop_key)}
        />

        <DataCard title={`${event ?? 'All events'} over time`}>
          {timeseries.isPending ? (
            <ChartSkeleton />
          ) : timeseries.isError ? (
            <ErrorState
              title="The chart did not load"
              description="The query failed. Try again, or pick a shorter range."
              error={timeseries.error}
              onRetry={() => void timeseries.refetch()}
            />
          ) : chart.data.length === 0 ? (
            <EmptyState
              icon={ChartSpline}
              title="Nothing matches"
              description="No events match this event, filter and date range. Pick a longer range or clear the filter."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilters(INITIAL)
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="p-2 pt-4">
              <TimeSeriesChart
                data={chart.data}
                series={chart.series}
                timeZone={timeZone}
                resolution={chart.resolution}
                label={`${event ?? 'All events'} over time`}
              />
            </div>
          )}
        </DataCard>

        {breakdown ? (
          <RankedCard
            title={`Breakdown by ${breakdown}`}
            icon={ListFilter}
            query={breakdownRows}
            toItems={(rows) =>
              rows.map((r) => ({ label: r.prop_value, value: r.event_count, share: r.share }))
            }
            emptyTitle="No values for this property"
            emptyDescription="This property was not seen on these events in this range. Only indexed properties are aggregated."
          />
        ) : null}

        <SavedViewsCard projectId={projectId} onApply={applyView} />
      </div>

      <SaveViewDialog
        projectId={projectId}
        query={currentQuery}
        open={saving}
        onOpenChange={setSaving}
      />
    </>
  )
}
