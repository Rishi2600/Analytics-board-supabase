-- Migration 007 - exact session counts, and the query cache.
--
-- Two additions.
--
-- 1. session_activity_daily.
--
-- rollup_events_hourly carries a session_count per hour, and summing it across hours
-- overcounts: a session that runs from 10:55 to 11:05 is counted in both hours. This is
-- the same non-additivity problem that user_activity_daily exists to solve for unique
-- users, and it gets the same solution. Sessions are a headline number on the overview
-- screen, and a headline number that is quietly 15% too high is worse than no number.
--
-- 2. query_cache.
--
-- The third of the three layers that replaced Redis (ADR-0002), for expensive ad hoc
-- breakdowns that cannot be pre-aggregated. Unlogged, because a cache that survives an
-- unclean restart is not worth paying write-ahead logging for on every entry.

create table if not exists public.session_activity_daily (
  project_id uuid not null references public.projects (id) on delete cascade,
  day date not null,
  session_id text not null,
  primary key (project_id, day, session_id)
);

comment on table public.session_activity_daily is
  'One row per session per day it was active. Exists because session counts, like unique user counts, are not additive across time buckets.';

create unlogged table if not exists public.query_cache (
  cache_key text primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  epoch bigint not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.query_cache is
  'Row level security is enabled with no policies: only server side code reaches this. The cache key includes the project id and the project cache epoch, so a rollup run invalidates every entry for a project by incrementing one integer rather than by deleting rows.';

create index if not exists query_cache_expiry_idx on public.query_cache (expires_at);

alter table public.session_activity_daily enable row level security;
alter table public.query_cache enable row level security;

drop policy if exists session_activity_daily_select on public.session_activity_daily;
create policy session_activity_daily_select on public.session_activity_daily
  for select to authenticated using (authz.can_read_project(project_id));

-- query_cache gets no policy. See the table comment.

grant select on public.session_activity_daily to authenticated;
revoke all on public.query_cache from anon, authenticated;

-- ===========================================================================
-- Rollup job, updated to populate session activity
-- ===========================================================================

create or replace function jobs.run_project_rollup(
  p_project_id uuid,
  p_lag interval default interval '10 seconds'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_run_id uuid;
  v_watermark timestamptz;
  v_upper timestamptz;
  v_new_watermark timestamptz;
  v_buckets timestamptz[];
  v_days date[];
  v_rows_read bigint := 0;
  v_rows_written bigint := 0;
begin
  v_upper := now() - p_lag;

  select coalesce(rs.watermark, '-infinity')
    into v_watermark
  from public.rollup_state rs
  where rs.project_id = p_project_id and rs.job_name = 'hourly';

  v_watermark := coalesce(v_watermark, '-infinity');

  insert into public.rollup_runs (job_name, project_id, window_start, window_end, status)
  values ('hourly', p_project_id, v_watermark, v_upper, 'running')
  returning id into v_run_id;

  -- Filter on received_at, group by ts. That asymmetry is the whole design.
  select array_agg(distinct date_trunc('hour', e.ts)),
         array_agg(distinct (date_trunc('day', e.ts))::date),
         count(*),
         max(e.received_at)
    into v_buckets, v_days, v_rows_read, v_new_watermark
  from public.events_raw e
  where e.project_id = p_project_id
    and e.received_at > v_watermark
    and e.received_at <= v_upper;

  if v_buckets is null or array_length(v_buckets, 1) is null then
    insert into public.rollup_state (project_id, job_name, watermark, updated_at)
    values (p_project_id, 'hourly', v_upper, now())
    on conflict (project_id, job_name) do update
      set watermark = excluded.watermark, updated_at = now();

    update public.rollup_runs
      set status = 'ok', finished_at = now(),
          duration_ms = (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer
      where id = v_run_id;
    return;
  end if;

  delete from public.rollup_events_hourly r
  where r.project_id = p_project_id and r.bucket = any (v_buckets);

  insert into public.rollup_events_hourly (project_id, bucket, event_name, event_count, session_count)
  select p_project_id, date_trunc('hour', e.ts), e.event_name, count(*), count(distinct e.session_id)
  from public.events_raw e
  where e.project_id = p_project_id and date_trunc('hour', e.ts) = any (v_buckets)
  group by 2, 3;

  get diagnostics v_rows_written = row_count;

  delete from public.user_activity_daily u
  where u.project_id = p_project_id and u.day = any (v_days);

  insert into public.user_activity_daily (project_id, day, distinct_id)
  select distinct p_project_id, (date_trunc('day', e.ts))::date, e.distinct_id
  from public.events_raw e
  where e.project_id = p_project_id and (date_trunc('day', e.ts))::date = any (v_days);

  delete from public.session_activity_daily s
  where s.project_id = p_project_id and s.day = any (v_days);

  insert into public.session_activity_daily (project_id, day, session_id)
  select distinct p_project_id, (date_trunc('day', e.ts))::date, e.session_id
  from public.events_raw e
  where e.project_id = p_project_id
    and (date_trunc('day', e.ts))::date = any (v_days)
    and e.session_id is not null;

  perform jobs.discover_properties(p_project_id, v_watermark);

  delete from public.rollup_property_daily p
  where p.project_id = p_project_id and p.day = any (v_days);

  insert into public.rollup_property_daily (project_id, day, event_name, prop_key, prop_value, event_count)
  with expanded as (
    select (date_trunc('day', e.ts))::date as day,
           e.event_name,
           kv.key as prop_key,
           left(coalesce(kv.value #>> '{}', 'null'), 200) as prop_value,
           count(*) as event_count
    from public.events_raw e
    cross join lateral jsonb_each(e.properties) kv
    join public.indexed_properties ip
      on ip.project_id = e.project_id and ip.prop_key = kv.key and ip.enabled
    where e.project_id = p_project_id and (date_trunc('day', e.ts))::date = any (v_days)
    group by 1, 2, 3, 4
  ),
  ranked as (
    select e.*,
           row_number() over (
             partition by e.day, e.event_name, e.prop_key order by e.event_count desc
           ) as rank
    from expanded e
  )
  select p_project_id, r.day, r.event_name, r.prop_key,
         case when r.rank <= 200 then r.prop_value else '__other__' end,
         sum(r.event_count)
  from ranked r
  group by 2, 3, 4, 5;

  insert into public.rollup_state (project_id, job_name, watermark, updated_at)
  values (p_project_id, 'hourly', coalesce(v_new_watermark, v_upper), now())
  on conflict (project_id, job_name) do update
    set watermark = excluded.watermark, updated_at = now();

  update public.projects set cache_epoch = cache_epoch + 1 where id = p_project_id;

  update public.rollup_runs
    set status = 'ok', finished_at = now(), rows_read = v_rows_read, rows_written = v_rows_written,
        duration_ms = (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer
    where id = v_run_id;

exception
  when others then
    update public.rollup_runs
      set status = 'failed', finished_at = now(), error = sqlerrm,
          duration_ms = (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer
      where id = v_run_id;
    raise;
end;
$$;

-- Backfill, updated to match.
create or replace function jobs.backfill_range(
  p_project_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_run_id uuid;
  v_rows_written integer := 0;
  v_days date[];
begin
  insert into public.rollup_runs (job_name, project_id, window_start, window_end, status)
  values ('backfill', p_project_id, p_from, p_to, 'running')
  returning id into v_run_id;

  select array_agg(distinct d::date) into v_days
  from generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day') d;

  delete from public.rollup_events_hourly r
  where r.project_id = p_project_id and r.bucket >= date_trunc('hour', p_from) and r.bucket < p_to;

  insert into public.rollup_events_hourly (project_id, bucket, event_name, event_count, session_count)
  select p_project_id, date_trunc('hour', e.ts), e.event_name, count(*), count(distinct e.session_id)
  from public.events_raw e
  where e.project_id = p_project_id and e.ts >= p_from and e.ts < p_to
  group by 2, 3;

  get diagnostics v_rows_written = row_count;

  delete from public.user_activity_daily u
  where u.project_id = p_project_id and u.day = any (v_days);

  insert into public.user_activity_daily (project_id, day, distinct_id)
  select distinct p_project_id, (date_trunc('day', e.ts))::date, e.distinct_id
  from public.events_raw e
  where e.project_id = p_project_id and e.ts >= p_from and e.ts < p_to;

  delete from public.session_activity_daily s
  where s.project_id = p_project_id and s.day = any (v_days);

  insert into public.session_activity_daily (project_id, day, session_id)
  select distinct p_project_id, (date_trunc('day', e.ts))::date, e.session_id
  from public.events_raw e
  where e.project_id = p_project_id and e.ts >= p_from and e.ts < p_to and e.session_id is not null;

  delete from public.rollup_property_daily p
  where p.project_id = p_project_id and p.day = any (v_days);

  insert into public.rollup_property_daily (project_id, day, event_name, prop_key, prop_value, event_count)
  with expanded as (
    select (date_trunc('day', e.ts))::date as day, e.event_name, kv.key as prop_key,
           left(coalesce(kv.value #>> '{}', 'null'), 200) as prop_value, count(*) as event_count
    from public.events_raw e
    cross join lateral jsonb_each(e.properties) kv
    join public.indexed_properties ip
      on ip.project_id = e.project_id and ip.prop_key = kv.key and ip.enabled
    where e.project_id = p_project_id and e.ts >= p_from and e.ts < p_to
    group by 1, 2, 3, 4
  ),
  ranked as (
    select e.*,
           row_number() over (
             partition by e.day, e.event_name, e.prop_key order by e.event_count desc
           ) as rank
    from expanded e
  )
  select p_project_id, r.day, r.event_name, r.prop_key,
         case when r.rank <= 200 then r.prop_value else '__other__' end, sum(r.event_count)
  from ranked r
  group by 2, 3, 4, 5;

  update public.projects set cache_epoch = cache_epoch + 1 where id = p_project_id;

  update public.rollup_runs
    set status = 'ok', finished_at = now(), rows_written = v_rows_written,
        duration_ms = (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer
    where id = v_run_id;

  return v_rows_written;

exception
  when others then
    update public.rollup_runs
      set status = 'failed', finished_at = now(), error = sqlerrm,
          duration_ms = (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer
      where id = v_run_id;
    raise;
end;
$$;

-- Expired entries are swept hourly. The epoch in the key already makes stale entries
-- unreachable, so this is only reclaiming space rather than protecting correctness.
create or replace function jobs.sweep_query_cache()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.query_cache where expires_at < now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

do $$ begin perform cron.unschedule('query-cache-sweep'); exception when others then null; end $$;
select cron.schedule('query-cache-sweep', '13 * * * *', $$select jobs.sweep_query_cache()$$);

revoke all on all functions in schema jobs from public, anon, authenticated;
grant execute on all functions in schema jobs to service_role;
