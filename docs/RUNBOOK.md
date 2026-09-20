# Runbook

Symptom, diagnosis, fix. Written for whoever is on call, including you in six months.

Before anything else, the two places to look:

```bash
npx supabase status                    # is the local stack even up
npx supabase logs --type postgres      # database
npx supabase logs --type edge-function # ingestion and exports
```

On a hosted project, the equivalents are three separate views in the Supabase dashboard:
Postgres logs, API logs, and per function logs. When ingestion misbehaves, the **function**
log is the first place to look, not the Postgres log.

---

## Charts are stale, or the health screen says rollups are behind

**Symptom.** Aggregation lag on the ingestion health screen is above 15 minutes, or numbers
stop moving while the live feed keeps scrolling.

**Diagnose.** The lag figure is `now() - rollup_state.watermark`. Start with the run log:

```sql
select job_name, status, error, rows_read, duration_ms, started_at
from rollup_runs
where project_id = '<project-id>'
order by started_at desc
limit 20;
```

Three shapes, three different problems:

- **Rows say `failed`.** The `error` column has the message. Fix that, then see "force a
  catch up" below.
- **No rows at all recently.** The cron job is not running. Check it is registered:
  ```sql
  select jobname, schedule, active from cron.job;
  select * from cron.job_run_details order by start_time desc limit 10;
  ```
  If `rollup-hourly` is missing, the migration that registers it has not been applied to
  this database. Apply migrations.
- **Rows say `ok` but `duration_ms` is climbing toward 300000.** The job is taking longer
  than its five minute interval and will eventually overlap itself. Check `rows_read`: a
  large backfill or a seed run will cause one slow pass and then settle. If it does not
  settle, the deferred section of `docs/ARCHITECTURE.md` covers the structural fixes.

**Force a catch up.**

```sql
select jobs.run_rollups();
```

Safe to run at any time. Full recompute of touched buckets is idempotent.

**If the watermark is wrong** rather than the job being broken, recompute a range
explicitly. This ignores watermarks entirely:

```bash
node scripts/backfill-rollups.ts --project <id> --from 2026-08-01 --to 2026-09-01
```

---

## Numbers are wrong rather than late

**Symptom.** A customer reconciles against their own database and the totals disagree.

**Diagnose.** First establish whether the rollups disagree with the raw events, or the raw
events disagree with the customer.

```sql
select
  (select count(*) from events_raw where project_id = '<id>') as raw,
  (select sum(event_count) from rollup_events_hourly where project_id = '<id>') as rolled;
```

These must be equal. If they are not, the rollup is wrong and a backfill will fix it. If
they _are_ equal, we are faithfully reporting what we received, and the question moves to
ingestion: check the health screen for rejections, and check whether raw events have been
pruned past `retention_days` for the period they are asking about.

**Timezone disagreements** are the other common cause and are not a bug. Days are cut in
`projects.timezone`. A customer comparing against UTC totals will see a consistent shift.
The active timezone is displayed next to every date range for this reason.

**After fixing an aggregation bug**, the scheduled job will not repair history on its own:
it only recomputes buckets that newly arrived events touched, and old buckets have none.
Backfill the affected range explicitly.

---

## Ingestion is returning errors

**Symptom.** Customers report 4xx or 5xx from the ingest endpoint, or the health screen
shows a spike in rejections.

**Diagnose by status code.**

- **401 for everything.** The key is unknown or revoked. Both return the same response on
  purpose. Confirm the key still exists:
  ```sql
  select id, name, key_prefix, revoked_at from api_keys where key_prefix = left('<key>', 12);
  ```
- **403 `origin_not_allowed`.** The site is sending from a domain not in
  `projects.allowed_origins`. Add it in project settings.
- **403 `secret_key_from_browser`.** An `sk_live_` key is in client side code. This is a
  leaked credential, not a configuration mistake. Treat it as "a key leaked" below.
- **429.** The key is over 100 events/second sustained or 500 burst. Confirm:
  ```sql
  select api_key_id, tokens, window_start from rate_limit_buckets where api_key_id = '<id>';
  ```
  A batching change on the customer's side is usually the right fix. Raising the limit is a
  code change in `supabase/functions/ingest/index.ts`.
- **500.** Ours. The function log has the real message; the customer gets a stable code and
  nothing about our internals. Nothing was recorded, so their retry is safe.

**Rejections rather than errors.** Rejected events return `202` with a per-index reason.
Group them:

```sql
select reason, count(*), max(received_at)
from events_rejected
where project_id = '<id>' and received_at > now() - interval '24 hours'
group by 1 order by 2 desc;
```

