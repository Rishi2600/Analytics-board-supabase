import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export interface Stack {
  apiUrl: string
  anonKey: string
  serviceRoleKey: string
  functionsUrl: string
  mailUrl: string
}

let cached: Stack | undefined

export function stack(): Stack {
  if (cached) return cached
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const values = new Map<string, string>()
  for (const line of output.split('\n')) {
    const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim())
    if (match?.[1] && match[2] !== undefined) values.set(match[1], match[2])
  }
  cached = {
    apiUrl: values.get('API_URL') ?? '',
    anonKey: values.get('ANON_KEY') ?? '',
    serviceRoleKey: values.get('SERVICE_ROLE_KEY') ?? '',
    functionsUrl: values.get('FUNCTIONS_URL') ?? '',
    mailUrl: values.get('MAILPIT_URL') ?? values.get('INBUCKET_URL') ?? '',
  }
  return cached
}

export function testEmail(): string {
  return `e2e-${randomUUID()}@example.test`
}

interface MailpitSummary {
  messages?: { ID: string; To?: { Address: string }[] }[]
}

/**
 * Pulls the most recent message for an address out of the local mail catcher.
 *
 * The local stack does not send email; it captures it. That makes the real magic link flow
 * testable end to end, which is worth far more than a test that writes a session into
 * localStorage and asserts the app reads it back.
 */
export async function waitForMagicLink(email: string, timeoutMs = 20_000): Promise<string> {
  const { mailUrl } = stack()
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const listed = await fetch(`${mailUrl}/api/v1/messages?limit=50`)
    if (listed.ok) {
      const summary = (await listed.json()) as MailpitSummary
      const match = summary.messages?.find((m) =>
        m.To?.some((to) => to.Address.toLowerCase() === email.toLowerCase()),
      )

      if (match) {
        const full = await fetch(`${mailUrl}/api/v1/message/${match.ID}`)
        const body = (await full.json()) as { Text?: string; HTML?: string }
        const content = `${body.Text ?? ''}\n${body.HTML ?? ''}`
        const link = /https?:\/\/[^\s"'<>]*(?:verify|callback)[^\s"'<>]*/i.exec(content)
        if (link?.[0]) return link[0].replace(/&amp;/g, '&')
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`No sign-in email arrived for ${email} within ${String(timeoutMs)}ms`)
}

export function adminClient() {
  const { apiUrl, serviceRoleKey } = stack()
  return createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false } })
}

export function userClient(accessToken: string) {
  const { apiUrl, anonKey } = stack()
  return createClient(apiUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

/**
 * Reads the signed-in user's access token out of the browser.
 *
 * Some checks need to act as the user from Node rather than through the interface, for
 * example creating a fixture that a different flow is responsible for testing. Taking the
 * real token from the page keeps those acting as the same person, rather than quietly
 * falling back to the service role and bypassing every policy.
 */
export async function accessTokenFromPage(page: {
  evaluate: <T>(fn: () => T) => Promise<T>
}): Promise<string> {
  const token = await page.evaluate<string | null>(() => {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue

      let raw = window.localStorage.getItem(key)
      if (!raw) continue

      // Newer supabase-js versions base64 encode the stored session.
      if (raw.startsWith('base64-')) {
        try {
          raw = atob(raw.slice('base64-'.length))
        } catch {
          continue
        }
      }

      try {
        const parsed = JSON.parse(raw) as { access_token?: string }
        if (parsed.access_token) return parsed.access_token
      } catch {
        continue
      }
    }
    return null
  })

  if (!token) throw new Error('No Supabase session found in the browser')
  return token
}
