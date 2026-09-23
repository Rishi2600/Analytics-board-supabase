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
    supabase/functions    ingest, export-run, export-download, _shared
    scripts               bootstrap-demo, seed-events, backfill-rollups, stack.sh
    tests                 database and integration tests, need the local stack
    e2e                   Playwright, needs the stack plus a dev server
    docs                  architecture, data model, ingestion, runbook, decisions
    .claude/skills        design-system, supabase, engineering

## Current state

All twelve phases are complete, plus a frontend redesign on the `ui-redesign` branch that
also fixed four screens which never loaded for a signed-in user. Last updated 2026-09-23.
`docs/UI_REDESIGN_REPORT.md` is the plain-language summary of that work.

### What exists

- **Database**: 14 migrations. 22 tables in `public`, every one with row level security
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
- **Dashboard**: 10 screens on shadcn/ui: Sidebar, Card, Chart, Field, Empty, Alert and
  AlertDialog. Every data surface has a skeleton, an empty state and an error state, and
  every data screen has a provenance line (timezone, range, freshness) under its title.
  Destructive actions go through a confirmation. Works at 320px and at 200% zoom.
- **Forcing a state**: add `?state=loading`, `?state=empty` or `?state=error` to any URL in
  development. `lib/dev-state.ts`; CI proves it is not in the production bundle.
- **Screenshots**: `npm run screenshots` captures every screen, state, theme and width into
  `docs/screenshots/` (gitignored). `node scripts/seed-demo-extras.ts` fills the panels the
  event seed does not reach, through the real ingest, export and invite paths.
- **Sign in**: password, magic link and GitHub on one screen, with account creation. The
  password floor is 8 characters, set in the form and in `auth.minimum_password_length`
  so the API enforces it too. See ADR-0011.
- **Tests**: 30 unit, 68 database and integration, 15 Playwright. All passing.

### Measured, not assumed

Against 1,726,456 seeded events, warm, as the `authenticated` role a browser uses: `summary`
about 40ms over 7 days and 200ms over 90, `funnel` about 255ms, `retention` about 295ms,
`breakdown` 4ms. Summary over 30 days sits on the 300ms line, at 288 to 336ms.
`docs/ARCHITECTURE.md` has every run and what was tried.

Measure as a signed-in user, never as `postgres`. Before ADR-0013 the same three functions
took 91s, 43s and over 60s for a real user while psql, which skips row level security,
reported 33ms. Rollup totals equal raw event counts exactly.

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
- **No password reset, and no way to add a password to an account created by a magic
  link.** Both are single Supabase Auth calls, neither is wired up. See ADR-0011.
- **No automated accessibility audit.** Playwright covers dialog escape, confirmation on
  revoke, the skip link, touch row actions and phone navigation, and every colour pair was
  measured, but nothing runs axe. It would be a new dependency.
- **Date ranges are presets only.** A custom range needs a calendar, which needs
  `react-day-picker`, a new dependency.
- **Charts have a legend and a tooltip but no table of their numbers** for screen reader
  users.

### If you are picking this up cold

1. `npm run db:start`, then `node scripts/bootstrap-demo.ts`. Between sessions use
   `npm run db:pause` and `npm run db:resume`, which keep the containers and are about ten
   times faster than a stop and start.
2. `npm run functions` in a second terminal. For a demo with every panel filled, then run
   `node scripts/seed-events.ts` and `node scripts/seed-demo-extras.ts`. `db:start` does not serve Edge Functions, so
   without it ingestion and exports return 404 while the dashboard looks fine.
3. Read `docs/SUPABASE_GUIDE.md` if the stack is new to you. It uses this project as the
   worked example throughout.
4. `npm run verify` before every commit. `npm run test:db` needs the stack running, and
   `npm run test:e2e` needs the stack plus Chromium.
5. Regenerate types after every migration: `npm run db:types`. Stale types produce
   confusing errors that look like code bugs.
6. Changing `supabase/config.toml` needs `npm run db:stop && npm run db:start`. A
   `db reset` will not pick it up, and neither will pause and resume.
