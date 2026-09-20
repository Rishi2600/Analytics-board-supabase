-- Migration 008 - the read API.
--
-- Every dashboard query is one of these functions, called with supabase.rpc(). The
-- frontend never assembles an analytics query itself: keeping the SQL here means the
-- resolution rules, the timezone conversion and the tenancy checks are written once and
-- cannot drift between screens.
--
-- These are security invoker, not definer. They run as the calling user, so row level
-- security applies to every table they touch and a project the caller cannot see returns
-- no rows rather than an error. That is deliberate: an error would confirm the project
-- exists.

-- ===========================================================================
-- Resolution: the server decides the grain, not the client
-- ===========================================================================

-- The client asks for a date range. If it also chose the grain, a careless screen could
-- ask for hourly buckets across two years and pull 17,520 rows into a chart 600 pixels
-- wide.
create or replace function api.resolution_for(p_from timestamptz, p_to timestamptz)
returns text
language sql
immutable
as $$
  select case
    when p_to - p_from <= interval '2 days' then 'hour'
    when p_to - p_from <= interval '90 days' then 'day'
    else 'week'
  end
$$;

grant execute on function api.resolution_for(timestamptz, timestamptz) to authenticated;

-- ===========================================================================
-- Summary: the KPI row, with its own previous period, in one round trip
-- ===========================================================================

create or replace function api.summary(p_project uuid, p_from timestamptz, p_to timestamptz)
returns table (
  total_events bigint,
  unique_users bigint,
  sessions bigint,
  events_per_user numeric,
  prev_total_events bigint,
  prev_unique_users bigint,
  prev_sessions bigint,
  prev_events_per_user numeric,
  timezone text
)
language sql
stable
as $$
  with span as (
    select p_to - p_from as length
  ),
  prev as (
    select p_from - (select length from span) as prev_from, p_from as prev_to
  ),
  tz as (
    select p.timezone from public.projects p where p.id = p_project
  ),
  -- Events and sessions come from the hourly rollup. Unique users and sessions come from
  -- their own membership tables, because neither is additive across buckets.
  current_events as (
    select coalesce(sum(h.event_count), 0) as total
    from public.rollup_events_hourly h
    where h.project_id = p_project and h.bucket >= p_from and h.bucket < p_to
  ),
  prev_events as (
    select coalesce(sum(h.event_count), 0) as total
    from public.rollup_events_hourly h, prev
    where h.project_id = p_project and h.bucket >= prev.prev_from and h.bucket < prev.prev_to
  ),
  -- count(distinct x) forces Postgres to sort. Counting the rows of a distinct subquery
  -- lets it hash instead, which measured three times faster on 73,000 rows and is the
  -- difference between this function fitting the 300ms budget and missing it. There are
  -- four of these counts, so the saving is multiplied by four.
  current_users as (
    select count(*) as total from (
      select distinct u.distinct_id
      from public.user_activity_daily u
      where u.project_id = p_project
        and u.day >= (p_from at time zone 'UTC')::date
        and u.day <= (p_to at time zone 'UTC')::date
    ) d
  ),
  prev_users as (
    select count(*) as total from (
      select distinct u.distinct_id
      from public.user_activity_daily u, prev
      where u.project_id = p_project
        and u.day >= (prev.prev_from at time zone 'UTC')::date
        and u.day <= (prev.prev_to at time zone 'UTC')::date
    ) d
  ),
  current_sessions as (
    select count(*) as total from (
      select distinct s.session_id
      from public.session_activity_daily s
      where s.project_id = p_project
        and s.day >= (p_from at time zone 'UTC')::date
        and s.day <= (p_to at time zone 'UTC')::date
    ) d
  ),
  prev_sessions_cte as (
    select count(*) as total from (
      select distinct s.session_id
      from public.session_activity_daily s, prev
      where s.project_id = p_project
        and s.day >= (prev.prev_from at time zone 'UTC')::date
        and s.day <= (prev.prev_to at time zone 'UTC')::date
    ) d
  )
  select
    ce.total,
    cu.total,
    cs.total,
    case when cu.total = 0 then 0 else round(ce.total::numeric / cu.total, 2) end,
    pe.total,
    pu.total,
    ps.total,
    case when pu.total = 0 then 0 else round(pe.total::numeric / pu.total, 2) end,
    (select timezone from tz)
  from current_events ce, current_users cu, current_sessions cs,
       prev_events pe, prev_users pu, prev_sessions_cte ps
