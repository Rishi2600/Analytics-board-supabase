import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { LiveEvent } from './api'

export type Connection = 'connecting' | 'live' | 'error'

const MAX_ROWS = 200

/**
 * Events inserted for this project since the screen opened, newest first.
 *
 * Realtime rather than polling: Supabase evaluates row level security per subscriber, so
 * the stream is already scoped to this project. Pausing stops the list moving without
 * unsubscribing, because people pause to read a row that keeps scrolling away.
 */
export function useLiveStream(projectId: string, paused: boolean) {
  const [streamed, setStreamed] = useState<LiveEvent[]>([])
  // "Listening" must mean the websocket is subscribed, not that the component rendered.
  const [connection, setConnection] = useState<Connection>('connecting')

  // The realtime callback is created once per subscription, so it reads `paused` through a
  // ref instead of rebuilding the subscription every time someone pauses.
  const pausedRef = useRef(paused)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

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
        // supabase-js types this as an enum, so it is compared by value.
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

  return { streamed, connection }
}

/** Streamed and initially loaded events, without duplicates, narrowed by a search term. */
export function mergeLiveEvents(
  streamed: LiveEvent[],
  initial: LiveEvent[],
  filter: string,
): LiveEvent[] {
  const seen = new Set<string>()
  const needle = filter.trim().toLowerCase()

  return [...streamed, ...initial]
    .filter((event) => {
      if (seen.has(event.id)) return false
      seen.add(event.id)
      return (
        !needle ||
        event.event_name.toLowerCase().includes(needle) ||
        event.distinct_id.toLowerCase().includes(needle)
      )
    })
    .slice(0, MAX_ROWS)
}
