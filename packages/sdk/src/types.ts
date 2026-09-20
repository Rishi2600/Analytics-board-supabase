export interface AnalyticsConfig {
  /** A public key, pk_live_*. Safe to ship in browser code. */
  key: string
  /** Base URL of the ingestion API, for example https://abc.supabase.co/functions/v1 */
  host: string
  /** Flush once this many events are buffered. */
  flushAt?: number
  /** Flush at least this often, in milliseconds. */
  flushInterval?: number
  /** Persist the queue to localStorage so a refresh does not lose events. */
  persist?: boolean
  /** Called when a batch could not be delivered after every retry. */
  onError?: (error: unknown) => void
}

export interface TrackedEvent {
  event: string
  distinct_id: string
  session_id?: string
  ts: string
  ingest_id: string
  properties?: Record<string, unknown>
  context?: Record<string, unknown>
}
