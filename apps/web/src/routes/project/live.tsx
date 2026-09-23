import { Pause, Play, Radio, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { DataCard } from '@/components/data/data-card'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { PageHeader } from '@/components/layout/page-header'
import { Provenance } from '@/components/layout/provenance'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useLiveEvents, type LiveEvent } from '@/features/analytics/api'
import { mergeLiveEvents, useLiveStream } from '@/features/analytics/live-stream'
import { useProject } from '@/features/projects/api'
import { formatRelative } from '@/lib/format'
import { formatInProjectZone } from '@/lib/tz'

export function LiveRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const project = useProject(projectId)
  const initial = useLiveEvents(projectId, 100)
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState('')
  const [inspecting, setInspecting] = useState<LiveEvent | null>(null)
  const { streamed, connection } = useLiveStream(projectId, paused)

  const timeZone = project.data?.timezone ?? 'Etc/UTC'
  const rows = useMemo(
    () => mergeLiveEvents(streamed, initial.data ?? [], filter),
    [streamed, initial.data, filter],
  )
  const togglePause = () => {
    setPaused((previous) => !previous)
  }

  const status = paused
    ? 'Paused'
    : connection === 'live'
      ? 'Listening'
      : connection === 'error'
        ? 'Reconnecting'
        : 'Connecting'

  return (
    <>
      <PageHeader
        title="Live"
        actions={
          <>
            <Field className="w-full sm:w-56">
              <FieldLabel htmlFor="live-filter" className="sr-only">
                Filter by event or user
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  id="live-filter"
                  placeholder="Filter by event or user"
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value)
                  }}
                />
              </InputGroup>
            </Field>
            <Button variant="outline" onClick={togglePause}>
              {paused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
          </>
        }
      >
        <Provenance projectId={projectId} timeZone={timeZone} showFreshness={false} />
      </PageHeader>

      <div className="p-4 sm:p-6">
        <DataCard
          title={status}
          description={
            connection === 'error'
              ? 'The live connection dropped. It retries on its own; refresh to load the latest events.'
              : 'Raw events as they arrive, before any aggregation.'
          }
          action={
            <span className="value text-xs text-muted-foreground" aria-live="polite">
              {rows.length} {rows.length === 1 ? 'event' : 'events'}
            </span>
          }
        >
          {initial.isPending ? (
            <TableSkeleton rows={8} columns={3} />
          ) : initial.isError ? (
            <ErrorState
              title="The live feed did not start"
              description="The first load failed, so there is nothing to stream into yet. Try again."
              error={initial.error}
              onRetry={() => void initial.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Radio}
              title={filter ? 'Nothing matches that filter' : 'No events yet'}
              description={
                filter
                  ? `No recent event or user matches "${filter}". Clear the filter to see everything arriving.`
                  : 'Events appear here within a second of arriving. Install the snippet to start collecting.'
              }
              action={
                filter ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFilter('')
                    }}
                  >
                    Clear filter
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="flex flex-col">
              {rows.map((event) => (
                <li key={event.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    className="grid w-full grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 px-4 py-2 text-left outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[minmax(0,12rem)_1fr_auto_auto]"
                    onClick={() => {
                      setInspecting(event)
                    }}
                  >
                    <Badge variant="outline" className="max-w-full font-normal">
                      <span className="truncate">{event.event_name}</span>
                    </Badge>
                    <span className="value text-right text-xs text-muted-foreground sm:order-last">
                      {formatInProjectZone(event.received_at, timeZone, 'HH:mm:ss')}
                    </span>
                    <span className="col-span-2 min-w-0 truncate text-xs text-muted-foreground sm:col-span-1">
                      {event.distinct_id}
                    </span>
                    <span className="hidden text-right text-xs text-muted-foreground sm:block">
                      {formatRelative(event.received_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DataCard>
      </div>

      <Sheet
        open={inspecting !== null}
        onOpenChange={(open) => {
          if (!open) setInspecting(null)
        }}
      >
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="wrap-anywhere">{inspecting?.event_name}</SheetTitle>
            <SheetDescription>
              Exactly what we stored, including what we worked out from the request.
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-4">
            <pre className="rounded-md border bg-muted p-3 font-mono text-xs wrap-anywhere whitespace-pre-wrap">
              {JSON.stringify(inspecting, null, 2)}
            </pre>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
