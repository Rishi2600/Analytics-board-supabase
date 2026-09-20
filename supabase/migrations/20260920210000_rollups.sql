-- Migration 005 - aggregation.
--
-- Dashboard queries never touch events_raw. They read these tables, which is the whole
-- reason this project does not need a cache in front of Postgres (ADR-0002): a query that
-- reads 900 daily rows instead of two million event rows is already fast.
--
-- The algorithm, and the one idea worth understanding here:
--
--   The job walks received_at, and recomputes by ts.
--
-- A naive job walks ts: "aggregate everything newer than the last thing I aggregated".
-- That silently loses data. A phone that was offline for three days sends its events
-- today with a ts from three days ago, which is already behind the watermark, so the job
-- never sees them and the numbers for that day are quietly wrong forever.
--
-- Walking received_at means we always notice late data, because received_at only ever
-- moves forward. We then take the set of ts buckets those late events belong to and
-- recompute each one from scratch. Full recompute is what makes this idempotent: running
-- the job twice, or crashing halfway and retrying, produces the same answer. Incremental
-- addition would not, and at this scale idempotency is worth far more than the saved work.

create extension if not exists pg_cron;

-- ===========================================================================
-- 1. Rollup tables
-- ===========================================================================

create table if not exists public.rollup_events_hourly (
  project_id uuid not null references public.projects (id) on delete cascade,
  bucket timestamptz not null,
  event_name text not null,
  event_count bigint not null,
  session_count bigint not null,
  primary key (project_id, bucket, event_name)
);

comment on table public.rollup_events_hourly is
  'Event and session counts per UTC hour. Stored in UTC and converted to the project timezone at query time; storing per-timezone rollups would multiply the work and still be wrong the moment a project changes its timezone.';

create table if not exists public.rollup_events_daily (
  project_id uuid not null references public.projects (id) on delete cascade,
  bucket timestamptz not null,
  event_name text not null,
  event_count bigint not null,
  session_count bigint not null,
  primary key (project_id, bucket, event_name)
);

comment on table public.rollup_events_daily is
  'The same shape at UTC day grain, used for ranges longer than 90 days so a two year chart reads 730 rows rather than 17,520.';

create table if not exists public.user_activity_daily (
  project_id uuid not null references public.projects (id) on delete cascade,
  day date not null,
  distinct_id text not null,
  primary key (project_id, day, distinct_id)
);

comment on table public.user_activity_daily is
  'One row per user per day they were active. This exists because unique counts are not additive: you cannot sum unique users across hours to get unique users for the day, because the same person appears in several hours. A count(distinct) over this narrow table is cheap and, unlike a sketch, exact.';

create table if not exists public.rollup_property_daily (
  project_id uuid not null references public.projects (id) on delete cascade,
  day date not null,
  event_name text not null,
  prop_key text not null,
  prop_value text not null,
  event_count bigint not null,
  primary key (project_id, day, event_name, prop_key, prop_value)
);

comment on table public.rollup_property_daily is
  'Pre-aggregated breakdowns. Only keys listed in indexed_properties are rolled up, and only the top 200 values per key per day, with everything else folded into __other__. Unbounded property cardinality is the single most reliable way to kill an analytics database: one customer sending a request id as a property would otherwise add a row per event forever.';

create index if not exists rollup_property_daily_lookup_idx
  on public.rollup_property_daily (project_id, event_name, prop_key, day);

-- ===========================================================================
-- 2. Job bookkeeping
-- ===========================================================================

create table if not exists public.rollup_state (
  project_id uuid not null references public.projects (id) on delete cascade,
  job_name text not null,
  watermark timestamptz not null default '-infinity',
  updated_at timestamptz not null default now(),
  primary key (project_id, job_name)
);

comment on column public.rollup_state.watermark is
  'The received_at value up to which this job has processed. Never a ts. See the header of this migration.';

create table if not exists public.rollup_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  project_id uuid references public.projects (id) on delete cascade,
  window_start timestamptz,
  window_end timestamptz,
  status text not null check (status in ('running', 'ok', 'failed')),
  rows_read bigint default 0,
  rows_written bigint default 0,
  duration_ms integer,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

