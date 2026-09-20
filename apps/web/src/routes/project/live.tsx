import { Pause, Play } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { TableSkeleton } from '@/components/feedback/skeletons'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useLiveEvents, type LiveEvent } from '@/features/analytics/api'
import { useProject } from '@/features/projects/api'
import { formatRelative } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { formatInProjectZone, timeZoneLabel } from '@/lib/tz'

const MAX_ROWS = 200

/**
 * The live feed.
 *
 * Realtime rather than polling: Supabase evaluates row level security per subscriber, so
 * the stream is already scoped to this project without a filter we would have to trust.
 *
 * Pausing stops the list moving without unsubscribing, because the reason people pause is
 * to read a row that keeps scrolling away, not to stop receiving data.
 */
export function LiveRoute() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const project = useProject(projectId)
  const initial = useLiveEvents(projectId, 100)

  const [streamed, setStreamed] = useState<LiveEvent[]>([])
  const [paused, setPaused] = useState(false)
  // "Listening" has to mean the websocket is actually subscribed, not that the component
  // rendered. Otherwise someone whose connection failed sits watching a healthy looking
  // header that will never show an event.
  const [connection, setConnection] = useState<'connecting' | 'live' | 'error'>('connecting')
  const [filter, setFilter] = useState('')
  const [inspecting, setInspecting] = useState<LiveEvent | null>(null)
  // The realtime callback is created once when the subscription is set up, so it would
  // otherwise close over the initial value of `paused` forever. A ref keeps the callback
  // reading the current value without tearing down and rebuilding the subscription every
  // time someone pauses. Written in an effect rather than during render, because a render
  // can be discarded and must not have side effects.
  const pausedRef = useRef(paused)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  const timeZone = project.data?.timezone ?? 'Etc/UTC'

  useEffect(() => {
    if (!projectId) return

    const channel = supabase
      .channel(`live-events-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'events_raw',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (pausedRef.current) return
          setStreamed((previous) => [payload.new as LiveEvent, ...previous].slice(0, MAX_ROWS))
        },
      )
      .subscribe((status) => {
        // supabase-js types this as an enum, so it is compared by value rather than
        // against string literals the enum does not share a type with.
        const state = String(status)
        if (state === 'SUBSCRIBED') setConnection('live')
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') setConnection('error')
        else setConnection('connecting')
      })

    return () => {
      setConnection('connecting')
      void supabase.removeChannel(channel)
    }
  }, [projectId])

  const rows = useMemo(() => {
    const combined = [...streamed, ...(initial.data ?? [])]
    const seen = new Set<string>()
    const deduped = combined.filter((event) => {
      if (seen.has(event.id)) return false
      seen.add(event.id)
      return true
    })

    const needle = filter.trim().toLowerCase()
    if (!needle) return deduped.slice(0, MAX_ROWS)

    return deduped
      .filter(
        (event) =>
          event.event_name.toLowerCase().includes(needle) ||
          event.distinct_id.toLowerCase().includes(needle),
      )
      .slice(0, MAX_ROWS)
  }, [streamed, initial.data, filter])

  const togglePause = useCallback(() => {
    setPaused((previous) => !previous)
  }, [])

  return (
    <>
      <PageHeader
        title="Live"
        meta={timeZoneLabel(timeZone)}
        actions={
          <>
            <Input
              className="h-8 w-56"
              placeholder="Filter by event or user"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value)
              }}
            />
            <Button variant="outline" size="sm" onClick={togglePause}>
              {paused ? <Play size={16} /> : <Pause size={16} />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
          </>
        }
      />

      <div className="p-6">
        <section className="rounded-md border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <span
              aria-hidden
              className={
                paused
                  ? 'size-2 rounded-full bg-muted-foreground'
                  : 'size-2 animate-pulse rounded-full bg-ok'
              }
            />
            <h2 className="text-sm font-medium">
              {paused
                ? 'Paused'
                : connection === 'live'
                  ? 'Listening'
                  : connection === 'error'
                    ? 'Reconnecting'
                    : 'Connecting'}
            </h2>
            {connection === 'error' ? (
              <span className="text-xs text-muted-foreground">
                The live connection dropped. Recent events still load when you refresh.
              </span>
            ) : null}
            <span className="ml-auto text-xs text-muted-foreground">
              {rows.length} event{rows.length === 1 ? '' : 's'}
            </span>
          </div>

          {initial.isPending ? (
            <TableSkeleton rows={8} columns={4} />
          ) : initial.isError ? (
            <ErrorState
              title="The live feed did not start"
              description="The initial load failed, so there is nothing to stream into yet."
              error={initial.error}
              onRetry={() => void initial.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title={filter ? 'Nothing matches that filter' : 'No events yet'}
              description={
                filter
                  ? 'No recent event matches what you typed. Clear the filter to see everything arriving.'
                  : 'Events appear here within a second of arriving. Install the snippet to start collecting.'
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setInspecting(event)
                    }}
                  >
                    <Badge variant="outline" className="shrink-0 font-normal">
                      {event.event_name}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                      {event.distinct_id}
                    </span>
                    <span className="value shrink-0 text-xs text-muted-foreground">
                      {formatInProjectZone(event.received_at, timeZone, 'HH:mm:ss')}
                    </span>
                    <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                      {formatRelative(event.received_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Sheet
        open={inspecting !== null}
        onOpenChange={(open) => {
          if (!open) setInspecting(null)
        }}
      >
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{inspecting?.event_name}</SheetTitle>
            <SheetDescription>
              Exactly what we stored, including the context we derived at the edge.
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-4">
            <pre className="rounded-md border bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
              {JSON.stringify(inspecting, null, 2)}
            </pre>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
