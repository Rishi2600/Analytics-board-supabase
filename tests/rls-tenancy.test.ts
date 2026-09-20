import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, createOrgWithProject, createUser, type TestUser } from './helpers/harness'
import { localStack } from './helpers/local-stack'

/**
 * The test this whole project stands on.
 *
 * Every other guarantee is a feature. This one is the difference between a product and a
 * breach, so it is asserted against a real database with real sessions rather than
 * verified by reading the policies and believing them.
 */

let alice: TestUser
let bob: TestUser
let aliceOrg: { orgId: string; projectId: string }
let bobOrg: { orgId: string; projectId: string }

beforeAll(async () => {
  alice = await createUser('alice')
  bob = await createUser('bob')
  aliceOrg = await createOrgWithProject(alice, 'acme')
  bobOrg = await createOrgWithProject(bob, 'globex')
})

describe('two organizations cannot see each other', () => {
  it('sets up two independent organizations', () => {
    expect(aliceOrg.orgId).not.toEqual(bobOrg.orgId)
    expect(aliceOrg.projectId).not.toEqual(bobOrg.projectId)
  })

  it('shows each user only their own organization', async () => {
    const seen = await alice.client.from('organizations').select('id')
    expect(seen.error).toBeNull()
    expect(seen.data?.map((r) => r.id)).toEqual([aliceOrg.orgId])
  })

  it('returns nothing when a user asks for the other organization by id', async () => {
    const probe = await alice.client.from('organizations').select('id').eq('id', bobOrg.orgId)
    expect(probe.error).toBeNull()
    expect(probe.data).toEqual([])
  })

  it('hides the other organization projects', async () => {
    const seen = await alice.client.from('projects').select('id')
    expect(seen.data?.map((r) => r.id)).toEqual([aliceOrg.projectId])

    const probe = await alice.client.from('projects').select('id').eq('id', bobOrg.projectId)
    expect(probe.data).toEqual([])
  })

  it('hides the other organization membership rows', async () => {
    const seen = await alice.client.from('org_members').select('org_id, user_id')
    expect(seen.data?.every((r) => r.org_id === aliceOrg.orgId)).toBe(true)
    expect(seen.data?.some((r) => r.user_id === bob.id)).toBe(false)
  })

  it('hides the other organization audit log', async () => {
    const seen = await alice.client.from('audit_log').select('org_id')
    expect(seen.error).toBeNull()
    expect(seen.data?.every((r) => r.org_id === aliceOrg.orgId)).toBe(true)
  })

  it('hides the other organization invites', async () => {
    const admin = adminClient()
    const created = await admin.from('org_invites').insert({
      org_id: bobOrg.orgId,
      email: 'someone@example.test',
      role: 'member',
      token_hash: Buffer.from(randomUUID()).toString('hex'),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(created.error).toBeNull()

    const seen = await alice.client.from('org_invites').select('id')
    expect(seen.data).toEqual([])
  })
})

describe('cross organization writes are refused', () => {
  it('refuses to create a project in an organization the user does not belong to', async () => {
    const attempt = await alice.client
      .from('projects')
      .insert({ org_id: bobOrg.orgId, name: 'intruder', slug: 'intruder' })
    expect(attempt.error).not.toBeNull()
    expect(attempt.error?.code).toBe('42501')
  })

  it('changes nothing when renaming another organization project', async () => {
    const attempt = await alice.client
      .from('projects')
      .update({ name: 'renamed by an outsider' })
      .eq('id', bobOrg.projectId)
      .select('id')
    expect(attempt.error).toBeNull()
    expect(attempt.data).toEqual([])

    const admin = adminClient()
    const actual = await admin.from('projects').select('name').eq('id', bobOrg.projectId).single()
    expect(actual.data?.name).toBe('globex web')
  })

  it('changes nothing when deleting another organization project', async () => {
    const attempt = await alice.client
      .from('projects')
      .delete()
      .eq('id', bobOrg.projectId)
      .select('id')
    expect(attempt.error).toBeNull()
    expect(attempt.data).toEqual([])

    const admin = adminClient()
    const stillThere = await admin.from('projects').select('id').eq('id', bobOrg.projectId)
    expect(stillThere.data).toHaveLength(1)
  })

  it('refuses a direct insert into organizations entirely', async () => {
    // There is no insert policy. Creation goes through api.create_organization(), which
    // guarantees the creator becomes the owner in the same transaction.
    const attempt = await alice.client
      .from('organizations')
      .insert({ name: 'side door', slug: `side-door-${randomUUID().slice(0, 8)}` })
    expect(attempt.error).not.toBeNull()
  })

  it('refuses to add itself to another organization', async () => {
    const attempt = await alice.client
      .from('org_members')
      .insert({ org_id: bobOrg.orgId, user_id: alice.id, role: 'owner' })
    expect(attempt.error).not.toBeNull()
    expect(attempt.error?.code).toBe('42501')
  })
})

describe('roles are enforced inside an organization', () => {
  let viewer: TestUser

  beforeAll(async () => {
    viewer = await createUser('viewer')
    const admin = adminClient()
    const added = await admin
      .from('org_members')
      .insert({ org_id: aliceOrg.orgId, user_id: viewer.id, role: 'viewer' })
    expect(added.error).toBeNull()
  })

  it('lets a viewer read the project', async () => {
    const seen = await viewer.client.from('projects').select('id')
    expect(seen.data?.map((r) => r.id)).toEqual([aliceOrg.projectId])
  })

  it('refuses to let a viewer create a project', async () => {
    const attempt = await viewer.client
      .from('projects')
      .insert({ org_id: aliceOrg.orgId, name: 'viewer project', slug: 'viewer-project' })
    expect(attempt.error?.code).toBe('42501')
  })

  it('refuses to let a viewer change the project', async () => {
    const attempt = await viewer.client
      .from('projects')
      .update({ retention_days: 3650 })
      .eq('id', aliceOrg.projectId)
      .select('id')
    expect(attempt.data).toEqual([])
  })

  it('refuses to let a viewer invite anyone', async () => {
    const attempt = await viewer.client.from('org_invites').insert({
      org_id: aliceOrg.orgId,
      email: 'nope@example.test',
      role: 'admin',
      token_hash: Buffer.from(randomUUID()).toString('hex'),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(attempt.error?.code).toBe('42501')
  })

  it('lets a viewer remove themselves from the organization', async () => {
    const leaving = await createUser('leaver')
    const admin = adminClient()
    await admin.from('org_members').insert({
      org_id: aliceOrg.orgId,
      user_id: leaving.id,
      role: 'viewer',
    })

    const left = await leaving.client
      .from('org_members')
      .delete()
      .eq('org_id', aliceOrg.orgId)
      .eq('user_id', leaving.id)
      .select('user_id')
    expect(left.error).toBeNull()
    expect(left.data).toHaveLength(1)
  })
})

describe('the audit log cannot be forged or erased by the client it describes', () => {
  it('records that the organization was created', async () => {
    const seen = await alice.client
      .from('audit_log')
      .select('action, target_id')
      .eq('org_id', aliceOrg.orgId)
    expect(seen.data?.some((r) => r.action === 'org.created')).toBe(true)
  })

  it('refuses a client written audit entry', async () => {
    const attempt = await alice.client.from('audit_log').insert({
      org_id: aliceOrg.orgId,
      action: 'org.totally_legitimate',
    })
    expect(attempt.error).not.toBeNull()
  })

  it('refuses to delete an audit entry', async () => {
    const before = await alice.client.from('audit_log').select('id').eq('org_id', aliceOrg.orgId)
    const count = before.data?.length ?? 0
    expect(count).toBeGreaterThan(0)

    await alice.client.from('audit_log').delete().eq('org_id', aliceOrg.orgId)

    const after = await alice.client.from('audit_log').select('id').eq('org_id', aliceOrg.orgId)
    expect(after.data?.length).toBe(count)
  })
})

describe('structural guarantees', () => {
  it('keeps at least one owner in an organization', async () => {
    const attempt = await alice.client
      .from('org_members')
      .update({ role: 'viewer' })
      .eq('org_id', aliceOrg.orgId)
      .eq('user_id', alice.id)
      .select('user_id')
    expect(attempt.error).not.toBeNull()
    expect(attempt.error?.message).toContain('at least one owner')
  })

  it('refuses an unknown project timezone', async () => {
    const attempt = await alice.client
      .from('projects')
      .update({ timezone: 'Mars/Olympus_Mons' })
      .eq('id', aliceOrg.projectId)
      .select('id')
    expect(attempt.error).not.toBeNull()
    expect(attempt.error?.message).toContain('unknown timezone')
  })

  it('does not let a dashboard client reach the jobs schema', async () => {
    // jobs is listed in the PostgREST exposed schemas because the Edge Functions reach it
    // under the service role, and that list is global rather than per role. What keeps a
    // dashboard client out is the absence of USAGE on the schema. This asserts the lock
    // rather than trusting the door.
    const { apiUrl, anonKey } = localStack()

    for (const routine of ['ingest_batch', 'verify_api_key', 'consume_rate_limit', 'write_audit']) {
      const response = await fetch(`${apiUrl}/rest/v1/rpc/${routine}`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${alice.accessToken}`,
          'Content-Type': 'application/json',
          'Accept-Profile': 'jobs',
          'Content-Profile': 'jobs',
        },
        body: '{}',
      })
      expect(response.ok, `jobs.${routine} must not be callable by a signed-in user`).toBe(false)
    }
  })

  it('does not expose the policy helper schema through the API', async () => {
    // authz.current_user_org_ids() is what every policy calls. It is kept out of the
    // PostgREST exposed schema list so the reachable surface stays the tables plus the api
    // schema. Called directly through REST it must not resolve.
    const { apiUrl, anonKey } = localStack()
    const response = await fetch(`${apiUrl}/rest/v1/rpc/current_user_org_ids`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${alice.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    expect(response.ok).toBe(false)
  })
})
