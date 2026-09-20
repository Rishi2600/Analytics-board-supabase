# Supabase, for someone who has not used it

This is the teaching document. It assumes you are a competent engineer who has never
touched Supabase, and it uses this project as the worked example throughout. By the end you
should be able to run it, change the database, deploy a function, and work out what is
wrong when something breaks.

---

## 1. What a Supabase project actually is

The marketing says "open source Firebase alternative", which is unhelpful. Concretely, a
Supabase project is **one Postgres database** plus a handful of services pointed at it:

| Service        | What it does                                             | How you reach it here                     |
| -------------- | -------------------------------------------------------- | ----------------------------------------- |
| Postgres       | the database. Your tables, functions, triggers           | migrations in `supabase/migrations`       |
| PostgREST      | turns tables and functions into a REST API automatically | `supabase.from(...)`, `supabase.rpc(...)` |
| GoTrue         | authentication: users, sessions, OAuth, magic links      | `supabase.auth.*`                         |
| Realtime       | streams database changes over websockets                 | the Live screen                           |
| Storage        | an S3-like file store, with its own permissions          | export files                              |
| Edge Functions | Deno/TypeScript functions at the edge                    | `supabase/functions/*`                    |

The thing to internalise: **it is all one Postgres database, and almost every question has
a SQL answer.** "How do I secure this API?" is a SQL question. "How do I schedule a job?"
is a SQL question. If you keep looking for a Supabase-specific configuration screen, you
will miss that the answer is usually a migration.

The single most important consequence: **PostgREST exposes your tables directly to the
internet.** A table you create with no further thought is readable by anyone with the
public key, unless row level security says otherwise. That is section 3, and it is the
section to read twice.

---

## 2. The keys, and where each may legitimately appear

This is where newcomers cause real damage, so be precise about it.

### The anon key (newer projects call it the publishable key)

- Looks like a JWT (`eyJhbGci...`), or `sb_publishable_...` in newer projects.
- **Safe in the browser.** It is _designed_ to be public. It is in this project's bundle.
- It carries the Postgres role `anon` before login and `authenticated` after.
- It grants nothing by itself. What it can read is entirely determined by row level
  security.

In this project: `apps/web/.env.local` as `VITE_SUPABASE_ANON_KEY`, and it ends up inlined
into the JavaScript bundle. That is correct and intended.

### The service role key (newer projects: the secret key)

- Also a JWT, or `sb_secret_...`.
- **Bypasses row level security completely.** Every policy is ignored. It can read and
  write every row in every table of every customer.
- Belongs on a server, and nowhere else.

In this project: an Edge Function secret, and a local environment variable for
`scripts/seed-events.ts`. It appears in `.env.example` **without** a `VITE_` prefix, and
that prefix is the whole point:

> **Vite inlines every variable starting with `VITE_` into the browser bundle.**
> A secret with that prefix is a published secret. There is no undo.

Because this is easy to do and catastrophic, CI greps the built bundle for secret shapes on
every push (`scripts/check-bundle-secrets.sh`). Do not remove that check.

### Our own project API keys

`pk_live_...` and `sk_live_...` are **ours**, not Supabase's. They authenticate customers
to our ingestion endpoint and are unrelated to everything above. See `docs/INGESTION.md`.

### Quick test

If you are unsure whether a key can be public, ask: _if a stranger had this, what could
they do?_ With the anon key: exactly what row level security allows an anonymous or
signed-in user to do. With the service role key: everything, to everyone's data.

---

## 3. Row level security, with a before and after

Row level security (RLS) is a Postgres feature where the **database** decides which rows
each query can see, based on who is asking. Supabase leans on it completely, because
PostgREST will happily serve any table you expose.

### Without it

Say we create a table and forget:

```sql
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null
);
grant select on public.projects to authenticated;
```

Now any signed-in user, anywhere in the world, runs this from their browser console:

```js
const { data } = await supabase.from('projects').select('*')
```

and receives **every project belonging to every customer**. Not a bug in your code. Your
code was never consulted. The API did exactly what it was configured to do.

### With it

```sql
alter table public.projects enable row level security;

create policy projects_select on public.projects
  for select to authenticated
  using (org_id = any (authz.current_user_org_ids()));
```

