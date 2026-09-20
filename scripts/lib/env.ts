import { execFileSync } from 'node:child_process'

export interface ScriptEnv {
  url: string
  serviceRoleKey: string
}

/**
 * Credentials for a script that writes as the service role.
 *
 * Reads the environment first so the same script can target a hosted project, and falls
 * back to the local stack so that running it during development needs no setup at all.
 */
export function scriptEnv(): ScriptEnv {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && serviceRoleKey) return { url, serviceRoleKey }

  try {
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
    const localUrl = values.get('API_URL')
    const localKey = values.get('SERVICE_ROLE_KEY')
    if (localUrl && localKey) return { url: localUrl, serviceRoleKey: localKey }
  } catch {
    // Fall through to the error below, which explains both options.
  }

  throw new Error(
    'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or start the local stack with `npx supabase start`.',
  )
}

/** Minimal flag parsing. --name value and --name=value both work. */
export function args(argv: string[]): Map<string, string> {
  const parsed = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token?.startsWith('--')) continue
    const [name, inline] = token.slice(2).split('=')
    if (!name) continue
    if (inline !== undefined) {
      parsed.set(name, inline)
    } else {
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        parsed.set(name, next)
        i += 1
      } else {
        parsed.set(name, 'true')
      }
    }
  }
  return parsed
}
