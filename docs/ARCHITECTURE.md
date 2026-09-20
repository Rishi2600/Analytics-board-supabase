# Architecture

How the system fits together, what an event does from the moment it is fired to the moment
it becomes a pixel, and what was deliberately left out.

## The three trust boundaries

Everything here follows from one idea: three surfaces, three different kinds of caller,
three different sets of rules. Confusing them is the failure mode that turns a bug into a
breach.

| Surface       | Who calls it                    | How it authenticates        | What it may do                     |
| ------------- | ------------------------------- | --------------------------- | ---------------------------------- |
| Ingestion API | our customers' apps and servers | a project API key we issued | write events, nothing else         |
| Dashboard     | humans signed in to our web app | a Supabase Auth session     | read, scoped to their organization |
| Jobs          | our own cron and Edge Functions | the service role            | everything, server side only       |

The properties that hold these apart:

- **The dashboard never sees the service role key.** It is an Edge Function secret. CI
  greps the built bundle on every push for `service_role`, `sk_live_` and `sb_secret_`.
- **The ingestion API never reads user data.** It resolves a key, checks a rate limit, and
  inserts. It has no code path that returns an event.
- **Jobs are unreachable from a browser.** The `jobs` schema has no `USAGE` grant for
  `anon` or `authenticated`, so no client can call anything in it, now or after someone
  adds a function to it later without thinking.

Row level security is what enforces the second row of that table, on every single table in
`public`. There are exactly two tables with RLS enabled and no policies at all,
`api_key_secrets` and `rate_limit_buckets`, and both carry a SQL comment saying why.

## The life of one event

1. **A customer's page calls `track('checkout_completed', { plan: 'pro' })`.** The SDK
   stamps it with a `distinct_id`, a `session_id`, a timestamp and an `ingest_id` it
   generates locally, then buffers it. Nothing is sent yet.

2. **The buffer flushes** at 20 events, after 5 seconds, or when the page is hidden. On
   the hidden path it uses `sendBeacon`, because `fetch` is cancelled when a page goes
   away and the last event before someone leaves is usually the interesting one.

3. **`POST /functions/v1/ingest`.** The function runs nine steps in a fixed order: CORS
   preflight, body size guard, key resolution, rate limit, validation, timestamp clamping,
   enrichment, insert, respond. The order matters, and the reasoning for each step is in
   `docs/INGESTION.md`.

4. **The insert is one statement** with `ON CONFLICT (project_id, ingest_id) DO NOTHING`.
   A retried batch inserts nothing and still returns success, so the client's retry logic
   is safe by construction rather than by agreement.

5. **The response is `202`**, with an accepted count, a duplicate count, and a per-index
   list of anything rejected. A partially bad batch keeps its good events.

6. **Within five minutes, `jobs.run_rollups()` runs.** It asks which `ts` buckets were
   touched by rows whose `received_at` is newer than its watermark, and recomputes each of
   those buckets from scratch. It then bumps `projects.cache_epoch`.

7. **Someone opens the dashboard.** The screen calls `api.summary()` and
   `api.timeseries()`. Those read the rollup tables, convert UTC buckets into the project's
   timezone, and return a few hundred rows.

8. **TanStack Query caches the result** for 30 seconds, or five minutes if the range is
   historical and therefore cannot change.

The slowest part of that chain, at a million events, is 170 milliseconds.

## Why the rollup job walks `received_at`

This is the piece that is easy to get wrong and expensive to discover.

Each event carries two timestamps. `ts` is when the customer says it happened; it is what
charts bucket by. `received_at` is when we observed it.

The tempting implementation is "aggregate everything with a `ts` newer than the last thing
I aggregated". It works perfectly until a phone that was offline for three days comes back
and uploads its queue. Those events have a `ts` from three days ago, which is far behind
the watermark, so the job never looks at them. The events are in the database and will
never appear in a chart. Nothing errors. Nobody finds out until a customer reconciles
against their own data.

So the job filters on `received_at`, which only ever moves forward, and groups by `ts`. It
collects the set of `ts` buckets that the new rows belong to and recomputes each one in
full. Full recompute rather than incremental addition is what makes the job idempotent:
running it twice, or crashing halfway and retrying, gives the same answer.

There is a test for this. `tests/rollups.test.ts` inserts an event with a `ts` of 21 days
ago and a `received_at` of now, runs the job, and asserts the bucket from three weeks ago
grew by exactly one.

## Why unique counts get their own tables

Counts add up across time buckets. Unique counts do not.

If 100 people are active in hour one and 100 in hour two, the number of unique people that
day is somewhere between 100 and 200, and no amount of arithmetic on those two numbers will
tell you which. The information needed to answer it was thrown away when the hourly rows
were written.

So `user_activity_daily` stores membership rather than a count: one row per user per day
they were active. `count(distinct)` over that narrow table is cheap, and exact.
`session_activity_daily` exists for the same reason: a session running from 10:55 to 11:05
appears in two hourly buckets, and summing `session_count` counts it twice.

## Caching, and the Redis that is not here

ADR-0002 replaced Redis with three layers. In order of how much work they actually do:

1. **Rollup tables.** The real fix. A query that reads 900 daily rows instead of two
   million event rows does not need a cache in front of it. Caching is what you reach for
   when the underlying query is too expensive; the better move is to make it cheap.