$$;

grant execute on function api.summary(uuid, timestamptz, timestamptz) to authenticated;

-- ===========================================================================
-- Timeseries
-- ===========================================================================

-- Buckets are cut in the project's timezone, which is why the conversion happens here
-- rather than in the browser: two people in different offices must see the same chart.
--
-- p_filters accepts a single {"key": ..., "value": ...} property condition, served from
-- the property rollup. Multiple simultaneous conditions are not supported, because
-- answering them from pre-aggregated data needs a rollup per combination of properties and
-- that cardinality is exactly what kills analytics databases. The trigger for building it
-- is recorded in docs/ARCHITECTURE.md.
create or replace function api.timeseries(
  p_project uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_events text[] default null,
  p_filters jsonb default '{}'::jsonb,
  p_resolution text default null
)
returns table (bucket timestamptz, event_name text, event_count bigint, resolution text)
language plpgsql
stable
as $$
declare
  v_tz text;
  v_resolution text := coalesce(p_resolution, api.resolution_for(p_from, p_to));
  v_filter_key text := p_filters ->> 'key';
  v_filter_value text := p_filters ->> 'value';
begin
  select p.timezone into v_tz from public.projects p where p.id = p_project;
  if v_tz is null then
    return; -- No such project, or not visible to this caller. Empty, not an error.
  end if;

  if v_filter_key is not null and v_filter_value is not null then
    -- Filtered: served from the daily property rollup, so the finest grain is a day.
    return query
      select (date_trunc('day', d.day::timestamp) at time zone v_tz),
             d.event_name,
             sum(d.event_count)::bigint,
             'day'::text
      from public.rollup_property_daily d
      where d.project_id = p_project
        and d.prop_key = v_filter_key
        and d.prop_value = v_filter_value
        and d.day >= (p_from at time zone v_tz)::date
        and d.day <= (p_to at time zone v_tz)::date
        and (p_events is null or d.event_name = any (p_events))
      group by 1, 2
      order by 1, 2;
    return;
  end if;

  if v_resolution = 'hour' then
    return query
      select h.bucket, h.event_name, h.event_count, 'hour'::text
      from public.rollup_events_hourly h
      where h.project_id = p_project
        and h.bucket >= p_from and h.bucket < p_to
        and (p_events is null or h.event_name = any (p_events))
      order by 1, 2;
  elsif v_resolution = 'week' then
    return query
      select (date_trunc('week', h.bucket at time zone v_tz) at time zone v_tz),
             h.event_name,
             sum(h.event_count)::bigint,
             'week'::text
      from public.rollup_events_hourly h
      where h.project_id = p_project
        and h.bucket >= p_from and h.bucket < p_to
        and (p_events is null or h.event_name = any (p_events))
      group by 1, 2
      order by 1, 2;
  else
    return query
      select (date_trunc('day', h.bucket at time zone v_tz) at time zone v_tz),
             h.event_name,
             sum(h.event_count)::bigint,
             'day'::text
      from public.rollup_events_hourly h
      where h.project_id = p_project
        and h.bucket >= p_from and h.bucket < p_to
        and (p_events is null or h.event_name = any (p_events))
      group by 1, 2
      order by 1, 2;
  end if;
end;
$$;

grant execute on function api.timeseries(uuid, timestamptz, timestamptz, text[], jsonb, text) to authenticated;

-- ===========================================================================
-- Top events and breakdowns
-- ===========================================================================

create or replace function api.top_events(
  p_project uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 10
)
returns table (event_name text, event_count bigint, share numeric)
language sql
stable
as $$
  with totals as (
    select h.event_name, sum(h.event_count) as event_count
    from public.rollup_events_hourly h
    where h.project_id = p_project and h.bucket >= p_from and h.bucket < p_to
    group by 1
  ),
  overall as (select coalesce(sum(event_count), 0) as total from totals)
  select t.event_name,
         t.event_count,
         case when o.total = 0 then 0 else round(t.event_count::numeric / o.total, 4) end
  from totals t, overall o
  order by t.event_count desc
  limit least(greatest(p_limit, 1), 100)
