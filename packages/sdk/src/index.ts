import type { AnalyticsConfig, TrackedEvent } from './types'

export type { AnalyticsConfig, TrackedEvent }

/**
 * The browser and Node SDK.
 *
 * Three properties matter more than features here.
 *
 * Nothing is lost. Events are buffered, persisted to localStorage, and flushed with
 * sendBeacon on unload, because the most interesting event a user ever fires is usually
 * the last one before they leave the page.
 *
 * Nothing is duplicated. Every event carries an ingest_id generated here, so a retry after
 * a timeout is deduplicated server side rather than counted twice.
 *
 * Nothing blocks. Delivery is fire and forget with backoff. An analytics SDK that can slow
 * down a checkout page is worse than no analytics at all.
 */

const SDK_VERSION = '1.0.0'
const STORAGE_KEY = 'analytics.queue'
const DISTINCT_ID_KEY = 'analytics.distinct_id'
const SESSION_KEY = 'analytics.session_id'
const SESSION_TIMEOUT_MS = 30 * 60 * 1000
const MAX_QUEUE = 500
const MAX_RETRIES = 5

interface StoredSession {
  id: string
  lastSeen: number
}

let config: AnalyticsConfig | null = null
let queue: TrackedEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | undefined
let traits: Record<string, unknown> = {}

const hasWindow = typeof window !== 'undefined'
const hasStorage = (() => {
  try {
    return hasWindow && typeof window.localStorage !== 'undefined'
  } catch {
    // Blocked storage in a privacy mode. The SDK still works, it just forgets.
    return false
  }
})()

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Not cryptographically strong, and it does not need to be: this is an idempotency key,
  // not a secret. Uniqueness within one client is enough.
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function readStorage(key: string): string | null {
  if (!hasStorage) return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  if (!hasStorage) return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Quota exceeded or storage disabled. Dropping a cached id is survivable.
  }
}

/** A stable anonymous id for this browser, until identify() replaces it. */
function distinctId(): string {
  const existing = readStorage(DISTINCT_ID_KEY)
  if (existing) return existing
  const created = `anon_${uuid()}`
  writeStorage(DISTINCT_ID_KEY, created)
  return created
}

/** A session id that expires after 30 minutes of inactivity, the usual convention. */
function sessionId(): string {
  const now = Date.now()
  const raw = readStorage(SESSION_KEY)

  if (raw) {
    try {
      const stored = JSON.parse(raw) as StoredSession
      if (now - stored.lastSeen < SESSION_TIMEOUT_MS) {
        writeStorage(SESSION_KEY, JSON.stringify({ id: stored.id, lastSeen: now }))
        return stored.id
      }
    } catch {
      // Corrupt value. Fall through and start a new session.
    }
  }

  const created = `s_${uuid()}`
  writeStorage(SESSION_KEY, JSON.stringify({ id: created, lastSeen: now }))
  return created
}

function persistQueue(): void {
  if (!config?.persist) return
  try {
    writeStorage(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // Nothing to do. The in-memory queue is still intact.
  }
}

function restoreQueue(): void {
  if (!config?.persist) return
  const raw = readStorage(STORAGE_KEY)
  if (!raw) return
  try {
    const restored = JSON.parse(raw) as TrackedEvent[]
    if (Array.isArray(restored)) queue = restored.slice(-MAX_QUEUE)
  } catch {
    // Unparseable. Better to lose the queue than to crash the host application.
  }
}

function baseContext(): Record<string, unknown> {
  const context: Record<string, unknown> = { sdk: 'web', sdk_version: SDK_VERSION }
  if (hasWindow) {
    context.url = window.location.href
    context.referrer = document.referrer || undefined
  }
  return context
}

function enqueue(event: string, properties?: Record<string, unknown>): void {
  if (!config) {
    console.warn('[analytics] track() called before init(). The event was dropped.')
    return
  }

  queue.push({
    event,
    distinct_id: distinctId(),
    session_id: sessionId(),
    ts: new Date().toISOString(),
    ingest_id: `evt_${uuid()}`,
    properties: { ...traits, ...properties },
    context: baseContext(),
  })

  // A queue that grows without bound in a long lived tab with no network is a memory
  // leak. Oldest events go first: the recent ones are the ones someone is watching for.
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)

  persistQueue()

  if (queue.length >= (config.flushAt ?? 20)) {
    void flush()
  } else {
    scheduleFlush()
  }
}

