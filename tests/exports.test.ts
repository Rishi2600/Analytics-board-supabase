import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, createOrgWithProject, createUser, type TestUser } from './helpers/harness'
import { localStack } from './helpers/local-stack'

/**
 * The export pipeline, end to end: request, background work, storage, signed download.
 *
 * The property being tested is not "a file appears". It is that the file is unreachable
 * except through a path that checks project membership and records who downloaded it.
 */

const { functionsUrl, anonKey, apiUrl } = localStack()
const admin = adminClient()

let owner: TestUser
let outsider: TestUser
let projectId: string
let orgId: string
let apiKey: string

async function invoke(
  fn: string,
  body: unknown,
  token: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${functionsUrl}/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  }
}

beforeAll(async () => {
  owner = await createUser('export-owner')
  outsider = await createUser('export-outsider')
  const created = await createOrgWithProject(owner, 'exportco')
  projectId = created.projectId
  orgId = created.orgId

  const key = await owner.client.schema('api').rpc('create_api_key', {
    p_project_id: projectId,
    p_name: 'export test key',
    p_key_type: 'secret',
  })
  if (key.error) throw key.error
  apiKey = key.data[0]?.api_key ?? ''

  await fetch(`${functionsUrl}/ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batch: Array.from({ length: 25 }, (_, i) => ({
        event: 'checkout_completed',
        distinct_id: `u_${String(i)}`,
        ingest_id: randomUUID(),
        properties: { plan: i % 2 === 0 ? 'pro' : 'free' },
      })),
    }),
  })
})

describe('creating an export', () => {
  let exportId: string

  it('records the request immediately, before any work happens', async () => {
    const { data, error } = await owner.client
      .from('exports')
      .insert({
        project_id: projectId,
        kind: 'events',
        format: 'csv',
        params: {
          from: new Date(Date.now() - 86_400_000).toISOString(),
          to: new Date(Date.now() + 86_400_000).toISOString(),
        },
        requested_by: owner.id,
      })
      .select('id, status')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('queued')
    exportId = data?.id ?? ''
  })

  it('runs the export and writes a file', async () => {
    const response = await invoke('export-run', { export_id: exportId }, owner.accessToken)
    expect(response.status).toBe(200)
    expect(Number(response.body.row_count)).toBeGreaterThan(0)

    const { data } = await admin
      .from('exports')
      .select('status, row_count, storage_path')
      .eq('id', exportId)
      .single()

    expect(data?.status).toBe('done')
    expect(data?.storage_path).toContain(projectId)
  })

  it('refuses to run the same export twice', async () => {
    // Claiming flips queued to running in one statement, so a duplicate invocation cannot
    // process the same export and overwrite a finished file.
    const response = await invoke('export-run', { export_id: exportId }, owner.accessToken)
    expect(response.status).toBe(409)
  })

  it('hands out a signed URL that actually downloads the file', async () => {
    const response = await invoke('export-download', { export_id: exportId }, owner.accessToken)
    expect(response.status).toBe(200)

    const url = String(response.body.url)
    expect(url).toContain('token=')

    // Inside the local stack, functions see the API as http://kong:8000, so the signed URL
    // comes back with a hostname only the Docker network can resolve. In a hosted project
    // SUPABASE_URL is the public URL and no rewriting happens. The signature covers the
    // path and expiry, not the host, so swapping it is safe and still tests a real signed
    // download rather than a mock.
    const reachable = url.replace(/^https?:\/\/[^/]+/, apiUrl)

    const file = await fetch(reachable)
    expect(file.ok).toBe(true)
    const csv = await file.text()
    expect(csv).toContain('event_name')
    expect(csv).toContain('checkout_completed')
  })

  it('records who downloaded it', async () => {
    const { data } = await admin
      .from('audit_log')
      .select('action, actor_user_id')
      .eq('org_id', orgId)
      .eq('action', 'export.downloaded')

    expect((data ?? []).length).toBeGreaterThan(0)
    expect(data?.[0]?.actor_user_id).toBe(owner.id)
  })

  it('refuses a download to someone outside the organization', async () => {
    const response = await invoke('export-download', { export_id: exportId }, outsider.accessToken)
    expect(response.status).toBe(403)
  })

  it('refuses a download with no session at all', async () => {
    const response = await fetch(`${functionsUrl}/export-download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ export_id: exportId }),
    })
    expect(response.ok).toBe(false)
  })
})

describe('every kind of export the reports screen offers', () => {
  // Timeseries and breakdown exports read the rollup tables through the api schema, as the
  // service role. They failed on every run until that role was granted the schema.
  beforeAll(async () => {
    const { error } = await admin.schema('jobs').rpc('run_project_rollup', {
      p_project_id: projectId,
      p_lag: '0 seconds',
    })
    if (error) throw error
  })

  const range = {
    from: new Date(Date.now() - 86_400_000).toISOString(),
    to: new Date(Date.now() + 86_400_000).toISOString(),
  }

  for (const [kind, params] of [
    ['timeseries', range],
    ['breakdown', { ...range, event: 'checkout_completed', prop: 'plan' }],
  ] as const) {
    it(`builds a ${kind} file with rows in it`, async () => {
      const created = await owner.client
        .from('exports')
        .insert({ project_id: projectId, kind, format: 'csv', params, requested_by: owner.id })
        .select('id')
        .single()
      expect(created.error).toBeNull()

      const response = await invoke(
        'export-run',
        { export_id: created.data?.id },
        owner.accessToken,
      )
      expect(response.status).toBe(200)
      expect(Number(response.body.row_count)).toBeGreaterThan(0)
    })
  }
})

describe('the exports bucket is not directly readable', () => {
  it('does not let a signed-in user list or fetch objects without going through the server', async () => {
    // The bucket has no storage policies at all, so this is the only path that exists.
    const listed = await owner.client.storage.from('exports').list(projectId)
    expect(listed.data ?? []).toEqual([])
  })
})

describe('saved views respect authorship', () => {
  it('lets a member save and reload a view', async () => {
    const created = await owner.client
      .from('saved_views')
      .insert({
        project_id: projectId,
        name: 'Pro checkouts',
        query: { events: ['checkout_completed'], filterKey: 'plan', filterValue: 'pro' },
        created_by: owner.id,
        is_shared: false,
      })
      .select('id, query')
      .single()

    expect(created.error).toBeNull()

    const reloaded = await owner.client
      .from('saved_views')
      .select('query')
      .eq('id', created.data?.id ?? '')
      .single()

    // A saved view has to reload identically or it is not a saved view.
    expect(reloaded.data?.query).toEqual(created.data?.query)
  })

  it('hides an unshared view from everyone else in the project', async () => {
    const member = await createUser('view-member')
    await admin.from('org_members').insert({ org_id: orgId, user_id: member.id, role: 'member' })

    const seen = await member.client.from('saved_views').select('id')
    expect(seen.data ?? []).toEqual([])
  })
})