$$;

grant execute on function api.top_events(uuid, timestamptz, timestamptz, integer) to authenticated;

-- Breakdown of one event by one property.
--
-- __other__ is returned rather than hidden. A breakdown whose percentages quietly fail to
-- add up teaches people to distrust every number on the screen.
create or replace function api.breakdown(
  p_project uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_event text default null,
  p_prop text default null,
  p_limit integer default 20
)
returns table (prop_value text, event_count bigint, share numeric)
language plpgsql
stable
as $$
declare
  v_tz text;
begin
  select p.timezone into v_tz from public.projects p where p.id = p_project;
  if v_tz is null then
    return;
  end if;

  return query
    with rows_in_range as (
      select d.prop_value, sum(d.event_count) as event_count
      from public.rollup_property_daily d
      where d.project_id = p_project
        and d.prop_key = p_prop
        and (p_event is null or d.event_name = p_event)
        and d.day >= (p_from at time zone v_tz)::date
        and d.day <= (p_to at time zone v_tz)::date
      group by 1
    ),
    overall as (select coalesce(sum(r.event_count), 0) as total from rows_in_range r)
    select r.prop_value,
           r.event_count,
           case when o.total = 0 then 0 else round(r.event_count::numeric / o.total, 4) end
    from rows_in_range r, overall o
    order by r.event_count desc
    limit least(greatest(p_limit, 1), 200);
end;
$$;

grant execute on function api.breakdown(uuid, timestamptz, timestamptz, text, text, integer) to authenticated;

-- The event names this project has actually sent, for the explorer's selectors.
create or replace function api.event_names(p_project uuid)
returns table (event_name text, event_count bigint)
language sql
stable
as $$
  select h.event_name, sum(h.event_count)
  from public.rollup_events_hourly h
  where h.project_id = p_project
  group by 1
  order by 2 desc
  limit 200
$$;

grant execute on function api.event_names(uuid) to authenticated;

-- The property keys available for breakdowns.
create or replace function api.property_keys(p_project uuid)
returns table (prop_key text, enabled boolean)
language sql
stable
as $$
  select ip.prop_key, ip.enabled
  from public.indexed_properties ip
  where ip.project_id = p_project
  order by ip.prop_key
$$;

grant execute on function api.property_keys(uuid) to authenticated;

-- ===========================================================================
-- Live
-- ===========================================================================

create or replace function api.live_events(p_project uuid, p_limit integer default 100)
returns table (
  id uuid,
  event_name text,
  distinct_id text,
  session_id text,
  ts timestamptz,
  received_at timestamptz,
  properties jsonb,
  context jsonb
)
language sql
stable
as $$
  select e.id, e.event_name, e.distinct_id, e.session_id, e.ts, e.received_at,
         e.properties, e.context
  from public.events_raw e
  where e.project_id = p_project
  order by e.received_at desc
  limit least(greatest(p_limit, 1), 500)
$$;

grant execute on function api.live_events(uuid, integer) to authenticated;

-- ===========================================================================
-- Funnels and retention
-- ===========================================================================

-- These two read events_raw, and that is a deliberate exception to the rule that dashboard
-- queries read rollups. See ADR-0009.
--
-- A funnel asks "did this user do B within one hour of doing A". The answer depends on the
-- interval between two individual events. Time-bucketed aggregates have thrown that
-- information away by construction: once events are counted per hour, the gap between two
-- of them inside the bucket no longer exists anywhere. No rollup shape recovers it.
--
-- The cost is bounded rather than ignored: both functions are limited to a date range,
-- both rely on the (project_id, event_name, ts) index, and both are naturally limited by
-- the project's raw retention window.

create or replace function api.funnel(
  p_project uuid,
  p_steps jsonb,
  p_window interval default interval '1 day',
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now()
)
returns table (
  step_index integer,
  event_name text,
  users bigint,
  conversion_from_first numeric,
  conversion_from_previous numeric
)
language plpgsql
-- Volatile, not stable: this builds temporary tables to walk the step chain, and Postgres
-- refuses CREATE TABLE AS inside a non-volatile function. The alternative is a self-join
-- chain assembled with dynamic SQL, which is one query but a good deal harder to read for
-- no measured gain at this range size.
volatile
as $$
declare
  v_step_count integer := jsonb_array_length(p_steps);
  v_step text;
  v_index integer;
  v_first_count bigint := 0;
  v_prev_count bigint := 0;
  v_count bigint;
