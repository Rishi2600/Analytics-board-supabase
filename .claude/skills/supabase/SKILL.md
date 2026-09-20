---
name: supabase
description: Migration rules, the RLS checklist, key handling, Edge Function conventions, and local stack commands for this project. Load before any migration, policy, SQL function, or Edge Function work.
---

# Supabase conventions

Everything server side in this project is Supabase. There is no other backend.

## Schemas

- `public` - application tables. RLS on every one of them, no exceptions.
- `api` - read facing SQL functions the dashboard calls with `supabase.rpc()`.
- `jobs` - internal job functions. No client grants at all, ever.

The frontend never runs an ad hoc table query for analytics data. It calls an `api`
function. The only function allowed to read `events_raw` is `api.live_events`.

## Migrations

- Timestamped and forward only: `supabase/migrations/<YYYYMMDDHHMMSS>_<short_name>.sql`.
  Create with `npx supabase migration new <short_name>` so the timestamp is correct.
- Never edit a migration that has been applied to the hosted project. Write a new one.
- Every migration is idempotent enough to be safe on re-run where that costs nothing:
  `create table if not exists`, `drop policy if exists` before `create policy`.
- A migration that adds a table adds its RLS policies in the same migration. Not the next
  one. Not "later in the phase". The same file.
- Comment non-obvious columns in SQL with `comment on column ... is ...` so the database
  explains itself to the next person.

## The RLS checklist

Run through all five for every new table, in the same migration:

1. `alter table <t> enable row level security;`
2. Read policy, scoped through the shared membership predicate.
3. Write policies, separate from the read policy, checking role. `viewer` cannot mutate
   anything, `member` cannot manage keys, `admin` cannot delete the org.
4. An isolation test asserting org A cannot see org B's rows.
5. If the table is deliberately service role only, enable RLS with zero policies and leave
   a SQL comment saying why. Silence is indistinguishable from a mistake.

Service role only tables: `api_key_secrets`, `rate_limit_buckets`, `query_cache`,
`rollup_state`.

Policies call the `stable security definer` helper `auth.current_user_org_ids()` with its
`search_path` pinned, rather than running a membership subquery per row. Project scoped
tables go through a single shared predicate helper so the rule is written once instead of
copy pasted across twenty policies.

Deny by default. If you cannot name the policy that lets a row through, it does not get
through.

## Keys - which key goes where

- **anon / publishable key** - safe in the browser bundle, in `.env.local` as
  `VITE_SUPABASE_ANON_KEY`. It is public by design and useless without RLS, which is the
  whole point of the RLS checklist above.
- **service role key** - bypasses RLS completely. Server side only: Edge Function secrets
  and local scripts. It must never appear in anything prefixed `VITE_`, because Vite inlines
  those into the client bundle. Grep the build output before shipping.
- **project API keys** (`pk_live_*`, `sk_live_*`) - ours, not Supabase's. Customer facing,
  write only, checked by the ingest function against a hash. Never stored in plaintext.

## Edge Functions

- One directory per function under `supabase/functions/`. Shared code lives in
  `supabase/functions/_shared/`: auth, cors, validation, rate limit, responses.
- Deno and TypeScript. Import with explicit versioned specifiers.
- Every non-2xx response carries a stable machine readable `error.code`.
- Structured JSON logs, one per request, with key id, project id, counts, duration, and
  outcome. No unstructured `console.log` debris left behind.
- Never leak whether a key exists. Unknown and revoked both return the same 401.
- Secrets are set with `npx supabase secrets set NAME=value`, never committed.

## Commands

    npx supabase start                       start the local stack
    npx supabase stop                        stop it
    npx supabase status                      local URLs and keys
    npx supabase migration new <name>        create a timestamped migration
    npx supabase db reset                    rebuild local from migrations plus seed.sql
    npx supabase db push                     apply pending migrations to the linked project
    npx supabase link --project-ref <ref>    link this repo to the hosted project
    npx supabase functions serve <name>      run a function locally
    npx supabase functions deploy <name>     deploy it
    npx supabase secrets set KEY=value       set a function secret

Regenerate types after every schema change, and never hand edit the result:

    npx supabase gen types typescript --local > apps/web/src/types/database.ts

## Where to read logs

Postgres logs, API logs, and per function logs are three separate views in the Supabase
dashboard. Local equivalents come from `npx supabase logs`. When ingestion misbehaves,
the function log is the first place to look, not the Postgres log.

## pg_cron

Jobs are registered in a migration with `cron.schedule`, so the schedule is version
controlled rather than clicked into a dashboard. Inspect with `select * from cron.job` and
check history in `cron.job_run_details`. Every job also writes its own row to `rollup_runs`
so failures are visible in the product, not only in the database.

## Five mistakes to avoid on this stack

1. Creating a table and enabling RLS but writing no policy, then debugging "empty results"
   that are the database working correctly.
2. Putting the service role key in a `VITE_` variable and shipping it to the browser.
3. Editing an already applied migration instead of writing a new one, which desynchronises
   local and hosted.
4. Writing a policy with a per row subquery, which is correct and unusably slow.
5. Trusting `ts` from the client for aggregation. The rollup job walks `received_at`. See
   `docs/INGESTION.md`.
