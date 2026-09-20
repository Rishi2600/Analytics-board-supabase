# Data model

Every table, what it is for, and why it looks the way it does. Column types are in the
migrations; this explains the decisions the types cannot.

## Schemas

| Schema   | Contents                                    | Who can reach it                        |
| -------- | ------------------------------------------- | --------------------------------------- |
| `public` | application tables                          | the dashboard, under row level security |
| `api`    | read facing functions called with `rpc()`   | signed in users                         |
| `jobs`   | rollups, pruning, ingest helpers            | the service role only                   |
| `authz`  | security definer helpers that policies call | nobody directly                         |

`jobs` appears in the PostgREST exposed schema list because schema exposure is global
rather than per role, and the Edge Functions reach it as the service role. What keeps
clients out is the absence of `USAGE` on the schema. There is a test that asserts it.

## The shape, in one picture

```
organizations ──┬── org_members ── auth.users
                ├── org_invites
                ├── audit_log
                └── projects ──┬── api_keys ── api_key_secrets
                               ├── events_raw
                               ├── events_rejected
                               ├── indexed_properties
                               ├── rate_limit_buckets
                               ├── rollup_events_hourly
                               ├── rollup_events_daily
                               ├── user_activity_daily
                               ├── session_activity_daily
                               ├── rollup_property_daily
                               ├── rollup_state
                               ├── rollup_runs
                               ├── query_cache
                               ├── saved_views
                               └── exports
```

Everything hangs off `projects`, and `projects` hangs off `organizations`. That single
chain is what every row level security policy walks.

## Tenancy

### `organizations`

The billing and membership boundary. `slug` is globally unique and appears in URLs.

There is **no insert policy**. Organizations are created only through
`api.create_organization()`. A direct insert cannot work: PostgREST asks for the new row
back, and the row level security check on that `RETURNING` clause runs before any
after-insert trigger could have written the membership row, so the creator would be unable
to see what they just created. One function is also a single audited path that cannot
produce an organization with nobody in it.

### `org_members`

Composite primary key on `(org_id, user_id)`. Four roles:

| Role     | Can                                             |
| -------- | ----------------------------------------------- |
| `owner`  | everything, including deleting the organization |
| `admin`  | projects, keys, members, settings               |
| `member` | read, create saved views, request exports       |
| `viewer` | read only                                       |

A trigger refuses to remove or demote the last owner. An organization with no owner cannot
be administered by anybody and the only route back is a support ticket.

### `org_invites`

Stores only `sha256(token)`. The token is shown once. Invites cannot grant ownership;
that is transferred explicitly by an existing owner. Accepting goes through
`api.accept_invite()`, because the person accepting is by definition not a member yet and
no policy could let them in.

### `projects`

One app or site. Carries the settings that change how ingestion and reporting behave:

| Column            | Why it exists                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `timezone`        | days and weeks are cut in this zone at query time. Validated against `pg_timezone_names` by a trigger, because an unknown zone would silently shift every chart by hours |
| `retention_days`  | how long raw events live. Rollups are never pruned                                                                                                                       |
| `allowed_origins` | CORS allowlist for browser keys. Empty means no browser origin is allowed                                                                                                |
| `filter_bots`     | whether known crawlers are dropped. A documentation site may genuinely want them                                                                                         |
| `cache_epoch`     | incremented by every rollup run, which invalidates every cached query for this project in one integer write                                                              |

### `audit_log`

Append only from the client's point of view: there is a read policy and deliberately **no
insert, update or delete policy**. The only way a row is written is through a security
definer function or the service role. A client that can forge or erase its own audit trail
does not have one.

## API keys

### `api_keys`

The visible half. Holds no secret material: a name, the first 12 characters of the key in
plaintext, the type, and timestamps. Safe for any project member to read, which is why the
health screen can show which key last sent an event.

`revoked_at` is a timestamp, never a delete. After an incident the question is which key
was used, not which keys still work.

### `api_key_secrets`

A salted SHA-256 hash and its salt. **Row level security enabled, zero policies, and no
grant to any client role.** Two independent locks, because this is the one table where a
mistake cannot be undone.

There is no policy that could be written here that would be correct. No dashboard user, of
any role, in any organization, has a legitimate reason to read key hashes.

## Events