begin
  if v_step_count is null or v_step_count < 2 then
    raise exception 'a funnel needs at least two steps' using errcode = '22023';
  end if;
  if v_step_count > 8 then
    raise exception 'a funnel is limited to eight steps' using errcode = '22023';
  end if;

  -- Step one: everyone who did the first event in the range, and when they first did it.
  create temporary table funnel_cursor on commit drop as
  select e.distinct_id, min(e.ts) as reached_at
  from public.events_raw e
  where e.project_id = p_project
    and e.event_name = (p_steps ->> 0)
    and e.ts >= p_from and e.ts < p_to
  group by e.distinct_id;

  select count(*) into v_count from funnel_cursor;
  v_first_count := v_count;
  v_prev_count := v_count;

  step_index := 0;
  event_name := (p_steps ->> 0);
  users := v_count;
  conversion_from_first := 1;
  conversion_from_previous := 1;
  return next;

  for v_index in 1..(v_step_count - 1) loop
    v_step := p_steps ->> v_index;

    -- Each subsequent step keeps only users who did it after the previous step and inside
    -- the conversion window, carrying their new timestamp forward.
    create temporary table funnel_next on commit drop as
    select c.distinct_id, min(e.ts) as reached_at
    from funnel_cursor c
    join public.events_raw e
      on e.project_id = p_project
     and e.distinct_id = c.distinct_id
     and e.event_name = v_step
     and e.ts > c.reached_at
     and e.ts <= c.reached_at + p_window
    group by c.distinct_id;

    drop table funnel_cursor;
    alter table funnel_next rename to funnel_cursor;

    select count(*) into v_count from funnel_cursor;

    step_index := v_index;
    event_name := v_step;
    users := v_count;
    conversion_from_first := case when v_first_count = 0 then 0
                                  else round(v_count::numeric / v_first_count, 4) end;
    conversion_from_previous := case when v_prev_count = 0 then 0
                                     else round(v_count::numeric / v_prev_count, 4) end;
    return next;

    v_prev_count := v_count;
  end loop;

  drop table funnel_cursor;
end;
$$;

grant execute on function api.funnel(uuid, jsonb, interval, timestamptz, timestamptz) to authenticated;

create or replace function api.retention(
  p_project uuid,
  p_cohort_event text,
  p_return_event text,
  p_periods integer default 8,
  p_period text default 'week',
  p_from timestamptz default now() - interval '90 days',
  p_to timestamptz default now()
)
returns table (
  cohort_start date,
  cohort_size bigint,
  period_number integer,
  returned bigint,
  rate numeric
)
language plpgsql
stable
as $$
declare
  v_tz text;
  v_unit text := case when p_period = 'month' then 'month' else 'week' end;
begin
  select p.timezone into v_tz from public.projects p where p.id = p_project;
  if v_tz is null then
    return;
  end if;

  return query
  with cohorts as (
    -- A user's cohort is the period of their *first* cohort event, ever, not their first
    -- in the range. Anchoring on the range would move people between cohorts every time
    -- the date picker changed.
    select e.distinct_id,
           date_trunc(v_unit, min(e.ts) at time zone v_tz)::date as cohort_start
    from public.events_raw e
    where e.project_id = p_project and e.event_name = p_cohort_event
    group by e.distinct_id
  ),
  in_range as (
    select c.*
    from cohorts c
    where c.cohort_start >= (p_from at time zone v_tz)::date
      and c.cohort_start <= (p_to at time zone v_tz)::date
  ),
  sizes as (
    select r.cohort_start, count(*) as cohort_size
    from in_range r
    group by 1
  ),
  returns as (
    select r.cohort_start,
           -- Subtracting two dates in Postgres yields an integer number of days, not an
           -- interval, so this counts periods directly rather than dividing seconds.
           -- Months are not a fixed number of days, so they are counted with age().
           case
             when v_unit = 'week'
               then ((date_trunc('week', e.ts at time zone v_tz)::date - r.cohort_start) / 7)::integer
             else (
               extract(year from age(date_trunc('month', e.ts at time zone v_tz)::date, r.cohort_start))::integer * 12
               + extract(month from age(date_trunc('month', e.ts at time zone v_tz)::date, r.cohort_start))::integer
             )
           end as period_number,
           count(distinct e.distinct_id) as returned
    from in_range r
    join public.events_raw e
      on e.project_id = p_project
     and e.distinct_id = r.distinct_id
     and e.event_name = p_return_event
    group by 1, 2
  )
  select s.cohort_start,
         s.cohort_size,
         p.period_number,
         coalesce(rt.returned, 0),
         case when s.cohort_size = 0 then 0
              else round(coalesce(rt.returned, 0)::numeric / s.cohort_size, 4) end
  from sizes s
  cross join generate_series(0, greatest(p_periods - 1, 0)) as p(period_number)
  left join returns rt
    on rt.cohort_start = s.cohort_start and rt.period_number = p.period_number
  order by s.cohort_start desc, p.period_number;