The same query now returns only that user's projects. The filter is applied inside
Postgres, so it cannot be bypassed by crafting a different request, and it applies to
Realtime subscriptions too.

Three things that catch people out:

1. **Enabling RLS with no policy denies everything.** That is correct behaviour, not a
   bug, and it looks exactly like "my query returns an empty array for no reason". If a
   query mysteriously returns nothing, check for a policy first.

2. **Policies are per operation.** `for select` does not grant `insert`. This project keeps
   read and write policies separate on purpose, so that a `viewer` can read a project and
   change nothing in it.

3. **`security definer` functions bypass RLS.** A function marked `security definer` runs
   with its creator's privileges, which here means it ignores every policy. That is
   sometimes exactly what you need, and it means the permission check the policy would have
   done has to be written by hand, as the first thing in the function body. Look at
   `api.create_api_key` in migration 002: the membership check is line one of the body for
   this reason.

### Seeing it work

```bash
npm run test:db
```

`tests/rls-tenancy.test.ts` creates two real users in two real organizations and asserts
that neither can read, write, or even detect the other's data. That is the difference
between believing your policies are right and knowing it.

---

## 4. Migrations

A migration is a `.sql` file. They run in filename order, once each, and Supabase records
which have been applied in `supabase_migrations.schema_migrations`.

### Creating one

```bash
npx supabase migration new add_widgets
```

This creates `supabase/migrations/20260921120000_add_widgets.sql`. **Always use this
command** rather than naming the file by hand: the timestamp prefix is what determines
order, and a hand-typed one that sorts wrongly will apply in the wrong sequence on a fresh
database while appearing fine on yours.

### Applying

```bash
npx supabase migration up --local   # apply pending migrations to the local database
npx supabase db reset               # drop everything, replay every migration, then seed
npx supabase db push                # apply pending migrations to the LINKED hosted project
```

`db reset` is the one to trust. It proves every migration works from nothing, which is what
will happen on a colleague's machine and in CI. A migration that only works on a database
that already has the previous state is a migration that will fail in production.

### Rolling back

There is no `migrate down`. This is deliberate, and it is the industry direction: down
migrations are written once, never tested, and fail when you need them.

**Roll forward instead.** To undo `add_widgets`, write a new migration that drops the
table. To fix a bad column type, write a new migration that alters it.

The exception is local development. If a migration is not yet committed and has never left
your machine, edit it and run `npx supabase db reset`. Once it is pushed, it is history.

### The rule this project holds to

**A migration that creates a table creates its RLS policies in the same file.** Not the
next migration, not later in the phase. Look at any migration here: table, then
`enable row level security`, then policies, in one file. The gap between those three
statements is a window where the table is either wide open or completely closed, and
splitting them across files makes that window last until someone remembers.

### Ordering gotcha, learned the hard way here

A function written in plain SQL has its body validated **when it is created**. So a helper
that reads a table has to be created _after_ that table, and a policy that calls a helper
has to come _after_ the helper. Migration 001 in this repository is laid out in exactly
that order, with a comment saying why, because the first version was not and failed with
`relation "public.org_members" does not exist`.

---

## 5. Running it locally, and linking to a hosted project

### Local

You need Docker running. Then:

```bash
npx supabase start     # first run pulls several GB of images
npx supabase status    # prints every local URL and key
npx supabase stop      # frees the containers
```

`supabase start` gives you a complete stack on your machine: Postgres on 54322, the API on
54321, Studio (a database GUI) on 54323, and a mail catcher on 54324 where magic link
emails land instead of being sent.

The local keys are the same well-known constants for everyone. They are not secrets, and
nothing in this repository hardcodes them anyway: tests and scripts read them from
`npx supabase status -o env`.

### Hosted

```bash
npx supabase login
npx supabase link --project-ref <ref>   # the subdomain of your project URL
npx supabase db push                    # apply local migrations to it
```

Once linked, `supabase/.temp` holds local state about the link. It is gitignored, and it
should stay that way.

**Configuration changes need a restart.** Editing `supabase/config.toml` (for example
adding a schema to the exposed list) does _not_ take effect on `db reset`, because that
only touches the database. You need `npx supabase stop && npx supabase start`. This cost me
three confusing debugging cycles while building this; do not repeat them.

