import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0'

/**
 * Key resolution for the ingestion endpoint.
 *
 * The service role client here is the only place in the entire codebase that holds a key
 * capable of bypassing row level security. It lives in an Edge Function, reads its
 * credential from a function secret, and is never shipped to a browser.
 */

export interface ResolvedKey {
  apiKeyId: string
  projectId: string
  keyType: 'public' | 'secret'
}

export interface ProjectSettings {
  allowed_origins: string[]
  filter_bots: boolean
}

let cachedClient: SupabaseClient | undefined

export function serviceClient(): SupabaseClient {
  if (cachedClient) return cachedClient

  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for this function')
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cachedClient
}

/** Pulls the presented key out of either header form we accept. */
export function extractKey(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (header?.toLowerCase().startsWith('bearer ')) {
    const value = header.slice(7).trim()
    if (value) return value
  }
  return request.headers.get('x-api-key')?.trim() ?? null
}

/**
 * Verifies a presented key against its stored hash.
 *
 * The comparison itself happens inside Postgres against a salted SHA-256. Returning null
 * for unknown, revoked and wrong alike is deliberate: the caller turns every one of them
 * into the same 401, so this endpoint cannot be used to discover which keys exist.
 */
export async function resolveKey(presented: string): Promise<ResolvedKey | null> {
  if (!presented.startsWith('pk_live_') && !presented.startsWith('sk_live_')) return null

  const client = serviceClient()
  const { data, error } = await client.schema('jobs').rpc('verify_api_key', {
    p_presented_key: presented,
  })
  if (error) throw error

  const row = (data as { api_key_id: string; project_id: string; key_type: string }[] | null)?.[0]
  if (!row) return null

  return {
    apiKeyId: row.api_key_id,
    projectId: row.project_id,
    keyType: row.key_type === 'secret' ? 'secret' : 'public',
  }
}

export async function loadProjectSettings(projectId: string): Promise<ProjectSettings> {
  const client = serviceClient()
  const { data, error } = await client
    .from('projects')
    .select('allowed_origins, filter_bots')
    .eq('id', projectId)
    .single()
  if (error) throw error

  return {
    allowed_origins: (data.allowed_origins as string[] | null) ?? [],
    filter_bots: Boolean(data.filter_bots),
  }
}
