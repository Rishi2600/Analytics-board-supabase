# CLAUDE.md

Operating rules for this repository. Read this file first in any new session, then
`docs/ARCHITECTURE.md` for how the system fits together.

## What this is

A self-serve product analytics platform. Customers drop a snippet into their app, events
flow into our ingestion endpoint, a scheduled job aggregates them into rollup tables, and
humans explore the results in a dashboard.

Scope is portfolio scale: correct, complete, well documented, convincing to an engineer
reading the repo cold. It is not tuned for millions of events per day. The last section of
`docs/ARCHITECTURE.md` records what was deliberately deferred and the trigger that would
make us build it.

## Three surfaces, three trust boundaries

| Surface       | Who calls it                | Auth                           | Notes                               |
| ------------- | --------------------------- | ------------------------------ | ----------------------------------- |
| Ingestion API | customers' apps and servers | project API key                | write only, never reads user data   |
| Dashboard     | humans on our web app       | Supabase Auth session          | read heavy, row scoped to their org |
| Jobs          | our own cron                | service role, server side only | rollups, exports, pruning           |

Keeping these three separate is the most important architectural idea in the project. A
mistake that lets the ingestion surface read dashboard data is a breach, not a bug.

## Stack - locked, do not relitigate

Frontend: Vite, React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui, TanStack Query
for all server state, TanStack Router, Recharts, lucide-react, react-hook-form with Zod,
date-fns and date-fns-tz.

Everything server side is Supabase and only Supabase: Postgres for schema, RLS, SQL
functions and triggers; Edge Functions for ingestion and exports; Supabase Auth; Supabase
Storage for export files; pg_cron for scheduling; Realtime for the live event stream.

Two deliberate deviations from the original brief, both logged in `docs/DECISIONS.md`:
no Next.js (ADR-0001) and no Redis (ADR-0002).

## Working rhythm - non-negotiable

- Build in small sequential chunks. One phase, or one feature inside a phase, at a time.
- After each chunk: state what was done, the exact file paths created or changed, and how
  to verify it. Then stop and wait for confirmation before the next chunk.
- Do not scaffold future phases ahead to save time. Ten small diffs beat one large one.
- Deliver changes as individual files, not archives.
- When something breaks, ask for the exact error output. Do not guess at causes and do not
  change three things at once hoping one of them is it.
- No emojis in any code file, test file, migration, script, or commit message. Prose
  documentation is also emoji free.
- Do not add a dependency without saying in the summary what it does and why nothing
  already installed covers it.

## Verify before you assume

Tailwind, shadcn/ui and the Supabase CLI all moved significantly in the last year. Before
running any init or add command, or writing config, check the current official docs for the
installed version and follow those. If the docs contradict an instruction on a mechanical
detail such as a flag name or a config path, follow the docs and log the deviation in
`docs/DECISIONS.md`.

## Git

Commit and push after every completed feature, or whenever roughly 200 meaningful changed
lines accumulate, whichever comes first. Lockfiles and generated types do not count.

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `db:`.
Scope where useful, for example `feat(ingest): add batch idempotency`.

Never commit `.env`, `.env.local`, service role keys, or anything under `supabase/.temp`.
Keep `.env.example` current with every variable documented and values blanked.

If `git push` fails, stop and show the error. Do not force push. Do not rewrite history.

## Hard rules

- Do not use Next.js, Redis, an ORM, or a state library beyond TanStack Query.
- Do not query `events_raw` from any dashboard screen except Live.
- Do not put the service role key anywhere the browser can reach.
- Do not write a migration that adds a table without its RLS policies in the same
  migration.
- Do not mock data to make a screen look finished. Use `scripts/seed-events.ts`.
- Do not skip the empty and error states. A chart without its empty state is incomplete.
- Do not fix a reported bug without first seeing the exact error output.
- Do not run ahead of the agreed phase.

## Skills

Load the relevant skill before the work it governs:

- `.claude/skills/design-system/SKILL.md` before any UI work.
- `.claude/skills/supabase/SKILL.md` before any migration, RLS policy, or Edge Function.
- `.claude/skills/engineering/SKILL.md` for commit format, chunk size, and reporting.

## Repository layout

    apps/web              Vite React dashboard
    packages/sdk          the browser and node snippet customers install
    supabase/migrations   timestamped, forward only
    supabase/functions    ingest, export-run, _shared
    scripts               seed-events.ts, backfill-rollups.ts
    docs                  architecture, data model, ingestion, runbook, decisions
    .claude/skills        design-system, supabase, engineering

## Current state

All twelve phases are complete. Last updated at the end of phase 12.

### What exists

- **Database**: 12 migrations. 22 tables in `public`, every one with row level security
  enabled. Four have RLS and deliberately zero policies, each with a SQL comment saying
  why: `api_key_secrets`, `rate_limit_buckets`, `query_cache`, `rollup_state`.
- **Schemas**: `public` for tables, `api` for the 14 read facing functions the dashboard
  calls, `jobs` for rollups and pruning, `authz` for the helpers policies evaluate.
- **Ingestion**: `supabase/functions/ingest`, all nine processing steps.
- **Exports**: `export-run` assembles files, `export-download` signs 15 minute URLs and
  audits every download.
- **Jobs**: rollups every 5 minutes, daily rollups hourly, cache sweep hourly, event
  pruning and export expiry nightly. All registered by migrations, not by hand.
- **SDK**: `packages/sdk`, 1801 bytes gzipped against a 5120 byte budget that a script
  enforces.
- **Dashboard**: 10 screens. Every data surface has a skeleton, an empty state and an
  error state.
- **Tests**: 28 unit, 63 database and integration, 5 Playwright. All passing.

### Measured, not assumed

Against 1,000,127 seeded events: `summary` 169ms, `funnel` 170ms, `retention` 73ms,
`timeseries` 12ms, everything else under 5ms. Plans in `docs/measurements/`. Rollup totals
equal raw event counts exactly.

### Known gaps, all deliberate

- **Multi-property filters** in the explorer. One property filter at a time, served from
  `rollup_property_daily`. Several at once needs a rollup per combination of properties,
  which is the cardinality problem this design exists to avoid. Trigger for revisiting is
  in `docs/ARCHITECTURE.md`.
- **Funnels and retention read `events_raw`** rather than rollups, because a conversion
  window depends on the gap between two individual events and aggregates have thrown that
  away. Bounded by a date range, an index, and the retention window. See ADR-0009.
- **`api.timeseries` filtered by a property** returns day grain only, because the property
  rollup is daily.
- **Daily session counts in `rollup_events_daily`** are summed from hourly rows and so
  slightly overstate sessions crossing midnight. The headline number on the overview screen
  does not use it: that reads `session_activity_daily` and is exact. See ADR-0010.
- **No billing, plan limits or quotas.** The rate limiter is per key and global.
- **No scheduled or emailed reports.** The export pipeline exists; the schedule does not.
- **`apps/web/src/types/database.ts` includes the `jobs` schema**, because tests and Edge
  Functions call it. The type describes the database; the grants decide who may call what.

### If you are picking this up cold

1. `npx supabase start`, then `node scripts/bootstrap-demo.ts`.
2. Read `docs/SUPABASE_GUIDE.md` if the stack is new to you. It uses this project as the
   worked example throughout.
3. `npm run verify` before every commit. `npm run test:db` needs the stack running.
4. Regenerate types after every migration: `npm run db:types`. Stale types produce
   confusing errors that look like code bugs.
5. Changing `supabase/config.toml` needs `supabase stop && supabase start`. A `db reset`
   will not pick it up.
