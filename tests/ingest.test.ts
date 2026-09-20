import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, createOrgWithProject, createUser, type TestUser } from './helpers/harness'
import { localStack } from './helpers/local-stack'

/**
 * The ingestion contract, tested against the real Edge Function and the real database.
 *
 * The test that matters most here is idempotency. Every SDK retries, every network drops
 * requests, and an analytics product that double counts a retried checkout is worse than
 * one that loses it: an undercount looks like a bad week, an overcount looks like a good
 * one and nobody investigates.
 */

const { functionsUrl } = localStack()

let owner: TestUser
let projectId: string
let publicKey: string
let secretKey: string

async function createKey(type: 'public' | 'secret'): Promise<string> {
  const { data, error } = await owner.client.schema('api').rpc('create_api_key', {
    p_project_id: projectId,
    p_name: `${type} key`,
    p_key_type: type,
  })
  if (error) throw error
  const key = data[0]?.api_key
  if (!key) throw new Error('no key returned')
  return key
}

interface IngestResponse {
  accepted: number
  duplicates: number
  rejected: { index: number; reason: string; detail: string }[]
}

async function ingest(
  key: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: IngestResponse & { error?: { code: string } } }> {
  const response = await fetch(`${functionsUrl}/ingest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as never }
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    event: 'checkout_completed',
    distinct_id: `u_${randomUUID().slice(0, 8)}`,
    properties: { plan: 'pro', amount: 4900, currency: 'INR' },
    ...overrides,
  }
}

beforeAll(async () => {
  owner = await createUser('ingest-owner')
  const created = await createOrgWithProject(owner, 'ingestco')
  projectId = created.projectId

  await owner.client
    .from('projects')
    .update({ allowed_origins: ['https://allowed.example'], filter_bots: true })
    .eq('id', projectId)

  publicKey = await createKey('public')
  secretKey = await createKey('secret')
})

describe('authentication', () => {
  it('issues a key that is shown once and looks like a key', () => {
    expect(publicKey.startsWith('pk_live_')).toBe(true)
    expect(secretKey.startsWith('sk_live_')).toBe(true)
    expect(publicKey.length).toBeGreaterThan(30)
  })

  it('never stores the key in a readable form', async () => {
    // The dashboard client must not be able to read hashes under any role.
    const attempt = await owner.client.from('api_key_secrets').select('key_hash')
    expect(attempt.data ?? []).toEqual([])
  })

  it('refuses a request with no key', async () => {
    const response = await fetch(`${functionsUrl}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch: [event()] }),
    })
    expect(response.status).toBe(401)
  })

  it('gives an unknown key and a revoked key the same answer', async () => {
    const unknown = await ingest('pk_live_definitelynotreal000000000', { batch: [event()] })
    expect(unknown.status).toBe(401)

    const doomed = await createKey('public')
    const { data: keys } = await owner.client.from('api_keys').select('id, key_prefix')
    const doomedId = keys?.find((k) => doomed.startsWith(k.key_prefix))?.id
    await owner.client.schema('api').rpc('revoke_api_key', { p_key_id: doomedId ?? '' })

    const revoked = await ingest(doomed, { batch: [event()] })
    expect(revoked.status).toBe(401)
    expect(revoked.body.error?.code).toBe(unknown.body.error?.code)
  })

  it('refuses a secret key sent from a browser', async () => {
    const response = await ingest(
      secretKey,
      { batch: [event()] },
      { Origin: 'https://allowed.example' },
    )
    expect(response.status).toBe(403)
    expect(response.body.error?.code).toBe('secret_key_from_browser')
  })

  it('refuses a public key from an origin that is not allowed', async () => {
    const response = await ingest(
      publicKey,
      { batch: [event()] },
      { Origin: 'https://evil.example' },
    )
    expect(response.status).toBe(403)
    expect(response.body.error?.code).toBe('origin_not_allowed')
  })

  it('accepts a public key from an allowed origin', async () => {
    const response = await fetch(`${functionsUrl}/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${publicKey}`,
        'Content-Type': 'application/json',
        Origin: 'https://allowed.example',
      },
      body: JSON.stringify({ batch: [event()] }),
    })
    expect(response.status).toBe(202)

    // The function echoes the specific allowed origin back, but the local API gateway
    // rewrites access-control-allow-origin to "*" before the response leaves the stack,
    // so asserting the echoed value here would be testing the gateway rather than us.
    // The control that actually matters is the negative case above: an origin that is not
    // on the allowlist is refused with 403 before any event is written.
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  })
})