comment on table public.rollup_runs is
  'One row per job run, written on success and on failure. A job that fails silently is worse than one that does not run: the dashboard keeps serving stale numbers and nobody knows. The ingestion health screen reads this.';

create index if not exists rollup_runs_recent_idx
  on public.rollup_runs (project_id, started_at desc);

alter table public.rollup_events_hourly enable row level security;
alter table public.rollup_events_daily enable row level security;
alter table public.user_activity_daily enable row level security;
alter table public.rollup_property_daily enable row level security;
alter table public.rollup_state enable row level security;
alter table public.rollup_runs enable row level security;

-- ===========================================================================
-- 3. Policies
-- ===========================================================================

-- The rollups themselves are readable by project members. Dashboard queries go through
-- api functions rather than reading these directly, but Realtime and ad-hoc debugging
-- both benefit from the policy existing and being correct.
drop policy if exists rollup_events_hourly_select on public.rollup_events_hourly;
create policy rollup_events_hourly_select on public.rollup_events_hourly
  for select to authenticated using (authz.can_read_project(project_id));

drop policy if exists rollup_events_daily_select on public.rollup_events_daily;
create policy rollup_events_daily_select on public.rollup_events_daily
  for select to authenticated using (authz.can_read_project(project_id));

drop policy if exists user_activity_daily_select on public.user_activity_daily;
create policy user_activity_daily_select on public.user_activity_daily
  for select to authenticated using (authz.can_read_project(project_id));

drop policy if exists rollup_property_daily_select on public.rollup_property_daily;
create policy rollup_property_daily_select on public.rollup_property_daily
  for select to authenticated using (authz.can_read_project(project_id));

-- Run history is operational information the customer should see on the health screen.
drop policy if exists rollup_runs_select on public.rollup_runs;
create policy rollup_runs_select on public.rollup_runs
  for select to authenticated using (authz.can_read_project(project_id));

-- rollup_state gets no policy: it is the job's own bookkeeping, and a client that could
-- move a watermark could make us skip or re-do arbitrary windows.

-- No write policies on any rollup table. These are derived data. If a client could write
-- them, the numbers would no longer be a function of the events.

-- ===========================================================================
-- 4. The rollup job
-- ===========================================================================

