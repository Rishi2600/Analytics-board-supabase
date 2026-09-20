-- Migration 003 - raw events, rejections, and rate limiting.
--
-- events_raw is a plain table with indexes. No partitioning: at the volume this project
-- targets, partitioning adds operational surface (partition creation, a maintenance job,
-- a whole class of "which partition" bugs) and buys nothing. The trigger that would change
-- that is recorded in the deferred section of docs/ARCHITECTURE.md.

-- ===========================================================================
-- 1. Tables
-- ===========================================================================

create table if not exists public.events_raw (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  event_name text not null check (length(event_name) between 1 and 64),
  distinct_id text not null check (length(distinct_id) between 1 and 200),
  session_id text check (length(session_id) <= 200),
  ts timestamptz not null,
  received_at timestamptz not null default now(),
  properties jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  ip_hash bytea,
  ingest_id text check (length(ingest_id) <= 128)
);

comment on table public.events_raw is
  'Every accepted event. Pruned on the project retention schedule; the rollups built from it are not, so history outlives the raw rows.';

comment on column public.events_raw.ts is
  'When the customer says it happened. This is what charts bucket by.';

comment on column public.events_raw.received_at is
  'When we observed it. This is what the rollup job walks. The two are separate because a mobile client that was offline for three days sends events with an old ts today, and a job that walked ts would skip them entirely: its watermark has already moved past that point in time. Walking received_at means late data is always picked up, and because the job fully recomputes each touched bucket, it lands in the correct historical bucket. See docs/INGESTION.md.';

comment on column public.events_raw.ip_hash is
  'Salted hash with a daily rotating salt. The raw IP is never stored. Rotating the salt breaks the link between yesterday and today on purpose.';

comment on column public.events_raw.ingest_id is
  'Client supplied idempotency key. A retried batch carries the same ids, so the unique index turns a duplicate delivery into a no-op rather than double counted revenue.';

-- Idempotency. Partial, because ingest_id is optional and many nulls are not duplicates.
create unique index if not exists events_raw_ingest_id_key
  on public.events_raw (project_id, ingest_id)
  where ingest_id is not null;

-- The two access patterns the dashboard actually has.
create index if not exists events_raw_project_ts_idx
  on public.events_raw (project_id, ts desc);
create index if not exists events_raw_project_event_ts_idx
  on public.events_raw (project_id, event_name, ts desc);

-- How the rollup job finds work.
create index if not exists events_raw_project_received_idx
  on public.events_raw (project_id, received_at);

create table if not exists public.events_rejected (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  api_key_id uuid references public.api_keys (id) on delete set null,
  received_at timestamptz not null default now(),
  reason text not null,
  detail text,
  raw_payload jsonb
);

comment on table public.events_rejected is
  'Events we refused, kept so the customer can see them in the dashboard. A bad batch that fails silently gets discovered weeks later when someone asks why a number is low; a bad batch that shows up on the ingestion health screen gets fixed the same day.';

create index if not exists events_rejected_project_idx
  on public.events_rejected (project_id, received_at desc);
create index if not exists events_rejected_reason_idx
  on public.events_rejected (project_id, reason, received_at desc);

-- Unlogged: this is a rate limiter, not a ledger. Losing it on an unclean restart means
-- everyone gets a full bucket once, which is a better trade than paying WAL for every
-- request.
create unlogged table if not exists public.rate_limit_buckets (
  api_key_id uuid primary key references public.api_keys (id) on delete cascade,
  window_start timestamptz not null default now(),
  tokens numeric not null default 0
);

comment on table public.rate_limit_buckets is
  'Token bucket per API key. Row level security is enabled with no policies: only the ingest function, under the service role, ever touches this.';

create table if not exists public.indexed_properties (
  project_id uuid not null references public.projects (id) on delete cascade,
  prop_key text not null check (length(prop_key) between 1 and 64),
  enabled boolean not null default true,
  first_seen_at timestamptz not null default now(),
  primary key (project_id, prop_key)
);

comment on table public.indexed_properties is
  'Which property keys get rolled up for breakdowns. Capped at 50 per project. Unbounded property cardinality is the single most reliable way to kill an analytics database, so this is a ceiling rather than a preference.';

alter table public.events_raw enable row level security;
alter table public.events_rejected enable row level security;
alter table public.rate_limit_buckets enable row level security;
alter table public.indexed_properties enable row level security;

-- ===========================================================================
-- 2. Policies
-- ===========================================================================

-- Read only, scoped to the project. The Live screen needs this: Supabase Realtime
-- evaluates row level security per subscriber, so a stream with no select policy delivers
-- nothing. Dashboard aggregates never read this table directly; they read rollups.
drop policy if exists events_raw_select on public.events_raw;
create policy events_raw_select on public.events_raw
  for select to authenticated
  using (authz.can_read_project(project_id));

-- No insert, update or delete policy. Events arrive through the ingest function under the
-- service role, and nothing in the dashboard may fabricate or edit an event. An analytics
-- product whose customers can rewrite their own event history is not measuring anything.

drop policy if exists events_rejected_select on public.events_rejected;
create policy events_rejected_select on public.events_rejected
  for select to authenticated
  using (authz.can_read_project(project_id));