The health screen shows this with a sample payload, which is usually enough to tell the
customer exactly which field is wrong.

---

## A key leaked

**Symptom.** A key appears in a public repository, a bundle, a screenshot, or a support
ticket.

**Fix, in order.**

1. **Revoke it.** Settings, API keys, Revoke. Or:

   ```sql
   select api.revoke_api_key('<key-id>');
   ```

   Revocation takes effect on the next request. It is a timestamp, not a delete, so the
   audit trail and the key's history survive.

2. **Issue a replacement first if something is live.** Revoking stops ingestion
   immediately; a production site with no working key silently stops sending events.

3. **Assess the damage honestly.** A `pk_live_` key can only write events, only from
   allowed origins. Someone could send junk events, which is annoying and correctable, and
   could not read anything. An `sk_live_` key can write from anywhere. Neither can read
   customer data: the ingestion endpoint has no code path that returns an event.

4. **Check what it did.**

   ```sql
   select date_trunc('hour', received_at) as hour, count(*)
   from events_raw
   where project_id = '<id>' and received_at > '<leak time>'
   group by 1 order by 1;
   ```

   Junk events can be deleted by `ingest_id` prefix or time range, then the affected range
   backfilled.

5. **Record it.** Key creation and revocation are already in `audit_log`. Add the context
   wherever incidents are tracked.

---

## Rotating the IP hash salt

**When.** On a schedule, or if the salt is exposed.

The salt is an Edge Function secret, and the hash also includes the current date, so hashes
already rotate daily. Rotating the salt breaks the link between historic hashes and any new
ones, which is the point.

```bash
npx supabase secrets set INGEST_IP_HASH_SALT="$(openssl rand -hex 32)"
npx supabase functions deploy ingest
```

**Consequence.** Existing `ip_hash` values become uncorrelatable with new ones. Nothing
in the product joins on `ip_hash` across days, so nothing breaks. Do not try to
re-hash historic rows: the raw addresses were never stored, which is the design.

---

## Retention pruning removed too much

**Symptom.** Raw events are missing for a period a customer expected to have.

**Diagnose.** Pruning is nightly and writes to the audit log:

```sql
select created_at, metadata from audit_log
where action = 'retention.pruned' order by created_at desc limit 10;
```

**Reality.** Raw events past `retention_days` are gone and cannot be recovered. Rollups
are never pruned, so charts, funnels over aggregate data and totals all still work. What is
lost is the live feed, exports, and per-user funnel and retention over that period.

**Prevent.** The settings screen warns before a retention decrease takes effect, and the
change is audited. If someone lowered it by accident, raise it back immediately: the
nightly job only deletes what is currently past the window, so anything not yet pruned is
saved.

---

## An export is stuck

**Symptom.** An export sits at `queued` or `running`.

**Diagnose.**

```sql
select id, kind, status, row_count, error, created_at, finished_at
from exports where project_id = '<id>' order by created_at desc limit 10;
```

- **`queued` and not moving.** The worker was never invoked, or the invocation failed
  before claiming. Re-invoke:
  ```bash
  curl -X POST "$FUNCTIONS_URL/export-run" -H "Authorization: Bearer $USER_JWT" \
    -H 'Content-Type: application/json' -d '{"export_id":"<id>"}'
  ```
- **`running` and not moving.** The function died mid-run. Claiming is a single statement
  that flips `queued` to `running`, so a stuck row will not be picked up again. Reset it:
  ```sql
  update exports set status = 'queued' where id = '<id>';
  ```
- **`failed`.** The `error` column has the reason. Row caps and ranges are the usual cause.

**Downloads 403.** Signed URLs last 15 minutes. Ask for a new one; the screen does this on
every click.

---

## Everything is slow

**Diagnose in this order.**

1. **Is it one query or all of them?** The ingestion health screen loads from different
   tables than the overview. If only one screen is slow, it is that query.
2. **Check the plan**, and compare to the recorded ones in `docs/measurements/`.
   ```sql
   explain (analyze, buffers) select * from api.summary('<id>', now() - interval '30 days', now());
   ```
3. **Check statistics are current.** A large seed or backfill without a subsequent
   `analyze` will produce bad plans.
   ```sql
   analyze public.events_raw;
   ```
4. **Check the rollups are actually being used.** If a query is reading `events_raw` when
   it should be reading a rollup table, the plan will say so immediately. Only
   `api.live_events`, `api.funnel` and `api.retention` should ever touch `events_raw`.

The fix for a slow dashboard query is an index or a rollup, not a longer cache TTL. A
longer TTL hides the problem from you and keeps it for the user whose request misses.
