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

Phase 0 - Foundation. Complete.

Done:

- Operating rules and the three skill files, written before any code.
- ADR-0001 through ADR-0006 in `docs/DECISIONS.md`.
- npm workspaces at the root, with `apps/web` scaffolded from create-vite 9:
  React 19.2, TypeScript 6 with `strict` and `noUncheckedIndexedAccess` set explicitly,
  Vite 8.
- Tailwind v4.3 through `@tailwindcss/vite`. The single token file is
  `apps/web/src/index.css`, because v4 has no JavaScript config. See ADR-0004.
- shadcn/ui initialised with the Radix base and the Nova preset, which is the Lucide and
  Geist combination the design direction calls for.
- ESLint 10 flat config at the root with type aware rules, replacing the oxlint the
  template now ships. Prettier with the Tailwind class sorting plugin. See ADR-0006.
- Vitest with jsdom and Testing Library. Two smoke tests that prove the toolchain and the
  `@` alias resolve.
- GitHub Actions CI running lint, format check, typecheck, test, build, and a check that
  no service role or secret key material reached the built bundle.
- `.env.example` documenting every variable, including which ones may be public and why.

Next up:

- Phase 1, Supabase base and auth: link the project, migration 001 for organizations,
  members, projects and invites with full row level security, the
  `auth.current_user_org_ids()` helper, generated types, magic link and GitHub OAuth,
  protected routes, and onboarding. Load `.claude/skills/supabase/SKILL.md` first.

Known gaps, deliberate at this point:

- No Supabase project linked, no migrations, no generated `types/database.ts`.
- `apps/web/src/App.tsx` is a placeholder. The shell, routing and theming are phase 2 and
  come after the design pass in `docs/DESIGN_SYSTEM.md`.
- The shadcn token values in `index.css` are still the neutral defaults. The Instrument
  palette replaces them in phase 2.
- `packages/sdk` and `supabase/` hold no code yet. `supabase/functions` is excluded from
  ESLint until phase 4 gives it a Deno specific configuration.
- README has no working `curl` example yet. It cannot have one until phase 4.
