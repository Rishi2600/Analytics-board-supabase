# Measurements

`explain (analyze, buffers)` output for the queries that cost the most, captured against
1,000,109 seeded events across 90 days: 12,560 hourly rollup rows, 195,533 user-day rows
and 299,616 session-day rows.

These are committed so a future change can be compared against a known baseline rather than
against a memory of how fast things used to feel.

They were captured in psql as `postgres`, which skips row level security, so they understate
what a signed-in user sees. `docs/ARCHITECTURE.md` has the current numbers, measured as the
`authenticated` role after ADR-0013.

| File               | Query                                                            |
| ------------------ | ---------------------------------------------------------------- |
| `summary.txt`      | `api.summary` over 30 days, the overview page's headline numbers |
| `retention.txt`    | `api.retention`, 8 weekly cohorts over 90 days                   |
| `timeseries.txt`   | `api.timeseries` over 30 days                                    |
| `funnel-step.txt`  | one funnel step's per-user join against `events_raw`             |
| `unique-users.txt` | the distinct-subquery pattern that replaced `count(distinct)`    |

## Reproducing

```bash
npx supabase start
node scripts/bootstrap-demo.ts                       # prints a project id
node scripts/seed-events.ts --project <id> --events 1000000
psql "$(npx supabase status -o env | grep DB_URL | cut -d'"' -f2)" \
  -c "select jobs.run_rollups()" -c "analyze"
```

Then run any of the queries with `explain (analyze, buffers)`. Row counts will differ
slightly, because the seed is random; the shape of the plan should not.

Take timings from a **warm** run. The first execution after `analyze` reads cold pages and
will look roughly 20% slower than steady state, and a table that has not been populated yet
will look instant for the wrong reason.
