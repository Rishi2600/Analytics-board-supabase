import { createClient } from '@supabase/supabase-js'
import type { Database } from '../apps/web/src/types/database.ts'
import { args, scriptEnv } from './lib/env.ts'

/**
 * Fills the parts of the demo that seed-events.ts does not reach: refused events, saved
 * views, exports and a second member. Without them those panels only ever show their empty
 * state, and screenshots of them say nothing about the design.
 *
 * Everything goes through the paths a customer uses: a real API key and the ingest endpoint
 * for the refused events, the export function for the files, a real invite accepted by a
 * real second account. Nothing is written straight into a table to look finished.
 *
 * Needs the local stack and `npm run functions`. Run after bootstrap-demo.ts.
 */

const flags = args(process.argv.slice(2))
const email = flags.get('email') ?? 'demo@example.test'
const password = flags.get('password') ?? 'demo-password-change-me'
const teammateEmail = flags.get('teammate') ?? 'teammate@example.test'

const { url, serviceRoleKey } = scriptEnv()
if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
  console.error(`Refusing to seed demo content on ${url}. This script is for the local stack.`)
  process.exit(1)
}

const admin = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function signedInAs(address: string, secret: string) {
  const auth = createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false } })
  const { data, error } = await auth.auth.signInWithPassword({ email: address, password: secret })
  if (error) throw error
  const token = data.session.access_token
  const client = createClient<Database>(url, token, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  return { client, token, userId: data.user.id }
}

async function main(): Promise<void> {
  const demo = await signedInAs(email, password)
  const project = await demo.client.from('projects').select('id, org_id').limit(1).single()
  if (project.error) throw project.error
  const { id: projectId, org_id: orgId } = project.data

  // Refused events, through the real ingest endpoint with a real key.
  const key = await demo.client.schema('api').rpc('create_api_key', {
    p_project_id: projectId,
    p_name: 'Seed script (server)',
    p_key_type: 'secret',
  })
  if (key.error) throw key.error
  const apiKey = key.data[0]?.api_key ?? ''
  const manyProperties = Object.fromEntries(
    Array.from({ length: 70 }, (_, i) => [`p${String(i)}`, i]),
  )
  const ingest = await fetch(`${url}/functions/v1/ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batch: [
        { event: 'page_view', distinct_id: 'seed_ok', properties: { path: '/pricing' } },
        { event: 'signup_started' },
        { event: 'checkout_started', distinct_id: 'seed_1', properties: manyProperties },
        { event: 'page_view', distinct_id: 'seed_2', properties: { note: 'x'.repeat(2000) } },
        { event: 'page_view', distinct_id: 'seed_3', properties: { a: { b: { c: { d: 1 } } } } },
      ],
    }),
  })
  console.log(`  ingest            ${String(ingest.status)} ${await ingest.text()}`)

  // Saved views, one shared.
  const views = await demo.client.from('saved_views').insert([
    {
      project_id: projectId,
      name: 'Pricing page traffic',
      query: {
        events: ['page_view'],
        filterKey: 'path',
        filterValue: '/pricing',
        breakdown: null,
        preset: '30d',
      },
      is_shared: true,
      created_by: demo.userId,
    },
    {
      project_id: projectId,
      name: 'Signups by country',
      query: {
        events: ['signup_completed'],
        filterKey: null,
        filterValue: null,
        breakdown: 'country',
        preset: '7d',
      },
      is_shared: false,
      created_by: demo.userId,
    },
  ])
  if (views.error) throw views.error
  console.log('  saved views       2')

  // Exports, through the export function the Reports screen calls.
  for (const kind of ['timeseries', 'events'] as const) {
    const created = await demo.client
      .from('exports')
      .insert({
        project_id: projectId,
        kind,
        format: kind === 'events' ? 'json' : 'csv',
        params: {
          from: new Date(Date.now() - 86_400_000).toISOString(),
          to: new Date().toISOString(),
        },
        requested_by: demo.userId,
      })
      .select('id')
      .single()
    if (created.error) throw created.error
    const run = await fetch(`${url}/functions/v1/export-run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${demo.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ export_id: created.data.id }),
    })
    console.log(`  export ${kind.padEnd(10)} ${String(run.status)}`)
  }

  // A second member, through a real invite accepted by a real account.
  const existing = await admin.auth.admin.listUsers()
  if (!existing.data.users.some((u) => u.email === teammateEmail)) {
    const created = await admin.auth.admin.createUser({
      email: teammateEmail,
      password,
      email_confirm: true,
    })
    if (created.error) throw created.error
  }
  const invite = await demo.client
    .schema('api')
    .rpc('create_invite', { p_org_id: orgId, p_email: teammateEmail, p_role: 'viewer' })
  if (invite.error) throw invite.error
  const teammate = await signedInAs(teammateEmail, password)
  const accepted = await teammate.client
    .schema('api')
    .rpc('accept_invite', { p_token: invite.data[0]?.token ?? '' })
  console.log(`  teammate invite   ${accepted.error ? accepted.error.message : 'accepted'}`)

  console.log(
    '\nRun the rollup job, or wait five minutes, for the refused events to show on health.',
  )
}

main().catch((error: unknown) => {
  console.error('Seeding demo extras failed:', error)
  process.exit(1)
})
