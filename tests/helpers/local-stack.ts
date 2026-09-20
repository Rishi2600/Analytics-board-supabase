import { execFileSync } from 'node:child_process'

export interface LocalStack {
  apiUrl: string
  anonKey: string
  serviceRoleKey: string
  dbUrl: string
  functionsUrl: string
}

let cached: LocalStack | undefined

/**
 * Reads the local stack's URLs and keys from the Supabase CLI rather than hardcoding
 * them. The local keys are well known constants that ship with the CLI, but reading them
 * keeps the well-known-secret shaped strings out of the repository entirely, which means
 * the bundle secret scanner never has to make an exception for a test file.
 */
export function localStack(): LocalStack {
  if (cached) return cached

  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  const values = new Map<string, string>()
  for (const line of output.split('\n')) {
    const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim())
    const key = match?.[1]
    const value = match?.[2]
    if (key !== undefined && value !== undefined) values.set(key, value)
  }

  const apiUrl = values.get('API_URL')
  const anonKey = values.get('ANON_KEY')
  const serviceRoleKey = values.get('SERVICE_ROLE_KEY')
  const dbUrl = values.get('DB_URL')
  const functionsUrl = values.get('FUNCTIONS_URL')

  if (!apiUrl || !anonKey || !serviceRoleKey || !dbUrl || !functionsUrl) {
    throw new Error(
      'Could not read the local Supabase stack. Run `npx supabase start` before the database tests.',
    )
  }

  cached = { apiUrl, anonKey, serviceRoleKey, dbUrl, functionsUrl }
  return cached
}