---

## 6. Edge Functions

An Edge Function is a Deno TypeScript file that runs on request. Deno, not Node: imports
are URLs or `npm:` specifiers, and there is no `node_modules`.

### Writing one

```ts
// supabase/functions/hello/index.ts
Deno.serve(async (request: Request): Promise<Response> => {
  const { name } = await request.json()
  return new Response(JSON.stringify({ hello: name }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

Shared code goes in `supabase/functions/_shared/` and is imported with a relative path
including the `.ts` extension: `import { corsHeaders } from '../_shared/cors.ts'`. The
extension is required; Deno does not guess.

### Running and deploying

```bash
npx supabase functions serve            # all functions, locally, with hot reload
npx supabase functions deploy ingest    # deploy one
npx supabase functions deploy           # deploy all
```

### The JWT gotcha

By default, Supabase verifies a JWT in the `Authorization` header **before your code
runs**. That is right for a function called by your dashboard, and wrong for a function
called by a customer's server with a key of our own design.

The ingestion endpoint takes `Authorization: Bearer pk_live_...`, which is not a JWT, so
the platform would reject every request before we ever saw it. Hence, in `config.toml`:

```toml
[functions.ingest]
verify_jwt = false
```

This is not a hole. The function's first action is to resolve the presented key against a
salted hash and refuse anything it does not recognise. The check moved; it did not
disappear.

`export-run` and `export-download` keep the default, because the dashboard calls them with
a real user session.

### Secrets

```bash
npx supabase secrets set INGEST_IP_HASH_SALT="$(openssl rand -hex 32)"
npx supabase secrets list
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically. You do not set those, and you must not commit them.

---

## 7. Where to read logs

Three different places, and picking the wrong one wastes a lot of time.

| Question                              | Look at                                         |
| ------------------------------------- | ----------------------------------------------- |
| Did my query error, or was it slow?   | Postgres logs                                   |
| Did the request reach the API at all? | API logs                                        |
| Did my Edge Function throw?           | that function's logs                            |
| Did my cron job run?                  | `cron.job_run_details`, plus `rollup_runs` here |

Locally:

```bash
npx supabase logs --type postgres
npx supabase logs --type edge-function
docker logs supabase_edge_runtime_<project-name>   # when you want raw output
```

Hosted: the Logs section of the dashboard, with a selector for each service.

**When ingestion misbehaves, start with the function log, not the database log.** The
function log will show you a structured line per request with the key id, project id,
counts, duration and outcome, which is usually the whole answer.

One warning worth internalising: a `catch` that does `error instanceof Error ? ... : 'unknown'`
will log `unknown` for the most common failures, because Supabase returns `PostgrestError`
objects rather than `Error` instances. Every catch in this repository handles that, and
the reason is a comment in `supabase/functions/ingest/index.ts`.

---

## 8. pg_cron

`pg_cron` runs SQL on a schedule, inside the database. No external scheduler, no worker
process.

```sql
create extension if not exists pg_cron;

select cron.schedule('rollup-hourly', '*/5 * * * *', $$select jobs.run_rollups()$$);
```

Inspect:

```sql
select jobname, schedule, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 20;
```

Unschedule:

```sql
select cron.unschedule('rollup-hourly');
```

**Register jobs in a migration**, as this project does, rather than by running the command
by hand. A schedule that exists only in one database is invisible, unreviewable, and gone
the next time someone resets.

`cron.job_run_details` tells you whether the job ran. It does not tell you whether the job
did anything useful. That is why the jobs here also write their own rows to `rollup_runs`,
with row counts, duration and any error, which the ingestion health screen reads. A job
that fails silently is worse than one that does not run, because the dashboard keeps
serving stale numbers and nobody knows.

---

## 9. Storage and signed URLs

Storage is a file store with its own permission model: buckets, plus policies on
`storage.objects` that work like RLS.

```sql
insert into storage.buckets (id, name, public)
values ('exports', 'exports', false);
```

`public = false` means no anonymous reads. To hand someone a file, you generate a **signed
URL**, which is a time limited link:

```ts
const { data } = await supabase.storage
  .from('exports')
  .createSignedUrl('project-id/export-id.csv', 900) // 15 minutes
```

