import { extractKey, loadProjectSettings, resolveKey, serviceClient } from '../_shared/auth.ts'
import { corsHeaders, originAllowed, preflightResponse } from '../_shared/cors.ts'
import { clientCountry, clientIp, hashIp, isBot, parseUserAgent } from '../_shared/enrich.ts'
import { logRequest } from '../_shared/log.ts'
import { ERROR_CODES, errorResponse, jsonResponse } from '../_shared/responses.ts'
import {
  MAX_BATCH_SIZE,
  MAX_BODY_BYTES,
  batchSchema,
  clampTimestamp,
  normalizeEventName,
  rawEventSchema,
  validateProperties,
} from '../_shared/validation.ts'

/**
 * The ingestion endpoint.
 *
 * POST /functions/v1/ingest
 *
 * Two rules shape everything here.
 *
 * First, this function must never block. No rollup work, no outbound calls, no reads of
 * user data. It validates, enriches, writes, and returns. Anything slower belongs in a
 * scheduled job, because the customer's application is waiting on this response and a slow
 * analytics endpoint becomes a slow checkout page.
 *
 * Second, a partially bad batch is never failed wholesale. Good events are kept and bad
 * ones are written to events_rejected with a reason, so the customer finds out from their
 * ingestion health screen today rather than from a missing number in three weeks.
 */

// Portfolio scale defaults. Per project overrides belong in the projects table when there
// is a customer who needs one.
const RATE_LIMIT_CAPACITY = 500 // burst
const RATE_LIMIT_REFILL_PER_SECOND = 100 // sustained events per second

interface PreparedEvent {
  event_name: string
  distinct_id: string
  session_id: string | null
  ts: string
  received_at: string
  properties: Record<string, unknown>
  context: Record<string, unknown>
  ip_hash: string | null
  ingest_id: string | null
}

interface RejectedEvent {
  reason: string
  detail: string
  raw_payload: unknown
  index: number
}

