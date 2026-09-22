# Analytics

A self-serve product analytics platform. Customers drop a snippet into their app, events
flow into an ingestion endpoint, a scheduled job aggregates them into rollup tables, and
humans explore the results in a dashboard.

The entire backend is Supabase: Postgres for the schema, row level security and SQL
functions, Edge Functions for ingestion and exports, Supabase Auth for the dashboard,
Storage for export files, and `pg_cron` for scheduling. The frontend is a Vite single page
application that deploys as static files. There is no second server.

Two deliberate deviations from the original brief, no Next.js and no Redis, are argued in
[docs/DECISIONS.md](docs/DECISIONS.md) along with eight other decisions made while
building.

## What it does

**Collect.** A customer installs a 1.8 KB snippet. It buffers events, retries with
backoff, survives a page refresh, and flushes on unload with `sendBeacon` so the last event
before someone leaves is not lost. Every event carries a client-generated idempotency key,
so a retried batch is deduplicated rather than double counted.

**Aggregate.** A job runs every five minutes and pre-computes the numbers the dashboard
asks for. It walks the time events _arrived_ and recomputes the buckets they _happened_ in,
which is what lets a phone that was offline for three weeks upload its queue and still land
in the right place on the chart.

**Explore.** Headline numbers with period-over-period comparison, events over time, a
filterable explorer with saved views, a live feed, funnels, retention cohorts, CSV and JSON
exports, and an ingestion health screen that shows what was rejected and how fresh the
numbers are.

At one million events, every dashboard query returns inside a 300ms budget. Most take
under 10ms; the headline summary and retention take 250 to 290ms, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains why and what was tried.

## Status

All twelve build phases are complete. 28 unit, 63 database and integration, and 10
end-to-end tests pass. `CLAUDE.md` tracks current state and known gaps.

## Requirements

- **Node 24** (see `.nvmrc`). npm 11 ships with it.
- **Docker**, running. The local Supabase stack needs it.

## From clone to running, in about ten minutes

```bash
git clone https://github.com/Rishi2600/Analytics-dashboard-supabase.git
cd Analytics-dashboard-supabase
npm install

# Start Postgres, the API, auth, storage and Realtime as 12 Docker containers,
# and apply every migration. The first run pulls several GB of images.
npx supabase start

# Create a demo account, an organization, a project and an API key.
# Prints the project id and key you need next.
node scripts/bootstrap-demo.ts

# Point the web app at the local stack.
npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)=' \
  | sed 's/^API_URL=/VITE_SUPABASE_URL=/; s/^ANON_KEY=/VITE_SUPABASE_ANON_KEY=/' \
  | tr -d '"' > apps/web/.env.local

npm run dev
```

Sign in at http://localhost:5173 with `demo@example.test` and `demo-password-change-me`.

Two other ways in, both on the same screen. **Email me a sign-in link** sends a magic link;
locally no email is really sent, so open http://localhost:54324, the Mailpit inbox, and
click the link in the newest message. **Create an account** signs you up with any email and
a password of at least 8 characters.

### You need a second terminal for Edge Functions

`supabase start` does **not** serve Edge Functions, despite starting a container named
`edge_runtime`. Ingestion and exports return 404 until you run:

```bash
npm run functions      # npx supabase functions serve
```

This is worth knowing up front because the failure does not look like a missing process:
the dashboard loads perfectly and simply never receives an event.

### Starting and stopping the containers

| Command             | What it does                                       | Time                    |
| ------------------- | -------------------------------------------------- | ----------------------- |
| `npm run db:start`  | create and start all 12 containers                 | ~34s warm, minutes cold |
| `npm run db:stop`   | stop and **remove** them, keeping the data volumes | ~15s                    |
| `npm run db:pause`  | stop them without removing them                    | ~10s                    |
| `npm run db:resume` | start them again, waiting until healthy            | ~3s                     |
| `npm run db:status` | every container and its health                     | instant                 |

`db:stop` removes the containers, so `db:start` has to recreate them. For stepping away
rather than finishing for the day, `db:pause` and `db:resume` keep the same containers and
are roughly ten times faster to come back from. Your data survives either way: it lives in
three named Docker volumes, not in the containers.

### Send a test event

Use the API key that `bootstrap-demo.ts` printed:

```bash
curl -X POST 'http://127.0.0.1:54321/functions/v1/ingest' \
  -H 'Authorization: Bearer sk_live_your_key_here' \
  -H 'Content-Type: application/json' \
  -d '{"batch":[{"event":"test_event","distinct_id":"u_1","ingest_id":"evt_demo_1"}]}'
```

