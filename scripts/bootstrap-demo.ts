import { createClient } from '@supabase/supabase-js'
import type { Database } from '../apps/web/src/types/database.ts'
import { args, scriptEnv } from './lib/env.ts'

/**
 * Creates a signed-in-able demo account with one organization, one project and one API
 * key, and prints what you need to seed and sign in.
 *
 * This exists so that "clone the repository and see the product working" is three commands
 * rather than a page of clicking. It is a development convenience and refuses to run
 * against anything that does not look like a local stack unless forced.
 */

const flags = args(process.argv.slice(2))
const email = flags.get('email') ?? 'demo@example.test'
const password = flags.get('password') ?? 'demo-password-change-me'
const orgName = flags.get('org') ?? 'Acme'
const projectName = flags.get('project') ?? 'Web app'
const timezone = flags.get('timezone') ?? 'Asia/Kolkata'

const { url, serviceRoleKey } = scriptEnv()

if (!url.includes('127.0.0.1') && !url.includes('localhost') && flags.get('force') !== 'true') {
  console.error(
    `Refusing to create a demo account with a known password on ${url}.\n` +
      'Pass --force if you really mean to, and change the password immediately.',
  )
  process.exit(1)
}

const admin = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main(): Promise<void> {
  const existing = await admin.auth.admin.listUsers()
  const already = existing.data.users.find((u) => u.email === email)

  const userId =
    already?.id ??
    (
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
    ).data.user?.id

  if (!userId) throw new Error('Could not create or find the demo user')

  // Organization creation goes through the api function, which requires a real session,
  // so the script signs in as the demo user rather than using the service role.
  const asUser = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signedIn = await asUser.auth.signInWithPassword({ email, password })
  if (signedIn.error) throw signedIn.error

  const userClient = createClient<Database>(url, signedIn.data.session?.access_token ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signedIn.data.session?.access_token ?? ''}` } },
  })

  const existingProjects = await userClient.from('projects').select('id, org_id, name')
  let projectId = existingProjects.data?.[0]?.id

  if (!projectId) {
    const org = await userClient.schema('api').rpc('create_organization', { p_name: orgName })
    if (org.error) throw org.error

    const project = await userClient
      .from('projects')
      .insert({
        org_id: org.data,
        name: projectName,
        slug: 'web',
        timezone,
        allowed_origins: ['http://localhost:5173'],
      })
      .select('id')
      .single()
    if (project.error) throw project.error
    projectId = project.data.id
  }

  const key = await userClient.schema('api').rpc('create_api_key', {
    p_project_id: projectId,
    p_name: 'Demo key',
    p_key_type: 'secret',
  })
  if (key.error) throw key.error

  // The password exists only so this script can sign in as the demo user. The dashboard has
  // no password form: it signs in with a magic link, which locally lands in Mailpit.
  console.log('\nDemo account ready.\n')
  console.log(`  Email          ${email}`)
  console.log('  Sign in        enter the email on the sign-in page, then open the link at')
  console.log('                 http://localhost:54324 (local mail catcher)')
  console.log(`  Project id     ${projectId}`)
  console.log(`  API key        ${key.data[0]?.api_key ?? '(not returned)'}`)
  console.log('\nSeed some traffic:')
  console.log(`  node scripts/seed-events.ts --project ${projectId} --events 100000\n`)
}

main().catch((error: unknown) => {
  console.error('Bootstrap failed:', error)
  process.exit(1)
})
