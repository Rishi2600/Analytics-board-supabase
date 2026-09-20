import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { Database } from '../../apps/web/src/types/database'
import { localStack } from './local-stack'

export type Client = SupabaseClient<Database>

/** Bypasses row level security. Used only to set up fixtures and to verify what a
 *  restricted client should not have been able to see. */
export function adminClient(): Client {
  const { apiUrl, serviceRoleKey } = localStack()
  return createClient<Database>(apiUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface TestUser {
  id: string
  email: string
  client: Client
  /** Needed when a test has to bypass supabase-js and call PostgREST directly. */
  accessToken: string
}

/**
 * Creates a confirmed user and returns a client authenticated as them. This is the only
 * honest way to test row level security: the policies key off auth.uid(), so a test that
 * does not carry a real session is testing nothing.
 */
export async function createUser(prefix = 'user'): Promise<TestUser> {
  const { apiUrl, anonKey } = localStack()
  const admin = adminClient()
  const email = `${prefix}-${randomUUID()}@example.test`
  const password = randomUUID()

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (created.error) throw created.error
  const id = created.data.user?.id
  if (!id) throw new Error('user creation returned no id')

  const client = createClient<Database>(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error) throw signedIn.error
  const accessToken = signedIn.data.session?.access_token
  if (!accessToken) throw new Error('sign in returned no access token')

  return { id, email, client, accessToken }
}

/** Creates an organization owned by this user, plus one project inside it. */
export async function createOrgWithProject(
  user: TestUser,
  label: string,
): Promise<{ orgId: string; projectId: string }> {
  const slug = `${label}-${randomUUID().slice(0, 8)}`

  const org = await user.client
    .schema('api')
    .rpc('create_organization', { p_name: label, p_slug: slug })
  if (org.error) throw org.error
  const orgId = org.data

  const project = await user.client
    .from('projects')
    .insert({ org_id: orgId, name: `${label} web`, slug: 'web' })
    .select('id')
    .single()
  if (project.error) throw project.error

  return { orgId, projectId: project.data.id }
}