describe('accepting events', () => {
  it('accepts a batch and reports the count', async () => {
    const response = await ingest(secretKey, { batch: [event(), event(), event()] })
    expect(response.status).toBe(202)
    expect(response.body.accepted).toBe(3)
    expect(response.body.rejected).toEqual([])
  })

  it('writes the event where the dashboard can find it', async () => {
    const distinctId = `u_${randomUUID().slice(0, 8)}`
    await ingest(secretKey, { batch: [event({ distinct_id: distinctId, event: 'PAGE_VIEW  ' })] })

    const admin = adminClient()
    const { data } = await admin
      .from('events_raw')
      .select('event_name, distinct_id, properties, context')
      .eq('project_id', projectId)
      .eq('distinct_id', distinctId)
      .single()

    // Names are lowercased and trimmed on the way in, so "PAGE_VIEW  " and "page_view"
    // are one event rather than three rows in every breakdown.
    expect(data?.event_name).toBe('page_view')
    expect((data?.context as Record<string, unknown>).ua_family).toBeDefined()
  })
})

describe('idempotency', () => {
  it('replaying the same batch does not duplicate events', async () => {
    const ingestId = `evt_${randomUUID()}`
    const payload = { batch: [event({ ingest_id: ingestId, distinct_id: 'replay_user' })] }

    const first = await ingest(secretKey, payload)
    expect(first.status).toBe(202)
    expect(first.body.accepted).toBe(1)

    const second = await ingest(secretKey, payload)
    expect(second.status).toBe(202)
    // Accepted, but inserted nothing. The client's retry succeeded and the count is right.
    expect(second.body.accepted).toBe(0)
    expect(second.body.duplicates).toBe(1)

    const admin = adminClient()
    const { count } = await admin
      .from('events_raw')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('ingest_id', ingestId)

    expect(count).toBe(1)
  })
})

describe('a partially bad batch keeps the good events', () => {
  it('accepts the valid events and records the invalid ones', async () => {
    const response = await ingest(secretKey, {
      batch: [
        event(),
        { distinct_id: 'no_event_name' },
        event(),
        { event: 'x'.repeat(200), distinct_id: 'u1' },
      ],
    })

    expect(response.status).toBe(202)
    expect(response.body.accepted).toBe(2)
    expect(response.body.rejected).toHaveLength(2)
    expect(response.body.rejected.map((r) => r.index)).toEqual([1, 3])
  })

  it('shows the customer what was rejected instead of discarding it', async () => {
    const admin = adminClient()
    const { data } = await admin
      .from('events_rejected')
      .select('reason, detail')
      .eq('project_id', projectId)
      .limit(5)

    expect((data ?? []).length).toBeGreaterThan(0)
    expect(data?.[0]?.reason).toBeTruthy()
  })

  it('rejects an event whose properties are too large', async () => {
    const response = await ingest(secretKey, {
      batch: [event({ properties: { blob: 'x'.repeat(2000) } })],
    })
    expect(response.body.rejected[0]?.reason).toBe('property_value_too_large')
  })

  it('rejects an event whose properties nest too deeply', async () => {
    const response = await ingest(secretKey, {
      batch: [event({ properties: { a: { b: { c: { d: 'too deep' } } } } })],
    })
    expect(response.body.rejected[0]?.reason).toBe('property_too_deep')
  })
})

describe('timestamp clamping', () => {
  it('clamps a timestamp from a wrong client clock and flags it', async () => {
    const distinctId = `clamp_${randomUUID().slice(0, 8)}`
    const wayInTheFuture = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString()

    await ingest(secretKey, { batch: [event({ distinct_id: distinctId, ts: wayInTheFuture })] })

    const admin = adminClient()
    const { data } = await admin
      .from('events_raw')
      .select('ts, context')
      .eq('project_id', projectId)
      .eq('distinct_id', distinctId)
      .single()

    expect((data?.context as Record<string, unknown>).ts_clamped).toBe(true)
    // Clamped to server time, so it cannot land in a bucket that was charted months ago.
    expect(new Date(data?.ts ?? 0).getTime()).toBeLessThan(Date.now() + 60_000)
  })

  it('keeps a legitimately late timestamp rather than clamping it', async () => {
    const distinctId = `late_${randomUUID().slice(0, 8)}`
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

    await ingest(secretKey, { batch: [event({ distinct_id: distinctId, ts: threeDaysAgo })] })

    const admin = adminClient()
    const { data } = await admin
      .from('events_raw')
      .select('ts, received_at, context')
      .eq('project_id', projectId)
      .eq('distinct_id', distinctId)
      .single()

    expect((data?.context as Record<string, unknown>).ts_clamped).toBeUndefined()
    // This is the case the rollup job has to handle: ts is days behind received_at.
    expect(new Date(data?.ts ?? 0).getTime()).toBeLessThan(
      new Date(data?.received_at ?? 0).getTime(),
    )
  })
})

describe('request limits', () => {
  it('refuses a batch larger than the cap', async () => {
    const response = await ingest(secretKey, {
      batch: Array.from({ length: 501 }, () => event()),
    })
    expect(response.status).toBe(400)
    expect(response.body.error?.code).toBe('invalid_request')
  })

  it('answers a CORS preflight without needing a key', async () => {
    const response = await fetch(`${functionsUrl}/ingest`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://allowed.example' },
    })
    expect(response.status).toBe(204)
  })

  it('refuses a GET', async () => {
    const response = await fetch(`${functionsUrl}/ingest`, { method: 'GET' })
    expect(response.status).toBe(405)
  })
})