This project deliberately creates **no policies at all** on the exports bucket, and signs
server side in the `export-download` function. A select policy would work, and it would
also be a second, quieter path to the same files that nothing audits. Going through a
function means every download checks membership and writes an audit entry first.

A local quirk: inside the stack, functions see the API as `http://kong:8000`, so a signed
URL generated by a local function carries a hostname only Docker can resolve. In a hosted
project `SUPABASE_URL` is the public URL and this does not happen. The signature covers the
path and expiry, not the host, so the test rewrites it.

---

## 10. Regenerating TypeScript types

Supabase can generate TypeScript types from your live schema. This is the feature that
makes the whole stack pleasant.

```bash
npm run db:types
# supabase gen types typescript --local --schema public --schema api --schema jobs \
#   > apps/web/src/types/database.ts
```

Then `createClient<Database>(...)` gives you autocompletion on table names, column names
and function arguments, and a compile error when you rename a column and forget a caller.

**Run this after every migration.** The file is generated, is never hand edited, and is
excluded from ESLint and Prettier. If typechecking suddenly complains that a table does not
exist, the types are stale: regenerate before debugging anything else. That has caught me
out twice in this project alone.

---

## 11. The five mistakes people make on this stack

1. **Creating a table and forgetting row level security.** The table is immediately
   readable by anyone with the anon key. Use the checklist in
   `.claude/skills/supabase/SKILL.md`: enable RLS, write read policies, write write
   policies, add an isolation test, all in the same migration.

2. **Enabling RLS and writing no policy, then debugging the empty results.** This is the
   same mistake seen from the other side, and it wastes an afternoon because the failure
   looks like a broken query rather than a working database. Empty array plus no error
   almost always means "no policy matched".

3. **Putting the service role key in a `VITE_` variable.** It ships to every visitor and
   bypasses every policy you wrote. Grep your build output; CI here does it for you.

4. **Writing a policy with a per row subquery.** `using (exists (select 1 from org_members
where ...))` is correct and unusably slow, because it runs once per row. Wrap it in a
   `stable security definer` function, as `authz.current_user_org_ids()` does, and Postgres
   evaluates it once per statement.

5. **Editing a migration that has already been applied elsewhere.** Your database and the
   hosted one now disagree, and nothing will tell you until a deploy fails. Roll forward
   with a new migration instead. Local-only and uncommitted is the sole exception.

A sixth, specific to analytics: **trusting the client's timestamp for aggregation.** See
"Why the rollup job walks received_at" in `docs/ARCHITECTURE.md`.

---

## 12. Glossary

**anon key / publishable key** — the public API key. Safe in a browser. Grants only what
RLS allows.

**service role key / secret key** — bypasses RLS entirely. Server side only.

**RLS (row level security)** — Postgres deciding which rows a query may see, based on who
is asking.

**policy** — one rule attached to a table for one operation, written as a SQL expression.

**`security definer`** — a function that runs with its creator's privileges, bypassing RLS.
Powerful, and the reason `search_path` is pinned on every one of them here.

**`search_path`** — where Postgres looks for unqualified names. Pinned to empty in security
definer functions so a caller cannot shadow a table name and redirect the function.

**PostgREST** — the service that turns tables and functions into a REST API. `.from()` and
`.rpc()` in the client talk to this.

**GoTrue** — the auth service behind `supabase.auth.*`.

**Realtime** — websocket streaming of database changes. Respects RLS per subscriber.

**Edge Function** — a Deno TypeScript function deployed to the edge.

**pg_cron** — a Postgres extension that runs SQL on a schedule.

**migration** — a timestamped `.sql` file, applied once, in order, forward only.

**`rpc()`** — calling a Postgres function over the API, as opposed to querying a table.

**watermark** — how far a job has processed. Here, a `received_at` value, never a `ts`.

**rollup** — a pre-aggregated table. Why the dashboard is fast.

---

## Where to go next

- `docs/ARCHITECTURE.md` — how this system fits together and what was deferred.
- `docs/DATA_MODEL.md` — every table and why it exists.
- `docs/INGESTION.md` — the public API contract.
- `docs/RUNBOOK.md` — what to do when something is broken.
- `docs/DECISIONS.md` — why the stack looks like this.
