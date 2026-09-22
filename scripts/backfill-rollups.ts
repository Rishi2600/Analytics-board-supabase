import { createClient } from '@supabase/supabase-js'
import type { Database } from '../apps/web/src/types/database.ts'
import { args, scriptEnv } from './lib/env.ts'

/**
 * Recomputes rollups for a date range, one day at a time.
 *
 * The scheduled job only aggregates events whose received_at is newer than its watermark.
 * Two situations fall outside that, and this script exists for both:
 *
 *   Seeded or imported history. scripts/seed-events.ts writes events with arrival times in
 *   the past, so once the scheduled job has run for a project its watermark is already
 *   ahead of them and it will never look at them.
 *
 *   A bug fix in the aggregation SQL. Buckets that were computed wrongly have no new events
 *   in them, so the job has no reason to revisit them.
 *
 * By default the range is every day on which this project has raw events. Rebuilding a day
 * replaces its rollups with whatever raw events remain for it, so a day whose raw events
 * were pruned by retention would lose its history. Starting at the oldest raw event keeps
 * that history untouched. An explicit --from earlier than that is refused without --force.
 *
 * Idempotent, chunked by day and resumable: rerun with --from set to the day it stopped on.
 *
 * Usage:
 *   node scripts/backfill-rollups.ts --project <uuid> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--force]
 */

const DAY_MS = 86_400_000

const flags = args(process.argv.slice(2))
const projectIdFlag = flags.get('project')

if (!projectIdFlag) {
  console.error(
    'Usage: node scripts/backfill-rollups.ts --project <uuid> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--force]',
  )
  process.exit(1)
}

const projectId: string = projectIdFlag
const { url, serviceRoleKey } = scriptEnv()
const supabase = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfUtcDay(date: Date): Date {
  const copy = new Date(date)
  copy.setUTCHours(0, 0, 0, 0)
  return copy
}

function parseDay(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    console.error(`Not a date: ${value}. Use YYYY-MM-DD.`)
    process.exit(1)
  }
  return parsed
}

/** The first and last UTC day on which this project has raw events. */
async function rawEventDays(): Promise<{ first: Date; last: Date } | null> {
  const earliest = await supabase
    .from('events_raw')
    .select('ts')
    .eq('project_id', projectId)
    .order('ts', { ascending: true })
    .limit(1)
  if (earliest.error) throw earliest.error

  const latest = await supabase
    .from('events_raw')
    .select('ts')
    .eq('project_id', projectId)
    .order('ts', { ascending: false })
    .limit(1)
  if (latest.error) throw latest.error

  const firstTs = earliest.data[0]?.ts
  const lastTs = latest.data[0]?.ts
  if (!firstTs || !lastTs) return null

  return { first: startOfUtcDay(new Date(firstTs)), last: startOfUtcDay(new Date(lastTs)) }
}

async function main(): Promise<void> {
  const days = await rawEventDays()
  if (!days) {
    console.log(`Project ${projectId} has no raw events, so there is nothing to recompute.`)
    return
  }

  const from = parseDay(flags.get('from'), days.first)
  const to = parseDay(flags.get('to'), days.last)

  if (from < days.first && flags.get('force') !== 'true') {
    console.error(
      `--from ${isoDay(from)} is earlier than this project's oldest raw event (${isoDay(days.first)}).\n` +
        'Recomputing a day rebuilds its rollups from raw events, so a day whose raw events were\n' +
        'pruned would lose its history. Pass --force if that is really what you want.',
    )
    process.exit(1)
  }

  if (to < from) {
    console.error(`--to ${isoDay(to)} is before --from ${isoDay(from)}.`)
    process.exit(1)
  }

  const totalDays = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1
  console.log(
    `Backfilling ${totalDays} day(s) for project ${projectId}, ${isoDay(from)} to ${isoDay(to)}`,
  )

  let completed = 0
  const startedAt = Date.now()

  for (let day = new Date(from); day <= to; day.setUTCDate(day.getUTCDate() + 1)) {
    const dayStart = new Date(day)
    const dayEnd = new Date(day.getTime() + DAY_MS)

    const { error } = await supabase.schema('jobs').rpc('backfill_range', {
      p_project_id: projectId,
      p_from: dayStart.toISOString(),
      p_to: dayEnd.toISOString(),
    })

    if (error) {
      console.error(`\nFailed on ${isoDay(dayStart)}:`, error.message)
      console.error(
        `Rerun with --from ${isoDay(dayStart)} to resume; completed days are unaffected.`,
      )
      process.exit(1)
    }

    completed += 1
    process.stdout.write(`\r  ${completed}/${totalDays} days (${isoDay(dayStart)})`)
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\nDone. ${completed} day(s) recomputed in ${elapsed}s.`)
}

main().catch((error: unknown) => {
  console.error('\nBackfill failed:', error)
  process.exit(1)
})