2. **`query_cache`**, an unlogged Postgres table with a TTL and a per project epoch, for
   expensive ad hoc breakdowns. The cache key is
   `sha256(project_id || fn_name || normalised_params || cache_epoch)`. A rollup run
   increments `projects.cache_epoch`, which makes every existing entry for that project
   unreachable in one integer write, with no delete sweep and no scan.

3. **TanStack Query** in the browser, which removes most repeat traffic before it becomes
   a request at all.

Unlogged is deliberate: a cache that survives an unclean restart is not worth paying
write ahead logging for on every entry.

## Performance

Measured on this machine against **1,000,127 seeded events** across 90 days, 5,555 users.
Plans are in `docs/measurements/`.

| Function                   | Time  | What dominates                              |
| -------------------------- | ----- | ------------------------------------------- |
| `api.summary`              | 169ms | four distinct counts over membership tables |
| `api.funnel` (4 steps)     | 170ms | per user index lookups on `events_raw`      |
| `api.retention` (8 weeks)  | 73ms  | cohort assignment over `events_raw`         |
| `api.timeseries` (30 days) | 12ms  | 12,698 hourly rollup rows                   |
| `api.top_events`           | 4ms   | grouped rollup scan                         |
| `api.breakdown`            | 2ms   | property rollup index scan                  |
| `api.live_events`          | 1ms   | index scan, 100 rows                        |
| `jobs.run_rollups` (full)  | 17.8s | one off, aggregating all 1M events          |

Two of these needed work to get there, and both are worth recording because the first
attempt was not slow for an obvious reason.

**`api.summary` was 534ms.** The cost was four `count(distinct ...)` calls. Postgres
implements `count(distinct)` with a sort, always. Rewriting each as
`count(*) from (select distinct ...)` lets the planner choose a hash aggregate instead,
which measured 27.9ms against 85.7ms for the same 73,425 rows. Four counts, so the saving
multiplied.

**`api.funnel` was 1349ms.** Each step asks "did this user do the next event, after the
previous one, within the window". That is a lookup by
`(project_id, distinct_id, event_name, ts)`, and no index covered it, so every step scanned
a large slice of `events_raw`. Adding that index took the whole funnel to 170ms.

### Verifying these numbers

```bash
npx supabase start
node scripts/bootstrap-demo.ts                       # prints a project id
node scripts/seed-events.ts --project <id> --events 1000000
psql "$(npx supabase status -o env | grep DB_URL | cut -d'"' -f2)" \
  -c "analyze" -c "select jobs.run_rollups()" -c "\timing on" \
  -c "select * from api.summary('<id>', now() - interval '30 days', now())"
```

## Correctness checks that run in CI

- Two organizations cannot see each other's data. 24 assertions across tables, roles and
  write paths, using real sessions rather than inspection.
- Replaying an ingest batch twice produces one event.
- A 21 day late event lands in its correct historical bucket.
- Rollup totals equal raw event counts exactly.
- Running the rollup job twice changes nothing.
- The built bundle contains no service role or secret key material.

## Deliberately deferred

None of these are oversights. Each is a thing we know how to do, chose not to do at this
scale, and has a trigger that would change the answer.

**Partitioning `events_raw` by month**, with automated partition creation and drop-based
pruning. Today it is a plain table with four indexes, and delete-based retention is fine.
_Trigger:_ the table passes roughly 50 million rows, or the nightly prune starts causing
bloat that autovacuum cannot keep up with.

**HyperLogLog for unique counts**, via the `hll` extension, replacing `user_activity_daily`
with sketches. Sketches trade exactness for space, and at 196,000 rows exactness is free.
_Trigger:_ `user_activity_daily` approaches the row count of `events_raw` itself, which
happens when most users fire one event per day.

**A real queue in front of ingestion**, pgmq or an external broker, so the endpoint writes
to a buffer rather than to the destination table. Today the insert is synchronous and takes
single digit milliseconds. _Trigger:_ sustained ingest above what one synchronous insert
path absorbs, or a need to survive the database being briefly unavailable without dropping
events.

**External Redis for the query cache.** The interface is one module, so this is a one file
change. _Trigger:_ `query_cache` contention shows up in Postgres wait events, or we need a
cache shared across regions.

**Multi-property filtering in the explorer.** Today one property filter is served from
`rollup_property_daily`. Answering "plan is pro AND country is IN" from pre-aggregated data
needs a rollup per combination of properties, and that cardinality is exactly what this
design avoids. _Trigger:_ enough customers ask that a bounded raw scan, with a hard range
limit and its own index, becomes worth the cost.

**Scheduled and emailed reports** on top of the export pipeline. The exports table, the
worker and the storage path already exist; this is a schedule and an email template.
_Trigger:_ a customer asks for a Monday morning summary.

**A columnar store such as ClickHouse** for the event table, which the original brief
mentioned. _Trigger:_ rollup recomputation stops fitting inside the five minute cron
interval, and partitioning plus better indexes have already been tried.

**Multi-region ingestion** with edge local buffering. _Trigger:_ customers outside the
database's region see ingestion latency that affects their page performance.

**Billing, plan limits and quota enforcement.** There is no billing at all today. The rate
limiter is per key and global rather than per plan. _Trigger:_ the first paying customer.

**Session replay, alerting, and anomaly detection.** Out of scope entirely, and each is a
product rather than a feature.
