import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { TimeSeriesChart } from '@/components/charts/time-series-chart'
import { BarList } from '@/components/data/bar-list'
import { DateRangePicker } from '@/components/data/date-range-picker'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { ChartSkeleton, TableSkeleton } from '@/components/feedback/skeletons'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  useBreakdown,
  useEventNames,
  usePropertyKeys,
  useTimeseries,
} from '@/features/analytics/api'
import { DEFAULT_PRESET, presetById } from '@/features/analytics/date-range'
import { pivotSeries } from '@/features/analytics/pivot'
import {
  useCreateSavedView,
  useDeleteSavedView,
  useSavedViews,
  type SavedViewQuery,
} from '@/features/analytics/saved-views'
import { useProject } from '@/features/projects/api'
import { errorMessage } from '@/lib/errors'
import { timeZoneLabel } from '@/lib/tz'

const ALL_EVENTS = '__all__'
const NO_BREAKDOWN = '__none__'

export function EventsRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()

  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const [event, setEvent] = useState<string>(ALL_EVENTS)
  const [filterKey, setFilterKey] = useState<string | null>(null)
  const [filterValue, setFilterValue] = useState('')
  const [breakdown, setBreakdown] = useState<string>(NO_BREAKDOWN)
  const [savingView, setSavingView] = useState(false)
  const [viewName, setViewName] = useState('')
  const [shareView, setShareView] = useState(false)

  const range = useMemo(() => presetById(preset).build(), [preset])
  const project = useProject(projectId)
  const eventNames = useEventNames(projectId)
  const propertyKeys = usePropertyKeys(projectId)
  const savedViews = useSavedViews(projectId)
  const createView = useCreateSavedView(projectId)
  const deleteView = useDeleteSavedView(projectId)

  const selectedEvents = event === ALL_EVENTS ? undefined : [event]
  const activeFilter =
    filterKey && filterValue.trim() ? { filterKey, filterValue: filterValue.trim() } : {}

  const timeseries = useTimeseries(projectId, range, { events: selectedEvents, ...activeFilter })
  const breakdownRows = useBreakdown(
    projectId,
    range,
    event === ALL_EVENTS ? null : event,
    breakdown === NO_BREAKDOWN ? null : breakdown,
    20,
  )

  const timeZone = project.data?.timezone ?? 'Etc/UTC'
  const chart = useMemo(() => pivotSeries(timeseries.data ?? []), [timeseries.data])

  const currentQuery: SavedViewQuery = {
    events: selectedEvents ?? [],
    filterKey,
    filterValue: filterValue.trim() || null,
    breakdown: breakdown === NO_BREAKDOWN ? null : breakdown,
    preset,
  }

  const applyView = (query: SavedViewQuery) => {
    setEvent(query.events[0] ?? ALL_EVENTS)
    setFilterKey(query.filterKey)
    setFilterValue(query.filterValue ?? '')
    setBreakdown(query.breakdown ?? NO_BREAKDOWN)
    setPreset(query.preset)
  }

  const onSaveView = async () => {
    try {
      await createView.mutateAsync({
        name: viewName.trim(),
        query: currentQuery,
        isShared: shareView,
      })
      toast.success('View saved')
      setSavingView(false)
      setViewName('')
      setShareView(false)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <>
      <PageHeader
        title="Events explorer"
        meta={timeZoneLabel(timeZone)}
        actions={
          <>
            <DateRangePicker value={preset} onChange={setPreset} />
            <Button
              size="sm"
              onClick={() => {
                setSavingView(true)
              }}
            >
              Save as view
            </Button>
          </>
        }
      />

      <div className="space-y-6 p-6">
        <section className="space-y-4 rounded-md border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48">
              <Label htmlFor="event-select" className="text-xs">
                Event
              </Label>
              <Select value={event} onValueChange={setEvent}>
                <SelectTrigger id="event-select" className="mt-1.5 w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_EVENTS}>All events</SelectItem>
                  {eventNames.data?.map((e) => (
                    <SelectItem key={e.event_name} value={e.event_name}>
                      {e.event_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-40">
              <Label htmlFor="filter-key" className="text-xs">
                Where property
              </Label>
              <Select
                value={filterKey ?? NO_BREAKDOWN}
                onValueChange={(value) => {
                  setFilterKey(value === NO_BREAKDOWN ? null : value)
                }}
              >
                <SelectTrigger id="filter-key" className="mt-1.5 w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BREAKDOWN}>No filter</SelectItem>
                  {propertyKeys.data?.map((p) => (
                    <SelectItem key={p.prop_key} value={p.prop_key}>
                      {p.prop_key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-40">
              <Label htmlFor="filter-value" className="text-xs">
                is
              </Label>
              <Input
                id="filter-value"
                className="mt-1.5 h-8"
                placeholder="value"
                disabled={!filterKey}
                value={filterValue}
                onChange={(e) => {
                  setFilterValue(e.target.value)
                }}
              />
            </div>

            <div className="min-w-40">
              <Label htmlFor="breakdown-select" className="text-xs">
                Break down by
              </Label>
              <Select value={breakdown} onValueChange={setBreakdown}>
                <SelectTrigger id="breakdown-select" className="mt-1.5 w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BREAKDOWN}>Nothing</SelectItem>
                  {propertyKeys.data?.map((p) => (
                    <SelectItem key={p.prop_key} value={p.prop_key}>
                      {p.prop_key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            One property filter at a time. Filters are served from pre-aggregated data, and
            supporting several at once would need a rollup for every combination of properties,
            which is the cardinality problem this system is built to avoid.
          </p>
        </section>

        <section className="rounded-md border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">
              {event === ALL_EVENTS ? 'All events' : event} over time
            </h2>
            <span className="text-xs text-muted-foreground">
              {chart.resolution === 'hour'
                ? 'Hourly'
                : chart.resolution === 'week'
                  ? 'Weekly'
                  : 'Daily'}
            </span>
          </div>

          {timeseries.isPending ? (
            <ChartSkeleton />
          ) : timeseries.isError ? (
            <ErrorState
              title="The chart did not load"
              description="The query failed. A narrower date range often succeeds if this repeats."
              error={timeseries.error}
              onRetry={() => void timeseries.refetch()}
            />
          ) : chart.data.length === 0 ? (
            <EmptyState
              title="Nothing matches"
              description="No events match this combination of event, filter and date range. Try widening the range or clearing the filter."
            />
          ) : (
            <div className="p-2">
              <TimeSeriesChart
                data={chart.data}
                series={chart.series}
                timeZone={timeZone}
                resolution={chart.resolution}
              />
            </div>
          )}
        </section>

        {breakdown === NO_BREAKDOWN ? null : (
          <section className="rounded-md border bg-card">
            <div className="border-b px-4 py-2.5">
              <h2 className="text-sm font-medium">Breakdown by {breakdown}</h2>
            </div>
            {breakdownRows.isPending ? (
              <TableSkeleton rows={6} columns={3} />
            ) : breakdownRows.isError ? (
              <ErrorState
                title="The breakdown did not load"
                error={breakdownRows.error}
                onRetry={() => void breakdownRows.refetch()}
              />
            ) : breakdownRows.data.length === 0 ? (
              <EmptyState
                title="No values for this property"
                description="This property has not been seen on these events in this range. Only indexed properties are rolled up."
              />
            ) : (
              <BarList
                items={breakdownRows.data.map((r) => ({
                  label: r.prop_value,
                  value: r.event_count,
                  share: r.share,
                }))}
              />
            )}
          </section>
        )}

        <section className="rounded-md border bg-card">
          <div className="border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">Saved views</h2>
          </div>
          {savedViews.isPending ? (
            <TableSkeleton rows={3} columns={2} />
          ) : savedViews.isError ? (
            <ErrorState
              title="Saved views did not load"
              error={savedViews.error}
              onRetry={() => void savedViews.refetch()}
            />
          ) : savedViews.data.length === 0 ? (
            <EmptyState
              title="No saved views yet"
              description="Set up a question you ask often, then save it so it is one click away next time."
            />
          ) : (
            <ul className="divide-y divide-border">
              {savedViews.data.map((view) => (
                <li key={view.id} className="group flex items-center gap-3 px-4 py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded-sm text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      applyView(view.query)
                    }}
                  >
                    {view.name}
                  </button>
                  {view.is_shared ? (
                    <span className="text-xs text-muted-foreground">Shared</span>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => {
                      deleteView.mutate(view.id, {
                        onError: (error) => {
                          toast.error(errorMessage(error))
                        },
                      })
                    }}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog open={savingView} onOpenChange={setSavingView}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as view</DialogTitle>
            <DialogDescription>
              Saves the current event, filter, breakdown and date range under a name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="view-name">Name</Label>
              <Input
                id="view-name"
                className="mt-1.5"
                placeholder="Pro plan checkouts"
                value={viewName}
                onChange={(e) => {
                  setViewName(e.target.value)
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-6">
              <div>
                <Label htmlFor="view-shared">Share with the project</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Everyone on this project sees it. Only you can edit or delete it.
                </p>
              </div>
              <Switch id="view-shared" checked={shareView} onCheckedChange={setShareView} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSavingView(false)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void onSaveView()}
              disabled={viewName.trim().length === 0 || createView.isPending}
            >
              {createView.isPending ? 'Saving' : 'Save view'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