-- Discovers new property keys worth rolling up, capped per project.
create or replace function jobs.discover_properties(p_project_id uuid, p_since timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing integer;
begin
  select count(*) into v_existing
  from public.indexed_properties ip
  where ip.project_id = p_project_id;

  if v_existing >= 50 then
    return; -- At the cap. New keys are ignored rather than evicting an existing one.
  end if;

  insert into public.indexed_properties (project_id, prop_key)
  select p_project_id, kv.key
  from public.events_raw e
  cross join lateral jsonb_each(e.properties) kv
  where e.project_id = p_project_id
    and e.received_at > p_since
    and length(kv.key) between 1 and 64
  group by kv.key
  order by count(*) desc
  limit greatest(0, 50 - v_existing)
  on conflict (project_id, prop_key) do nothing;
end;
$$;

-- Recomputes every bucket touched by events received since the watermark, for one project.
-- p_lag is how far back from now() the window is considered closed. The default of ten
-- seconds keeps the window clear of inserts that are still in flight: an event committed a
-- moment after we read max(received_at) would otherwise fall into a window we have already
-- declared finished, and would never be aggregated.
--
-- It is a parameter rather than a constant so that a backfill or a test can ask for a zero
-- margin and get a deterministic answer, without needing a second code path.
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

  -- Which ts buckets were touched by events we have not processed yet? Note the two
  -- different columns: the filter is on received_at, the grouping is on ts.
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
    -- Nothing new. Move the watermark up anyway: we have genuinely scanned this window,
    -- and leaving it behind would make the window grow without bound on a quiet project.
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

  -- Hourly: delete and reinsert each touched bucket in full. Idempotent by construction.
  delete from public.rollup_events_hourly r
  where r.project_id = p_project_id and r.bucket = any (v_buckets);

  insert into public.rollup_events_hourly (project_id, bucket, event_name, event_count, session_count)
  select p_project_id,
         date_trunc('hour', e.ts),
         e.event_name,
         count(*),
         count(distinct e.session_id)
  from public.events_raw e
  where e.project_id = p_project_id
    and date_trunc('hour', e.ts) = any (v_buckets)
  group by 2, 3;

  get diagnostics v_rows_written = row_count;

  -- Unique users per day, as raw membership rather than a count, because uniques do not
  -- add up across buckets.
  delete from public.user_activity_daily u
  where u.project_id = p_project_id and u.day = any (v_days);

  insert into public.user_activity_daily (project_id, day, distinct_id)
  select distinct p_project_id, (date_trunc('day', e.ts))::date, e.distinct_id
  from public.events_raw e
  where e.project_id = p_project_id
    and (date_trunc('day', e.ts))::date = any (v_days);

  -- Property breakdowns, for indexed keys only, top 200 values per key per day.
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
    where e.project_id = p_project_id
      and (date_trunc('day', e.ts))::date = any (v_days)
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

  -- Advance the watermark to the last received_at we actually processed.
  insert into public.rollup_state (project_id, job_name, watermark, updated_at)
  values (p_project_id, 'hourly', coalesce(v_new_watermark, v_upper), now())
  on conflict (project_id, job_name) do update
    set watermark = excluded.watermark, updated_at = now();

  -- Invalidate every cached query for this project in one write, with no delete sweep.
  update public.projects
    set cache_epoch = cache_epoch + 1
    where id = p_project_id;

  update public.rollup_runs
    set status = 'ok',
        finished_at = now(),
        rows_read = v_rows_read,
        rows_written = v_rows_written,
        duration_ms = (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer
    where id = v_run_id;

exception
  when others then
    -- Record the failure and re-raise. A run row that says "failed" with the message is
    -- what turns a silent stall into something the health screen can show.
    update public.rollup_runs
      set status = 'failed',
          finished_at = now(),
          error = sqlerrm,
          duration_ms = (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer
      where id = v_run_id;
    raise;
end;
$$;

-- Every project, one at a time. A failure in one project must not stop the others.
create or replace function jobs.run_rollups()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid;
begin
  for v_project in select id from public.projects loop
    begin
      perform jobs.run_project_rollup(v_project);
    exception
      when others then
        raise warning 'rollup failed for project %: %', v_project, sqlerrm;
    end;
  end loop;
end;
$$;

-- Daily rollups are derived from the hourly table rather than from events_raw, so they
-- stay correct once raw events are pruned. Recomputes the last few days, which is cheap
-- and covers anything that arrived late.
create or replace function jobs.run_daily_rollups(p_days integer default 3)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := date_trunc('day', now()) - make_interval(days => p_days);
begin
  delete from public.rollup_events_daily d where d.bucket >= v_from;

  insert into public.rollup_events_daily (project_id, bucket, event_name, event_count, session_count)
  select h.project_id,
         date_trunc('day', h.bucket),
         h.event_name,
         sum(h.event_count),
         -- Session counts are summed rather than counted distinct, because the hourly
         -- table no longer holds session identities. A session spanning midnight is
         -- counted in both hours, so this slightly overstates daily sessions. The exact
         -- figure comes from the api function, which reads the hourly table directly for
         -- ranges where precision matters.
         sum(h.session_count)
  from public.rollup_events_hourly h
  where h.bucket >= v_from
  group by 1, 2, 3;
end;
$$;

-- ===========================================================================
-- 5. Schedules
-- ===========================================================================

-- Registered here rather than clicked into a dashboard, so the schedule is reviewable,
-- version controlled, and recreated identically on a fresh database.
do $$
begin
  perform cron.unschedule('rollup-hourly');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('rollup-daily');
exception when others then null;
end $$;

select cron.schedule('rollup-hourly', '*/5 * * * *', $$select jobs.run_rollups()$$);
select cron.schedule('rollup-daily', '7 * * * *', $$select jobs.run_daily_rollups(3)$$);

-- ===========================================================================
-- 6. Grants
-- ===========================================================================

grant select on public.rollup_events_hourly to authenticated;
grant select on public.rollup_events_daily to authenticated;
grant select on public.user_activity_daily to authenticated;
grant select on public.rollup_property_daily to authenticated;
grant select on public.rollup_runs to authenticated;
revoke all on public.rollup_state from anon, authenticated;

revoke all on all functions in schema jobs from public, anon, authenticated;
grant execute on all functions in schema jobs to service_role;
