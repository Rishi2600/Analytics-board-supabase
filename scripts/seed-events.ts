import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { args, scriptEnv } from './lib/env.ts'

/**
 * Synthetic traffic, shaped like the real thing.
 *
 * Uniformly random events would make every chart a flat line and every funnel a straight
 * 100%, which tells you nothing about whether the product works. This generates traffic
 * with the properties that actually stress an analytics system:
 *
 *   - weekday and weekend seasonality, plus a daily shape with a working-hours peak
 *   - a power law over users, so a few accounts produce most of the volume
 *   - sessions that walk a realistic funnel and drop off at each step
 *   - a slow growth trend, so period over period comparisons are not noise
 *   - a small share of late arriving events, which is what the rollup job has to survive
 *
 * Usage:
 *   node scripts/seed-events.ts --project <uuid> [--events 1000000] [--days 90]
 */

const flags = args(process.argv.slice(2))
const projectIdFlag = flags.get('project')
const targetEvents = Number(flags.get('events') ?? 1_000_000)
const days = Number(flags.get('days') ?? 90)
const batchSize = Number(flags.get('batch') ?? 2000)

if (!projectIdFlag) {
  console.error('Usage: node scripts/seed-events.ts --project <uuid> [--events N] [--days N]')
  process.exit(1)
}

// Narrowed once here, so the closures below are not each re-checking a value that cannot
// be undefined by this point.
const projectId: string = projectIdFlag

const { url, serviceRoleKey } = scriptEnv()
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// --- the shape of the traffic ----------------------------------------------

const PAGES = ['/', '/pricing', '/docs/quickstart', '/blog/launch', '/changelog', '/login']
const REFERRERS = [
  'https://google.com',
  'https://news.ycombinator.com',
  'https://x.com',
  'https://github.com',
  '',
]
const COUNTRIES = ['IN', 'US', 'GB', 'DE', 'BR', 'JP', 'AU', 'CA']
const DEVICES = ['desktop', 'mobile', 'tablet'] as const
const BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge']
const OSES = ['macOS', 'Windows', 'iOS', 'Android', 'Linux']

/** The funnel a session walks, with the chance of continuing past each step. */
const FUNNEL: { event: string; continueChance: number }[] = [
  { event: 'page_view', continueChance: 0.62 },
  { event: 'signup_started', continueChance: 0.55 },
  { event: 'signup_completed', continueChance: 0.48 },
  { event: 'checkout_started', continueChance: 0.41 },
  { event: 'checkout_completed', continueChance: 0 },
]

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)]
  if (item === undefined) throw new Error('pick() from an empty list')
  return item
}

/** Power law user selection: user 0 is far more active than user 5000. */
function pickUser(userCount: number): number {
  return Math.floor(userCount * Math.random() ** 2.2)
}

/** Weekday and hour seasonality, multiplied by a slow growth trend. */
function dayWeight(dayIndex: number, totalDays: number): number {
  const date = new Date(Date.now() - (totalDays - dayIndex) * 86_400_000)
  const weekday = date.getUTCDay()
  const weekendPenalty = weekday === 0 || weekday === 6 ? 0.55 : 1
  const growth = 0.7 + (dayIndex / totalDays) * 0.6
  const wobble = 0.85 + Math.random() * 0.3
  return weekendPenalty * growth * wobble
}

function hourOfDay(): number {
  // Two humps: a working-hours peak and a smaller evening one.
  const roll = Math.random()
  if (roll < 0.6) return 9 + Math.floor(Math.random() * 9)
  if (roll < 0.85) return 18 + Math.floor(Math.random() * 5)
  return Math.floor(Math.random() * 24)
}

interface SeedEvent {
  project_id: string
  event_name: string
  distinct_id: string
  session_id: string
  ts: string
  received_at: string
  properties: Record<string, unknown>
  context: Record<string, unknown>
  ingest_id: string
}

