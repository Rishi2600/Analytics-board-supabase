# Analytics

A self-serve product analytics platform. Customers drop a snippet into their app, events
flow into an ingestion endpoint, a scheduled job aggregates them into rollup tables, and
humans explore the results in a dashboard.

The whole backend is Supabase: Postgres for the schema, row level security and SQL
functions, Edge Functions for ingestion and exports, Supabase Auth for the dashboard,
Storage for export files, and pg_cron for scheduling. The frontend is a Vite single page
application that deploys as static files. There is no second server. Two deliberate
deviations from the original brief, no Next.js and no Redis, are argued in
[docs/DECISIONS.md](docs/DECISIONS.md).

## Status

Phase 0 of 12 is complete: the foundation. The toolchain builds, lints, typechecks, tests
and ships a bundle that CI checks for leaked secrets. There is no database, no
authentication and no dashboard yet. `CLAUDE.md` tracks exactly what is done and what is
next, including the gaps.

## Requirements

- Node 24 (see `.nvmrc`). npm 11 ships with it, and npm workspaces is the package manager.
- Nothing else yet. The Supabase CLI arrives with phase 1 as a local dependency, so it
  does not need a global install.

## Running it locally

```bash
git clone <this repository>
cd Analytics-dashboard-supabase
npm install
cp .env.example .env.local   # values are filled in during phase 1
npm run dev
```

The dashboard is served at the URL Vite prints, usually http://localhost:5173.

## Commands

All of these run from the repository root.

| Command                | What it does                                                   |
| ---------------------- | -------------------------------------------------------------- |
| `npm run dev`          | start the dashboard with hot reload                            |
| `npm run build`        | typecheck, then build the production bundle to `apps/web/dist` |
| `npm run lint`         | ESLint across every workspace, including type aware rules      |
| `npm run format`       | rewrite files with Prettier                                    |
| `npm run format:check` | fail if anything is unformatted, which is what CI runs         |
| `npm run typecheck`    | `tsc -b` across every workspace                                |
| `npm run test`         | Vitest, once, no watch                                         |
| `npm run verify`       | everything above in the order CI runs it                       |

## Sending a test event

Not yet. The ingestion endpoint is built in phase 4, and this section becomes a working
`curl` command then. It is called out here rather than left silent so the gap is visible.

## Layout

```
apps/web              the dashboard: Vite, React 19, TypeScript strict, Tailwind v4, shadcn/ui
packages/sdk          the snippet customers install (phase 5)
supabase/migrations   schema and row level security, timestamped and forward only (phase 1)
supabase/functions    Edge Functions: ingest, export-run, and shared modules (phase 4)
scripts               seeding, rollup backfill, and the CI bundle secret check
docs                  architecture, data model, ingestion contract, runbook, decisions
.claude/skills        the rules a future session loads before design, database or commit work
```

## Documentation

- [CLAUDE.md](CLAUDE.md) - operating rules and current state. Read this first.
- [docs/DECISIONS.md](docs/DECISIONS.md) - short architecture decision records.
- The remaining documents, covering architecture, the data model, the ingestion contract,
  the runbook and a Supabase teaching guide, are written alongside the phases that make
  them true rather than at the end.

## A note on secrets

Vite inlines every environment variable prefixed `VITE_` into the browser bundle. The anon
key belongs there and is safe, because row level security is what actually protects the
data. The service role key bypasses row level security entirely and must never carry that
prefix. CI runs `scripts/check-bundle-secrets.sh` against the built output on every push so
that mistake is caught by a machine rather than by a reviewer.

## Deployment

The frontend builds to static files and deploys to Vercel or Netlify: build command
`npm run build`, output directory `apps/web/dist`. Supabase hosts everything else.
Deployment is documented properly once there is a backend to deploy against.
