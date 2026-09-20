import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, createOrgWithProject, createUser, type TestUser } from './helpers/harness'
import { localStack } from './helpers/local-stack'

/**
 * The aggregation contract.
 *
 * The headline test here is the 21 day late event. A job that walks ts instead of
 * received_at passes every other test in this file and silently loses that event forever,
 * which is precisely why it gets its own section.
 */

const { functionsUrl } = localStack()
const admin = adminClient()

let owner: TestUser
let projectId: string
let apiKey: string

const DAY_MS = 86_400_000

async function runRollup(): Promise<void> {
  // Zero lag. In production the job leaves a ten second margin so it never reads a window
  // that still has inserts in flight; here the test controls exactly what has been written
  // and wants a deterministic answer rather than a wait.
  const { error } = await admin.schema('jobs').rpc('run_project_rollup', {
    p_project_id: projectId,
    p_lag: '0 seconds',
  })
  if (error) throw error
}

async function send(events: Record<string, unknown>[]): Promise<void> {
  const response = await fetch(`${functionsUrl}/ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch: events }),
  })
  if (!response.ok) throw new Error(`ingest responded ${String(response.status)}`)
}

/** Total events the rollup believes exist, for one UTC hour. */
async function hourlyCount(bucket: Date): Promise<number> {
  const { data, error } = await admin
    .from('rollup_events_hourly')
    .select('event_count')
    .eq('project_id', projectId)
    .eq('bucket', bucket.toISOString())
  if (error) throw error
  return (data ?? []).reduce((sum, row) => sum + Number(row.event_count), 0)
}

function truncateToHour(date: Date): Date {
  const copy = new Date(date)
  copy.setUTCMinutes(0, 0, 0)
  return copy
}

beforeAll(async () => {
  owner = await createUser('rollup-owner')
  const created = await createOrgWithProject(owner, 'rollupco')
  projectId = created.projectId

  const { data, error } = await owner.client.schema('api').rpc('create_api_key', {
    p_project_id: projectId,
    p_name: 'rollup test key',
    p_key_type: 'secret',
  })
  if (error) throw error
  apiKey = data[0]?.api_key ?? ''
})

describe('aggregation is correct', () => {
  it('rolls up events into hourly buckets', async () => {
    const ts = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await send([
      { event: 'page_view', distinct_id: 'u1', ts: ts.toISOString(), ingest_id: randomUUID() },
      { event: 'page_view', distinct_id: 'u2', ts: ts.toISOString(), ingest_id: randomUUID() },
      { event: 'signup', distinct_id: 'u1', ts: ts.toISOString(), ingest_id: randomUUID() },
    ])

    await runRollup()

    expect(await hourlyCount(truncateToHour(ts))).toBe(3)
  })

  it('agrees with the raw events it was built from', async () => {
    // The single most valuable assertion in this file: the rollup is a pure function of
    // the events. If these ever disagree, every number in the product is suspect.
    const { count: rawCount } = await admin
      .from('events_raw')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)

    const { data } = await admin
      .from('rollup_events_hourly')
      .select('event_count')
      .eq('project_id', projectId)

    const rollupTotal = (data ?? []).reduce((sum, row) => sum + Number(row.event_count), 0)
    expect(rollupTotal).toBe(rawCount)
  })

  it('is idempotent: running it again changes nothing', async () => {
    const before = await admin
      .from('rollup_events_hourly')
      .select('bucket, event_name, event_count')
      .eq('project_id', projectId)
      .order('bucket')

    await runRollup()
    await runRollup()

    const after = await admin
      .from('rollup_events_hourly')
      .select('bucket, event_name, event_count')
      .eq('project_id', projectId)
      .order('bucket')

    expect(after.data).toEqual(before.data)
  })
})

describe('late arriving data', () => {
  it('puts a 21 day late event in its correct historical bucket', async () => {
    const lateTs = new Date(Date.now() - 21 * DAY_MS)
    const bucket = truncateToHour(lateTs)

    // Roll up first, so the watermark is past this point in time. A job keyed on ts would
    // now refuse to look backwards, which is the bug this test exists to catch.
    await runRollup()
    const before = await hourlyCount(bucket)

    // The ingest endpoint clamps anything older than 7 days, which is the right behaviour
    // for a wrong client clock but would mask what is being tested here. This is a
    // genuinely late delivery of a genuinely old event, so it is written directly with an
    // old ts and a received_at of now, exactly as a re-delivered batch would look.
    const { error } = await admin.from('events_raw').insert({
      project_id: projectId,
      event_name: 'late_arrival',
      distinct_id: 'offline_phone',
      session_id: 's_late',
      ts: lateTs.toISOString(),
      received_at: new Date().toISOString(),
      properties: {},
      context: { sdk: 'test' },
      ingest_id: `late_${randomUUID()}`,
    })
    expect(error).toBeNull()

    await runRollup()

    const after = await hourlyCount(bucket)
    expect(after).toBe(before + 1)
  })

  it('counts the late event on the day it happened, not the day it arrived', async () => {
    const lateDay = new Date(Date.now() - 21 * DAY_MS).toISOString().slice(0, 10)

    const { data } = await admin
      .from('user_activity_daily')
      .select('distinct_id')
      .eq('project_id', projectId)
      .eq('day', lateDay)
      .eq('distinct_id', 'offline_phone')

    expect(data).toHaveLength(1)
  })
})

describe('unique users are not summed', () => {
  it('counts a user once per day no matter how many hours they were active in', async () => {
    const day = new Date(Date.now() - 3 * DAY_MS)
    const user = `multi_hour_${randomUUID().slice(0, 6)}`

    // Same user, three different hours of the same day.
    for (const hourOffset of [1, 5, 9]) {
      const ts = new Date(day.getTime() + hourOffset * 60 * 60 * 1000)
      const { error } = await admin.from('events_raw').insert({
        project_id: projectId,
        event_name: 'page_view',
        distinct_id: user,
        ts: ts.toISOString(),
        received_at: new Date().toISOString(),
        properties: {},
        context: {},
        ingest_id: `multi_${randomUUID()}`,
      })
      expect(error).toBeNull()
    }

    await runRollup()

    const { data } = await admin
      .from('user_activity_daily')
      .select('distinct_id')
      .eq('project_id', projectId)
      .eq('day', day.toISOString().slice(0, 10))
      .eq('distinct_id', user)

    // One row, not three. Summing unique counts across hourly buckets would say three.
    expect(data).toHaveLength(1)
  })
})

describe('job bookkeeping', () => {
  it('records every run, so a stalled job is visible', async () => {
    const { data } = await admin
      .from('rollup_runs')
      .select('job_name, status, rows_read, duration_ms')
      .eq('project_id', projectId)
      .order('started_at', { ascending: false })
      .limit(1)

    expect(data?.[0]?.status).toBe('ok')
    expect(data?.[0]?.job_name).toBe('hourly')
    expect(typeof data?.[0]?.duration_ms).toBe('number')
  })

  it('bumps the project cache epoch so cached queries are invalidated', async () => {
    const before = await admin.from('projects').select('cache_epoch').eq('id', projectId).single()

    await admin.from('events_raw').insert({
      project_id: projectId,
      event_name: 'epoch_check',
      distinct_id: 'u_epoch',
      ts: new Date().toISOString(),
      received_at: new Date().toISOString(),
      properties: {},
      context: {},
      ingest_id: `epoch_${randomUUID()}`,
    })
    await runRollup()

    const after = await admin.from('projects').select('cache_epoch').eq('id', projectId).single()
    expect(Number(after.data?.cache_epoch)).toBeGreaterThan(Number(before.data?.cache_epoch))
  })

  it('does not let a dashboard client move a watermark', async () => {
    // rollup_state has row level security enabled and no policy at all. A client that
    // could move a watermark could make us skip or redo arbitrary windows.
    const attempt = await owner.client.from('rollup_state').select('watermark')
    expect(attempt.data ?? []).toEqual([])
  })
})

describe('the backfill path', () => {
  it('recomputes a range regardless of the watermark', async () => {
    const from = new Date(Date.now() - 22 * DAY_MS)
    const to = new Date(Date.now() - 20 * DAY_MS)

    const { error } = await admin.schema('jobs').rpc('backfill_range', {
      p_project_id: projectId,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    })
    expect(error).toBeNull()

    // The late event from earlier is inside this range and must survive a recompute.
    const bucket = truncateToHour(new Date(Date.now() - 21 * DAY_MS))
    expect(await hourlyCount(bucket)).toBeGreaterThan(0)
  })
})