function buildSession(dayIndex: number, totalDays: number, userCount: number): SeedEvent[] {
  const userIndex = pickUser(userCount)
  const distinctId = `u_${String(userIndex).padStart(6, '0')}`
  const sessionIdValue = `s_${randomUUID().slice(0, 12)}`

  const dayStart = new Date(Date.now() - (totalDays - dayIndex) * 86_400_000)
  dayStart.setUTCHours(
    hourOfDay(),
    Math.floor(Math.random() * 60),
    Math.floor(Math.random() * 60),
    0,
  )

  const plan = userIndex % 17 === 0 ? 'enterprise' : userIndex % 4 === 0 ? 'pro' : 'free'
  const country: string = COUNTRIES[userIndex % COUNTRIES.length] ?? 'IN'
  const device = pick(DEVICES)

  const events: SeedEvent[] = []
  let cursor = dayStart.getTime()

  for (const step of FUNNEL) {
    cursor += Math.floor(Math.random() * 120_000) + 5_000
    const ts = new Date(cursor)

    // Most events arrive immediately. A few percent arrive late, which is the case the
    // rollup watermark has to handle: a mobile client that was offline for days.
    const lateness = Math.random() < 0.03 ? Math.floor(Math.random() * 5) * 86_400_000 : 0
    const receivedAt = new Date(cursor + lateness + Math.floor(Math.random() * 3000))

    const path = step.event === 'page_view' ? pick(PAGES) : undefined
    const properties: Record<string, unknown> = { plan, country }
    if (path) properties.path = path
    if (step.event === 'checkout_completed') {
      properties.amount = pick([1900, 4900, 9900, 19900])
      properties.currency = 'INR'
    }

    events.push({
      project_id: projectId,
      event_name: step.event,
      distinct_id: distinctId,
      session_id: sessionIdValue,
      ts: ts.toISOString(),
      received_at: receivedAt.toISOString(),
      properties,
      context: {
        sdk: 'web',
        sdk_version: '1.0.0',
        url: `https://example.com${path ?? '/'}`,
        referrer: pick(REFERRERS),
        ua_family: pick(BROWSERS),
        os: pick(OSES),
        device_type: device,
        country,
      },
      ingest_id: `seed_${randomUUID()}`,
    })

    if (Math.random() > step.continueChance) break
  }

  // A session_start event so session counts are meaningful on their own.
  const first = events[0]
  if (first) {
    events.unshift({
      ...first,
      event_name: 'session_start',
      properties: { plan, country },
      ingest_id: `seed_${randomUUID()}`,
    })
  }

  return events
}

async function main(): Promise<void> {
  const userCount = Math.max(200, Math.floor(targetEvents / 180))
  console.log(
    `Seeding about ${targetEvents.toLocaleString()} events across ${days} days ` +
      `for ${userCount.toLocaleString()} users into project ${projectId}`,
  )

  const weights = Array.from({ length: days }, (_, i) => dayWeight(i, days))
  const weightTotal = weights.reduce((sum, w) => sum + w, 0)

  let written = 0
  let buffer: SeedEvent[] = []
  const startedAt = Date.now()

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const share = (weights[dayIndex] ?? 1) / weightTotal
    const eventsForDay = Math.round(targetEvents * share)
    let producedToday = 0

    while (producedToday < eventsForDay) {
      const session = buildSession(dayIndex, days, userCount)
      buffer.push(...session)
      producedToday += session.length

      if (buffer.length >= batchSize) {
        const { error } = await supabase.from('events_raw').insert(buffer)
        if (error) throw error
        written += buffer.length
        buffer = []

        if (written % (batchSize * 25) === 0) {
          const elapsed = (Date.now() - startedAt) / 1000
          const rate = Math.round(written / Math.max(elapsed, 1))
          process.stdout.write(
            `\r  ${written.toLocaleString()} events written, ${rate.toLocaleString()}/s`,
          )
        }
      }
    }
  }

  if (buffer.length > 0) {
    const { error } = await supabase.from('events_raw').insert(buffer)
    if (error) throw error
    written += buffer.length
  }

  const elapsed = (Date.now() - startedAt) / 1000
  console.log(`\nDone. ${written.toLocaleString()} events in ${elapsed.toFixed(1)}s.`)
  console.log('Run the rollup job so the dashboard has something to read:')
  console.log('  npx supabase db reset is not needed; call select jobs.run_rollups();')
}

main().catch((error: unknown) => {
  console.error('\nSeeding failed:', error)
  process.exit(1)
})