You should get `{"accepted":1,"duplicates":0,"rejected":[]}`, and the event appears on the
Live screen within a second.

**Run it a second time.** Now it returns `{"accepted":0,"duplicates":1,...}`. That is
idempotency working: the same `ingest_id` cannot be counted twice.

### Fill it with realistic data

```bash
node scripts/seed-events.ts --project <project-id> --events 1000000 --days 90
node scripts/backfill-rollups.ts --project <project-id>
```

Roughly two minutes to generate a million events with weekday seasonality, a power-law
distribution over users, realistic funnel drop-off, and a few percent arriving late.

Run the backfill every time you seed. Seeded events carry arrival times in the past, and
the scheduled rollup job only aggregates events that arrived after its last run, so once it
has run for a project it skips them. Without the backfill the charts come out empty or with
gaps. It recomputes every day that has raw events, in about 45 seconds for a million events.

## Commands

All from the repository root.

| Command                        | What it does                                                   |
| ------------------------------ | -------------------------------------------------------------- |
| `npm run dev`                  | the dashboard, with hot reload                                 |
| `npm run build`                | typecheck, then build to `apps/web/dist`                       |
| `npm run verify`               | lint, format check, typecheck, unit tests, build. What CI runs |
| `npm run test`                 | unit tests                                                     |
| `npm run test:db`              | database and integration tests. Needs the local stack running  |
| `npm run test:e2e`             | Playwright: sign-in, API keys, ingestion to live screen        |
| `npm run db:start` / `db:stop` | create, or stop and remove, the local Supabase stack           |
| `npm run db:pause` / `resume`  | fast stop and start that keeps the containers                  |
| `npm run functions`            | serve the Edge Functions. Needed for ingestion and exports     |
| `npm run db:reset`             | drop and replay every migration                                |
| `npm run db:types`             | regenerate TypeScript types from the schema                    |

## Feature notes

Written in the words a user would use.

**Projects and organizations.** An organization holds your team and billing. A project is
one app or site; events and API keys belong to a project. Four roles: owners do everything,
admins manage projects and people, members read and save views, viewers read only.

**API keys.** Public keys (`pk_live_`) go in browser code and can only write events, from
domains you list. Secret keys (`sk_live_`) are for your servers and are refused if a
browser sends one. A key is shown once; we store only a hash. Revoking keeps the record.

**Overview.** Total events, unique users, sessions and events per user, each with a
sparkline and a comparison against the previous equivalent period. The timezone every
number is cut in is shown next to the title, because it changes what the numbers mean.

**Events explorer.** Pick an event, filter by one property, break down by another, then
save the whole setup as a view you can reload or share with the project.

**Live.** Events as they arrive, over a websocket. Pausable, filterable, and every row
opens to show exactly what we stored.

**Funnels.** Ordered steps with a conversion window, showing how many people reach each
step and where they drop off.

**Retention.** Cohorts by the period of someone's first qualifying event, and how many came
back in each period after.

**Reports.** Export raw events, a time series or a breakdown as CSV or JSON. Runs in the
background; download links are signed and last fifteen minutes.

**Ingestion health.** Accepted against rejected over time, why events were rejected with
sample payloads, how far behind aggregation is, and which keys are sending. This screen is
why the numbers on the other screens are believable.

## Documentation

- [CLAUDE.md](CLAUDE.md) — operating rules and current state. Read first.
- [docs/SUPABASE_GUIDE.md](docs/SUPABASE_GUIDE.md) — Supabase from scratch, using this
  project as the worked example. Start here if the stack is new to you.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — trust boundaries, the life of one event,
  measured performance, and what was deferred.
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — every table and why it exists.
- [docs/INGESTION.md](docs/INGESTION.md) — the public API contract.
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — symptom, diagnosis, fix.
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — the design pass, tokens and principles.
- [docs/DECISIONS.md](docs/DECISIONS.md) — ten short architecture decision records.

## A note on secrets

Vite inlines every environment variable prefixed `VITE_` into the browser bundle. The anon
key belongs there and is safe, because row level security is what actually protects the
data. The service role key bypasses row level security entirely and must never carry that
prefix.

CI runs `scripts/check-bundle-secrets.sh` against the built output on every push, so this
mistake is caught by a machine rather than by a reviewer reading a diff.

## Deployment

**Frontend.** Static build to Vercel or Netlify. Build command `npm run build`, output
directory `apps/web/dist`, and the two `VITE_` variables set in the host's environment.

**Everything else.**

```bash
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase functions deploy
npx supabase secrets set INGEST_IP_HASH_SALT="$(openssl rand -hex 32)"
```

The `pg_cron` schedules are registered by the migrations, so they exist as soon as the
schema does.