function scheduleFlush(): void {
  if (flushTimer !== undefined || !config) return
  flushTimer = setTimeout(() => {
    flushTimer = undefined
    void flush()
  }, config.flushInterval ?? 5000)
}

async function deliver(batch: TrackedEvent[], attempt = 0): Promise<void> {
  if (!config) return

  try {
    const response = await fetch(`${config.host}/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({ batch }),
      keepalive: batch.length <= 20,
    })

    if (response.ok) return

    // 4xx means this batch will never be accepted, so retrying is just noise. The one
    // exception is 429, which says "later", not "no".
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      config.onError?.(new Error(`Events rejected with ${String(response.status)}`))
      return
    }

    throw new Error(`Ingest responded ${String(response.status)}`)
  } catch (error) {
    if (attempt >= MAX_RETRIES) {
      config.onError?.(error)
      return
    }

    // Exponential backoff with jitter. Without the jitter, every client that failed
    // during an outage retries in lockstep and knocks the service over again as it
    // recovers.
    const backoff = Math.min(30_000, 2 ** attempt * 500)
    const jitter = Math.random() * backoff * 0.3
    await new Promise((resolve) => setTimeout(resolve, backoff + jitter))
    await deliver(batch, attempt + 1)
  }
}

/** Sends everything buffered. Safe to call at any time. */
export async function flush(): Promise<void> {
  if (!config || queue.length === 0) return

  if (flushTimer !== undefined) {
    clearTimeout(flushTimer)
    flushTimer = undefined
  }

  const batch = queue.splice(0, 500)
  persistQueue()
  await deliver(batch)
}

/**
 * The unload path.
 *
 * fetch() is cancelled when a page goes away, so this uses sendBeacon, which the browser
 * promises to deliver after the document is gone. The key travels in the URL because
 * sendBeacon cannot set headers; this is safe for a pk_live_ key, which is public by
 * design and write only.
 */
function flushOnUnload(): void {
  if (!config || queue.length === 0) return
  if (typeof navigator === 'undefined' || !('sendBeacon' in navigator)) {
    void flush()
    return
  }

  const batch = queue.splice(0, 500)
  persistQueue()

  const blob = new Blob([JSON.stringify({ batch })], { type: 'application/json' })
  const sent = navigator.sendBeacon(
    `${config.host}/ingest?key=${encodeURIComponent(config.key)}`,
    blob,
  )

  // If the beacon was refused, put the events back. They persist to localStorage and go
  // out on the next page load.
  if (!sent) {
    queue = [...batch, ...queue]
    persistQueue()
  }
}

/** Starts the SDK. Call once, as early as possible. */
export function init(options: AnalyticsConfig): void {
  config = {
    flushAt: 20,
    flushInterval: 5000,
    persist: true,
    ...options,
    host: options.host.replace(/\/$/, ''),
  }

  restoreQueue()

  if (hasWindow) {
    // visibilitychange rather than unload: mobile browsers frequently never fire unload,
    // and a backgrounded tab may be killed without warning.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushOnUnload()
    })
    window.addEventListener('pagehide', flushOnUnload)
  }

  // Anything restored from a previous page load goes out now.
  if (queue.length > 0) void flush()
}

/** Records an event. */
export function track(event: string, properties?: Record<string, unknown>): void {
  enqueue(event, properties)
}

/**
 * Attaches a known identity to this browser.
 *
 * Traits are merged into every subsequent event rather than sent once, because the
 * ingestion API stores events and has no separate profile store. This keeps the server
 * side simple at the cost of some repetition on the wire, which compresses away.
 */
export function identify(id: string, newTraits?: Record<string, unknown>): void {
  writeStorage(DISTINCT_ID_KEY, id)
  if (newTraits) traits = { ...traits, ...newTraits }
  enqueue('identify', newTraits)
}

/** Records a page view. */
export function page(properties?: Record<string, unknown>): void {
  const pageProperties = hasWindow
    ? { path: window.location.pathname, title: document.title, ...properties }
    : properties
  enqueue('page_view', pageProperties)
}

/** Forgets the stored identity and session. Call this on sign out. */
export function reset(): void {
  traits = {}
  if (!hasStorage) return
  try {
    window.localStorage.removeItem(DISTINCT_ID_KEY)
    window.localStorage.removeItem(SESSION_KEY)
  } catch {
    // Nothing to do.
  }
}

export default { init, track, identify, page, flush, reset }
