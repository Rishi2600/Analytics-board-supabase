import { z } from 'npm:zod@4.1.13'

/**
 * Validation for the ingestion payload.
 *
 * Every limit here exists because the absence of it has killed an analytics database
 * somewhere. Property key counts and value sizes bound what one customer can do to shared
 * storage; nesting depth bounds what a recursive walk costs; the batch cap bounds how much
 * work one request can ask for.
 */

export const MAX_BATCH_SIZE = 500
export const MAX_BODY_BYTES = 512 * 1024
export const MAX_PROPERTY_KEYS = 64
export const MAX_PROPERTY_VALUE_BYTES = 1024
export const MAX_PROPERTY_DEPTH = 3

/** Events with a ts this far in the past are clamped rather than trusted. */
export const MAX_PAST_SKEW_MS = 7 * 24 * 60 * 60 * 1000
/** Events with a ts this far in the future are clamped rather than trusted. */
export const MAX_FUTURE_SKEW_MS = 60 * 60 * 1000

export const rawEventSchema = z.object({
  event: z.string().min(1).max(64),
  distinct_id: z.string().min(1).max(200),
  session_id: z.string().max(200).nullish(),
  ts: z.string().nullish(),
  ingest_id: z.string().max(128).nullish(),
  properties: z.record(z.string(), z.unknown()).nullish(),
  context: z.record(z.string(), z.unknown()).nullish(),
})

export type RawEvent = z.infer<typeof rawEventSchema>

export const batchSchema = z.object({
  batch: z.array(z.unknown()).min(1).max(MAX_BATCH_SIZE),
})

export interface PropertyProblem {
  reason: string
  detail: string
}

/**
 * Bounds an event's properties.
 *
 * Returns a problem rather than throwing, because one bad event in a batch of fifty must
 * not cost the other forty nine. The caller records the problem against this event and
 * keeps going.
 */
export function validateProperties(
  properties: Record<string, unknown> | null | undefined,
): PropertyProblem | null {
  if (!properties) return null

  const keys = Object.keys(properties)
  if (keys.length > MAX_PROPERTY_KEYS) {
    return {
      reason: 'too_many_properties',
      detail: `${keys.length} properties, the limit is ${MAX_PROPERTY_KEYS}`,
    }
  }

  for (const key of keys) {
    if (key.length > 64) {
      return {
        reason: 'property_key_too_long',
        detail: `"${key.slice(0, 32)}..." exceeds 64 characters`,
      }
    }

    const value = properties[key]
    const depth = valueDepth(value)
    if (depth > MAX_PROPERTY_DEPTH) {
      return {
        reason: 'property_too_deep',
        detail: `"${key}" nests ${depth} levels, the limit is ${MAX_PROPERTY_DEPTH}`,
      }
    }

    const size = new TextEncoder().encode(JSON.stringify(value ?? null)).length
    if (size > MAX_PROPERTY_VALUE_BYTES) {
      return {
        reason: 'property_value_too_large',
        detail: `"${key}" is ${size} bytes, the limit is ${MAX_PROPERTY_VALUE_BYTES}`,
      }
    }
  }

  return null
}

function valueDepth(value: unknown, current = 1): number {
  if (value === null || typeof value !== 'object') return current
  if (current > MAX_PROPERTY_DEPTH + 1) return current

  const entries = Array.isArray(value) ? value : Object.values(value)
  let deepest = current
  for (const entry of entries) {
    deepest = Math.max(deepest, valueDepth(entry, current + 1))
  }
  return deepest
}

export interface ClampedTimestamp {
  ts: string
  clamped: boolean
}

/**
 * Client clocks are wrong constantly: devices with the wrong date, browsers restored from
 * sleep, deliberate tampering. Unclamped skew puts events in buckets that have already
 * been aggregated and charted, and the chart silently becomes wrong.
 *
 * A missing ts is not an error. It means "now", which is the common case for a server side
 * SDK that did not bother to set one.
 */
export function clampTimestamp(
  input: string | null | undefined,
  receivedAt: Date,
): ClampedTimestamp {
  if (!input) return { ts: receivedAt.toISOString(), clamped: false }

  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) {
    return { ts: receivedAt.toISOString(), clamped: true }
  }

  const skew = receivedAt.getTime() - parsed.getTime()
  if (skew > MAX_PAST_SKEW_MS || skew < -MAX_FUTURE_SKEW_MS) {
    return { ts: receivedAt.toISOString(), clamped: true }
  }

  return { ts: parsed.toISOString(), clamped: false }
}

/** Event names are lowercased and trimmed so that "Signup", "signup " and "signup" are
 *  one event rather than three rows in every breakdown. */
export function normalizeEventName(name: string): string {
  return name.trim().toLowerCase().slice(0, 64)
}