end;
$$;

grant execute on function api.retention(uuid, text, text, integer, text, timestamptz, timestamptz) to authenticated;

-- ===========================================================================
-- Ingestion health
-- ===========================================================================

create or replace function api.ingestion_health(
  p_project uuid,
  p_from timestamptz default now() - interval '7 days',
  p_to timestamptz default now()
)
returns table (
  bucket timestamptz,
  accepted bigint,
  rejected bigint
)
language sql
stable
as $$
  with hours as (
    select generate_series(date_trunc('hour', p_from), date_trunc('hour', p_to), interval '1 hour') as bucket
  ),
  accepted_counts as (
    select date_trunc('hour', h.bucket) as bucket, sum(h.event_count) as total
    from public.rollup_events_hourly h
    where h.project_id = p_project and h.bucket >= p_from and h.bucket < p_to
    group by 1
  ),
  rejected_counts as (
    select date_trunc('hour', r.received_at) as bucket, count(*) as total
    from public.events_rejected r
    where r.project_id = p_project and r.received_at >= p_from and r.received_at < p_to
    group by 1
  )
  select hours.bucket,
         coalesce(a.total, 0)::bigint,
         coalesce(rj.total, 0)::bigint
  from hours
  left join accepted_counts a on a.bucket = hours.bucket
  left join rejected_counts rj on rj.bucket = hours.bucket
  order by 1
$$;

grant execute on function api.ingestion_health(uuid, timestamptz, timestamptz) to authenticated;

create or replace function api.rejection_reasons(
  p_project uuid,
  p_from timestamptz default now() - interval '7 days',
  p_to timestamptz default now()
)
returns table (reason text, total bigint, sample jsonb, last_seen timestamptz)
language sql
stable
as $$
  select r.reason,
         count(*)::bigint,
         (array_agg(r.raw_payload order by r.received_at desc))[1],
         max(r.received_at)
  from public.events_rejected r
  where r.project_id = p_project and r.received_at >= p_from and r.received_at < p_to
  group by 1
  order by 2 desc
  limit 20
$$;

grant execute on function api.rejection_reasons(uuid, timestamptz, timestamptz) to authenticated;

-- Rollup freshness, for the health screen. Lag is what tells a customer whether the number
-- they are looking at is current or twenty minutes stale.
--
-- Security definer, unlike every other function in this schema, because it reads
-- rollup_state. That table has row level security enabled with no policies, so an invoker
-- function would quietly return a null watermark and the health screen would report a lag
-- of zero forever. The membership check that a policy would have done is therefore
-- explicit, and comes first.
create or replace function api.rollup_status(p_project uuid)
returns table (
  last_run_at timestamptz,
  last_status text,
  last_error text,
  watermark timestamptz,
  lag_seconds integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not authz.can_read_project(p_project) then
    return;
  end if;

  return query
    select r.started_at,
           r.status,
           r.error,
           st.watermark,
           greatest(0, extract(epoch from (now() - coalesce(st.watermark, now())))::integer)
    from public.rollup_runs r
    left join public.rollup_state st
      on st.project_id = p_project and st.job_name = 'hourly'
    where r.project_id = p_project and r.job_name = 'hourly'
    order by r.started_at desc
    limit 1;
end;
$$;

grant execute on function api.rollup_status(uuid) to authenticated;
