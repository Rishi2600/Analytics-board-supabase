import { createClient } from '@supabase/supabase-js'
import type { Database } from '../apps/web/src/types/database.ts'
import { args, scriptEnv } from './lib/env.ts'

/**
 * Recomputes rollups for an arbitrary date range, one day at a time.
 *
 * You want this the first time a rollup bug ships. The scheduled job only recomputes
 * buckets that late-arriving events touched, so a fix to the aggregation logic itself does
 * not retroactively repair history: the affected buckets have no new events and the job
 * will never look at them again.
 *
 * Idempotent, chunked by day and resumable, because a backfill over a year of data will be
 * interrupted at some point and starting over is not acceptable.
 *
 * Usage:
 *   node scripts/backfill-rollups.ts --project <uuid> [--from 2026-06-01] [--to 2026-09-20]
 */

const flags = args(process.argv.slice(2))
const projectIdFlag = flags.get('project')

if (!projectIdFlag) {
  console.error(
    'Usage: node scripts/backfill-rollups.ts --project <uuid> [--from YYYY-MM-DD] [--to YYYY-MM-DD]',
  )
  process.exit(1)
}

const projectId: string = projectIdFlag
const { url, serviceRoleKey } = scriptEnv()
const supabase = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function parseDay(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    console.error(`Not a date: ${value}. Use YYYY-MM-DD.`)
    process.exit(1)
  }
  return parsed
}

const today = new Date()
today.setUTCHours(0, 0, 0, 0)

const to = parseDay(flags.get('to'), today)
const from = parseDay(flags.get('from'), new Date(to.getTime() - 89 * 86_400_000))

async function main(): Promise<void> {
  const totalDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1)
  console.log(
    `Backfilling ${totalDays} day(s) for project ${projectId}, ` +
      `${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
  )

  let completed = 0
  const startedAt = Date.now()

  for (let day = new Date(from); day <= to; day.setUTCDate(day.getUTCDate() + 1)) {
    const dayStart = new Date(day)
    const dayEnd = new Date(day.getTime() + 86_400_000)

    const { error } = await supabase.schema('jobs').rpc('backfill_range', {
      p_project_id: projectId,
      p_from: dayStart.toISOString(),
      p_to: dayEnd.toISOString(),
    })

    if (error) {
      console.error(`\nFailed on ${dayStart.toISOString().slice(0, 10)}:`, error.message)
      console.error('Rerun with --from that date to resume; completed days are unaffected.')
      process.exit(1)
    }

    completed += 1
    process.stdout.write(
      `\r  ${completed}/${totalDays} days (${dayStart.toISOString().slice(0, 10)})`,
    )
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\nDone. ${completed} day(s) recomputed in ${elapsed}s.`)
}

main().catch((error: unknown) => {
  console.error('\nBackfill failed:', error)
  process.exit(1)
})