Deno.serve(async (request: Request): Promise<Response> => {
  const startedAt = performance.now()
  const origin = request.headers.get('origin')

  // --- 1. CORS preflight -------------------------------------------------
  // Answered before anything else and without touching the database. The browser does not
  // send the Authorization header on a preflight, so the origin is enforced on the POST.
  if (request.method === 'OPTIONS') return preflightResponse(origin)

  if (request.method !== 'POST') {
    return errorResponse(ERROR_CODES.methodNotAllowed, 'This endpoint accepts POST.', 405)
  }

  try {
    // --- 2. Body size guard ----------------------------------------------
    // Checked before parsing. Parsing a 50MB body to discover it is too large is the
    // cheapest denial of service there is.
    const declaredLength = Number(request.headers.get('content-length') ?? '0')
    if (declaredLength > MAX_BODY_BYTES) {
      logRequest({
        fn: 'ingest',
        outcome: 'rejected',
        status: 413,
        duration_ms: performance.now() - startedAt,
        error_code: ERROR_CODES.payloadTooLarge,
      })
      return errorResponse(
        ERROR_CODES.payloadTooLarge,
        `The body is larger than ${MAX_BODY_BYTES} bytes. Send fewer events per request.`,
        413,
      )
    }

    const bodyText = await request.text()
    if (new TextEncoder().encode(bodyText).length > MAX_BODY_BYTES) {
      return errorResponse(
        ERROR_CODES.payloadTooLarge,
        `The body is larger than ${MAX_BODY_BYTES} bytes. Send fewer events per request.`,
        413,
      )
    }

    // --- 3. Key resolution -----------------------------------------------
    const presentedKey = extractKey(request)
    if (!presentedKey) {
      return errorResponse(
        ERROR_CODES.unauthorized,
        'Send your project API key as a bearer token or in the X-API-Key header.',
        401,
      )
    }

    const resolved = await resolveKey(presentedKey)
    if (!resolved) {
      // Unknown, revoked and malformed all land here with the same response. Telling the
      // caller which one it was turns this endpoint into a key oracle.
      logRequest({
        fn: 'ingest',
        outcome: 'unauthorized',
        status: 401,
        duration_ms: performance.now() - startedAt,
        error_code: ERROR_CODES.unauthorized,
      })
      return errorResponse(ERROR_CODES.unauthorized, 'This API key is not valid.', 401)
    }

    const settings = await loadProjectSettings(resolved.projectId)
    const cors = corsHeaders(origin, settings.allowed_origins)

    // A secret key must never be used from a browser. If an Origin header is present, the
    // key is in client side code, and accepting it would let a customer ship a credential
    // that can be read by anyone who opens developer tools.
    if (resolved.keyType === 'secret' && origin) {
      return errorResponse(
        ERROR_CODES.secretKeyFromBrowser,
        'Secret keys cannot be used from a browser. Use a public key (pk_live_) in client code.',
        403,
      )
    }

    if (
      resolved.keyType === 'public' &&
      origin &&
      !originAllowed(origin, settings.allowed_origins)
    ) {
      return errorResponse(
        ERROR_CODES.originNotAllowed,
        `${origin} is not in this project's allowed origins. Add it in project settings.`,
        403,
      )
    }

    // --- 5a. Parse the body ----------------------------------------------
    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(bodyText)
    } catch {
      return errorResponse(ERROR_CODES.invalidJson, 'The body is not valid JSON.', 400, cors)
    }

    const batchResult = batchSchema.safeParse(parsedBody)
    if (!batchResult.success) {
      return errorResponse(
        ERROR_CODES.invalidRequest,
        `Send { "batch": [ ... ] } with between 1 and ${MAX_BATCH_SIZE} events.`,
        400,
        cors,
      )
    }
    const batch = batchResult.data.batch

    // --- 4. Rate limit ---------------------------------------------------
    // One atomic call. The cost is the size of the batch, so a client cannot get around
    // the limit by packing more events into fewer requests.
    const client = serviceClient()
    const { data: rateLimit, error: rateLimitError } = await client
      .schema('jobs')
      .rpc('consume_rate_limit', {
        p_api_key_id: resolved.apiKeyId,
        p_capacity: RATE_LIMIT_CAPACITY,
        p_refill_per_second: RATE_LIMIT_REFILL_PER_SECOND,
        p_cost: batch.length,
      })
    if (rateLimitError) throw rateLimitError

    const limit = (
      rateLimit as { allowed: boolean; remaining: number; retry_after_seconds: number }[]
    )[0]
    if (limit && !limit.allowed) {
      logRequest({
        fn: 'ingest',
        outcome: 'rate_limited',
        status: 429,
        duration_ms: performance.now() - startedAt,
        project_id: resolved.projectId,
        api_key_id: resolved.apiKeyId,
        error_code: ERROR_CODES.rateLimited,
      })
      return errorResponse(
        ERROR_CODES.rateLimited,
        'This key is sending events faster than its limit. Retry after the interval below.',
        429,
        {
          ...cors,
          'Retry-After': String(limit.retry_after_seconds),
          'X-RateLimit-Remaining': String(limit.remaining),
        },
      )
    }

    // --- 5b, 6, 7. Validate, clamp, enrich -------------------------------
    const receivedAt = new Date()
    const userAgent = request.headers.get('user-agent')
    const agent = parseUserAgent(userAgent)
    const country = clientCountry(request)
    const salt = Deno.env.get('INGEST_IP_HASH_SALT') ?? 'local-development-salt'
    const ipHash = await hashIp(clientIp(request), salt)

    const prepared: PreparedEvent[] = []
    const rejected: RejectedEvent[] = []

    for (const [index, candidate] of batch.entries()) {
      const parsed = rawEventSchema.safeParse(candidate)
      if (!parsed.success) {
        rejected.push({
          index,
          reason: 'invalid_event',
          detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          raw_payload: truncate(candidate),
        })
        continue
      }

      const event = parsed.data

      const propertyProblem = validateProperties(event.properties)
      if (propertyProblem) {
        rejected.push({
          index,
          reason: propertyProblem.reason,
          detail: propertyProblem.detail,
          raw_payload: truncate(candidate),
        })
        continue
      }

      // Bot filtering is a project setting rather than a global rule, because a customer
      // measuring a documentation site may genuinely want crawler traffic counted.
      if (settings.filter_bots && userAgent && isBot(userAgent)) {
        rejected.push({
          index,
          reason: 'bot_filtered',
          detail: 'The user agent matched a known bot and bot filtering is on for this project.',
          raw_payload: truncate(candidate),
        })
        continue
      }

      const { ts, clamped } = clampTimestamp(event.ts, receivedAt)

      prepared.push({
        event_name: normalizeEventName(event.event),
        distinct_id: event.distinct_id,
        session_id: event.session_id ?? null,
        ts,
        received_at: receivedAt.toISOString(),
        properties: event.properties ?? {},
        context: {
          ...(event.context ?? {}),
          ua_family: agent.ua_family,
          os: agent.os,
          device_type: agent.device_type,
          ...(country ? { country } : {}),
          // Recorded rather than hidden. A chart built on clamped timestamps is still
          // worth flagging when someone asks why a spike landed where it did.
          ...(clamped ? { ts_clamped: true } : {}),
        },
        ip_hash: ipHash,
        ingest_id: event.ingest_id ?? null,
      })
    }

    // --- 8. Insert -------------------------------------------------------
    // One statement for the accepted rows, with ON CONFLICT DO NOTHING on
    // (project_id, ingest_id). A replayed batch therefore inserts nothing and still
    // returns success, which is what makes client side retries safe.
    const { data: insertedCount, error: insertError } = await client
      .schema('jobs')
      .rpc('ingest_batch', {
        p_project_id: resolved.projectId,
        p_api_key_id: resolved.apiKeyId,
        p_events: prepared,
        p_rejected: rejected.map(({ reason, detail, raw_payload }) => ({
          reason,
          detail,
          raw_payload,
        })),
      })
    if (insertError) throw insertError

    // Fire and forget: last_used_at is useful but nobody should wait on it. The function
    // itself only writes once a minute per key.
    client
      .schema('jobs')
      .rpc('touch_api_key', { p_key_id: resolved.apiKeyId })
      .then(() => undefined)
      .catch(() => undefined)

    const accepted = typeof insertedCount === 'number' ? insertedCount : prepared.length
    const duration = performance.now() - startedAt

    logRequest({
      fn: 'ingest',
      outcome: 'accepted',
      status: 202,
      duration_ms: duration,
      project_id: resolved.projectId,
      api_key_id: resolved.apiKeyId,
      key_type: resolved.keyType,
      accepted,
      rejected: rejected.length,
    })

    // --- 9. Respond ------------------------------------------------------
    // 202 rather than 200: the events are accepted and durable, but they are not yet
    // aggregated, so they will not appear in a rollup driven chart for a few minutes.
    return jsonResponse(
      {
        accepted,
        // Deduplicated events are accepted but not inserted. Reporting the difference
        // explicitly stops a client concluding its retries are being dropped.
        duplicates: prepared.length - accepted,
        rejected: rejected.map(({ index, reason, detail }) => ({ index, reason, detail })),
      },
      202,
      cors,
    )
  } catch (error) {
    // Supabase returns PostgrestError objects rather than Error instances, so a plain
    // instanceof check here would log "unknown failure" for the most common failure.
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null
          ? JSON.stringify(error)
          : String(error)
    logRequest({
      fn: 'ingest',
      outcome: 'error',
      status: 500,
      duration_ms: performance.now() - startedAt,
      error_code: ERROR_CODES.internalError,
      message,
    })
    // The caller gets a stable code and nothing about our internals.
    return errorResponse(
      ERROR_CODES.internalError,
      'We could not accept this batch. It was not recorded, so retrying is safe.',
      500,
    )
  }
})

/** events_rejected keeps a truncated copy so the customer can see what they sent. */
function truncate(value: unknown): unknown {
  const text = JSON.stringify(value ?? null)
  if (text.length <= 8192) return value
  return { truncated: true, preview: text.slice(0, 8192) }
}