drop policy if exists indexed_properties_select on public.indexed_properties;
create policy indexed_properties_select on public.indexed_properties
  for select to authenticated
  using (authz.can_read_project(project_id));

drop policy if exists indexed_properties_update on public.indexed_properties;
create policy indexed_properties_update on public.indexed_properties
  for update to authenticated
  using (authz.can_write_project(project_id, array['owner', 'admin']))
  with check (authz.can_write_project(project_id, array['owner', 'admin']));

-- rate_limit_buckets gets no policy at all. See the table comment.

-- ===========================================================================
-- 3. Rate limiting
-- ===========================================================================

-- Token bucket, consumed atomically.
--
-- The refill is computed from elapsed time rather than by a background job, so there is no
-- scheduler to keep alive and a key that goes quiet for an hour comes back with a full
-- bucket. The row lock is what makes two concurrent requests for the same key serialise;
-- at one row per key that contention is exactly where it should be.
create or replace function jobs.consume_rate_limit(
  p_api_key_id uuid,
  p_capacity numeric,
  p_refill_per_second numeric,
  p_cost numeric
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tokens numeric;
  v_last timestamptz;
begin
  insert into public.rate_limit_buckets (api_key_id, window_start, tokens)
  values (p_api_key_id, now(), p_capacity)
  on conflict (api_key_id) do nothing;

  select b.tokens, b.window_start
    into v_tokens, v_last
  from public.rate_limit_buckets b
  where b.api_key_id = p_api_key_id
  for update;

  v_tokens := least(
    p_capacity,
    v_tokens + extract(epoch from (now() - v_last)) * p_refill_per_second
  );

  if v_tokens >= p_cost then
    v_tokens := v_tokens - p_cost;
    update public.rate_limit_buckets
      set tokens = v_tokens, window_start = now()
      where api_key_id = p_api_key_id;
    return query select true, floor(v_tokens)::integer, 0;
  end if;

  update public.rate_limit_buckets
    set tokens = v_tokens, window_start = now()
    where api_key_id = p_api_key_id;

  return query select
    false,
    floor(v_tokens)::integer,
    ceil((p_cost - v_tokens) / greatest(p_refill_per_second, 0.001))::integer;
end;
$$;

-- ===========================================================================
-- 4. Batch insert
-- ===========================================================================

-- One statement for the accepted events, one for the rejected ones.
--
-- ON CONFLICT DO NOTHING is what makes a replayed batch a no-op. It names the partial
-- index predicate because the index is partial, and Postgres will not infer it otherwise.
create or replace function jobs.ingest_batch(
  p_project_id uuid,
  p_api_key_id uuid,
  p_events jsonb,
  p_rejected jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_accepted integer := 0;
begin
  if jsonb_array_length(coalesce(p_events, '[]'::jsonb)) > 0 then
    insert into public.events_raw (
      project_id, event_name, distinct_id, session_id, ts, received_at,
      properties, context, ip_hash, ingest_id
    )
    select
      p_project_id,
      e ->> 'event_name',
      e ->> 'distinct_id',
      nullif(e ->> 'session_id', ''),
      (e ->> 'ts')::timestamptz,
      (e ->> 'received_at')::timestamptz,
      coalesce(e -> 'properties', '{}'::jsonb),
      coalesce(e -> 'context', '{}'::jsonb),
      case when e ->> 'ip_hash' is null then null else decode(e ->> 'ip_hash', 'hex') end,
      nullif(e ->> 'ingest_id', '')
    from jsonb_array_elements(p_events) as e
    on conflict (project_id, ingest_id) where ingest_id is not null do nothing;

    get diagnostics v_accepted = row_count;
  end if;

  if jsonb_array_length(coalesce(p_rejected, '[]'::jsonb)) > 0 then
    insert into public.events_rejected (project_id, api_key_id, reason, detail, raw_payload)
    select
      p_project_id,
      p_api_key_id,
      r ->> 'reason',
      r ->> 'detail',
      r -> 'raw_payload'
    from jsonb_array_elements(p_rejected) as r;
  end if;

  return v_accepted;
end;
$$;

-- ===========================================================================
-- 5. Grants
-- ===========================================================================

grant select on public.events_raw to authenticated;
grant select on public.events_rejected to authenticated;
grant select, update on public.indexed_properties to authenticated;
revoke all on public.rate_limit_buckets from anon, authenticated;

-- The jobs schema is reachable only by the service role, which is what the ingest and
-- export Edge Functions run as.
--
-- Two things enforce that, and the second is the one that matters. EXECUTE is revoked from
-- the client roles, and USAGE on the schema itself is never granted to them: without
-- schema usage a client cannot call a function in it even if someone later grants EXECUTE
-- by mistake. The default privileges line closes the remaining gap, because Postgres
-- grants EXECUTE to PUBLIC on every newly created function unless told otherwise.
revoke all on all functions in schema jobs from public, anon, authenticated;
revoke usage on schema jobs from anon, authenticated;
alter default privileges in schema jobs revoke execute on functions from public;

grant usage on schema jobs to service_role;
grant execute on all functions in schema jobs to service_role;