### `events_raw`

A plain table with four indexes. No partitioning at this scale; the trigger that would
change that is in `docs/ARCHITECTURE.md`.

The important column pair is `ts` and `received_at`. `ts` is what the customer says
happened and is what charts bucket by. `received_at` is what we observed and is what the
rollup job walks. The reasoning is in `docs/ARCHITECTURE.md` under "Why the rollup job
walks received_at", and it is the single idea most worth understanding in this schema.

`ip_hash` is a salted hash with a daily rotating salt. The raw address is never stored.

Indexes, and the query each one serves:

| Index                                                 | Serves                                       |
| ----------------------------------------------------- | -------------------------------------------- |
| `(project_id, ingest_id) where ingest_id is not null` | idempotency on insert                        |
| `(project_id, ts desc)`                               | live feed, exports                           |
| `(project_id, event_name, ts desc)`                   | event filtered reads                         |
| `(project_id, received_at)`                           | the rollup job finding its work              |
| `(project_id, distinct_id, event_name, ts)`           | funnels and retention, per user step lookups |

### `events_rejected`

What we refused, and why, with a truncated copy of the payload. Pruned after 14 days.
Exists so a customer sees a malformed integration the same day rather than noticing a gap
in a chart weeks later.

## Rollups

### `rollup_events_hourly` and `rollup_events_daily`

Event and session counts per UTC bucket, keyed `(project_id, bucket, event_name)`. Stored
in UTC and converted to the project timezone at query time. Storing per-timezone rollups
would multiply the work and still be wrong the moment a project changed its timezone.

At a million events, the hourly table holds 12,698 rows. That ratio is why this system does
not need a cache.

### `user_activity_daily` and `session_activity_daily`

One row per user, or session, per day they were active. Membership rather than counts,
because unique counts are not additive: if 100 people are active in hour one and 100 in
hour two, the day's unique count is somewhere between 100 and 200 and the hourly rows
cannot tell you which.

### `rollup_property_daily`

Breakdowns, keyed `(project_id, day, event_name, prop_key, prop_value)`. Two caps, both
load bearing:

- only keys listed in `indexed_properties` are rolled up, capped at **50 per project**
- only the top **200 values per key per day**, with everything else folded into `__other__`

`__other__` is shown in the interface rather than hidden. A breakdown whose percentages
quietly fail to add up teaches people to distrust every number on the screen.

Unbounded property cardinality is the most reliable way to kill an analytics database. One
customer sending a request id as a property, without these caps, adds a row per event
forever.

### `indexed_properties`

Which property keys get rolled up. Auto-discovered during the rollup job rather than at
ingest time, because the ingestion path must not do anything that can block.

## Operations

| Table                | Purpose                                 | Policies                                                              |
| -------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| `rollup_state`       | the job's watermark per project         | none: a client that could move a watermark could make us skip windows |
| `rollup_runs`        | one row per job run, success or failure | read only, so the health screen can show a stalled job                |
| `rate_limit_buckets` | token bucket per key, unlogged          | none: service role only                                               |
| `query_cache`        | unlogged, TTL plus epoch                | none: server side only                                                |
| `exports`            | one row per export request              | read and insert; status transitions belong to the worker              |
| `saved_views`        | explorer state as jsonb                 | author writes, project reads if shared                                |

`saved_views.query` is `jsonb` rather than normalised columns because the explorer will
grow options and a migration per option is not a good trade.

Only the **author** can edit or delete a saved view, whatever their role. An admin who
could silently rewrite someone else's saved view would make saved views untrustworthy.

## Row level security, summarised

Every table in `public` has it enabled. Policies call `authz.current_user_org_ids()`, a
`stable security definer` function with `search_path` pinned to empty, so it is evaluated
once per statement rather than once per row. Project scoped tables go through
`authz.can_read_project()` and `authz.can_write_project()`, so the tenancy rule is written
once instead of copy pasted across thirty policies.

Two tables have RLS enabled and no policies, both by design and both with a SQL comment
saying so: `api_key_secrets` and `rate_limit_buckets`. `rollup_state` and `query_cache`
join them, plus a `revoke` for good measure.

Proven by `tests/rls-tenancy.test.ts`, which creates two real users in two real
organizations and asserts that neither can read, write, or even detect the other's data.
