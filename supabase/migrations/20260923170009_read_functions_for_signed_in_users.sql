-- Makes the Overview, Funnels and Retention screens load for a signed-in user.
--
-- summary, funnel and retention were security invoker, so row level security ran
-- authz.can_read_project() once per row scanned. Measured as the authenticated role on
-- 1.7M events: summary 91s, funnel 43s, retention over 60s. As the table owner the same
-- calls take 43ms, 230ms and 277ms. They now run as definer and check access once, up
-- front, the same pattern api.rollup_status already uses. A project the caller cannot
-- read still returns no rows. See ADR-0013.
--
-- Also fixes api.breakdown, which failed on every call that returned a row: sum() over a
-- bigint is numeric, and the function declares bigint.

-- ---------------------------------------------------------------------------
-- summary
-- ---------------------------------------------------------------------------

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
  with span as (
    select p_to - p_from as length
  ),
  prev as (
    select p_from - (select length from span) as prev_from, p_from as prev_to
  ),
  tz as (
    select p.timezone from public.projects p where p.id = p_project
  ),
  current_events as (
    select coalesce(sum(h.event_count), 0)::bigint as total
    from public.rollup_events_hourly h
    where h.project_id = p_project and h.bucket >= p_from and h.bucket < p_to
  ),
  prev_events as (
    select coalesce(sum(h.event_count), 0)::bigint as total
    from public.rollup_events_hourly h, prev
    where h.project_id = p_project and h.bucket >= prev.prev_from and h.bucket < prev.prev_to
  ),
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
    (select tz.timezone from tz)
  from current_events ce, current_users cu, current_sessions cs,
       prev_events pe, prev_users pu, prev_sessions_cte ps;
end;
$$;

-- Sessions are almost unique per day, so a distinct count over a month is a hash of
-- several hundred thousand values that spills to disk. Reading an index in session order
-- lets Postgres count distinct values as they stream past instead. 90 days: 840ms to 210ms.
create index if not exists session_activity_daily_session_idx
  on public.session_activity_daily (project_id, session_id, day);

create index if not exists user_activity_daily_user_idx
  on public.user_activity_daily (project_id, distinct_id, day);

-- ---------------------------------------------------------------------------
-- breakdown: same function, with the sum cast back to the declared type
-- ---------------------------------------------------------------------------

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
      select d.prop_value, sum(d.event_count)::bigint as event_count
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

-- ---------------------------------------------------------------------------
-- funnel
-- ---------------------------------------------------------------------------

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
volatile
security definer
set search_path = ''
as $$
declare
  v_step_count integer := jsonb_array_length(p_steps);
  v_step text;
  v_index integer;
  v_first_count bigint := 0;
  v_prev_count bigint := 0;
  v_count bigint;
begin
  if not authz.can_read_project(p_project) then
    return;
  end if;
  if v_step_count is null or v_step_count < 2 then
    raise exception 'a funnel needs at least two steps' using errcode = '22023';
  end if;
  if v_step_count > 8 then
    raise exception 'a funnel is limited to eight steps' using errcode = '22023';
  end if;

  create temporary table funnel_cursor on commit drop as
  select e.distinct_id, min(e.ts) as reached_at
  from public.events_raw e
  where e.project_id = p_project
    and e.event_name = (p_steps ->> 0)
    and e.ts >= p_from and e.ts < p_to
  group by e.distinct_id;

  select count(*) into v_count from pg_temp.funnel_cursor;
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

    create temporary table funnel_next on commit drop as
    select c.distinct_id, min(e.ts) as reached_at
    from pg_temp.funnel_cursor c
    join public.events_raw e
      on e.project_id = p_project
     and e.distinct_id = c.distinct_id
     and e.event_name = v_step
     and e.ts > c.reached_at
     and e.ts <= c.reached_at + p_window
    group by c.distinct_id;

    drop table pg_temp.funnel_cursor;
    alter table pg_temp.funnel_next rename to funnel_cursor;

    select count(*) into v_count from pg_temp.funnel_cursor;

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

  drop table pg_temp.funnel_cursor;
end;
$$;

-- ---------------------------------------------------------------------------
-- retention
-- ---------------------------------------------------------------------------

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
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_unit text := case when p_period = 'month' then 'month' else 'week' end;
begin
  if not authz.can_read_project(p_project) then
    return;
  end if;

  select p.timezone into v_tz from public.projects p where p.id = p_project;
  if v_tz is null then
    return;
  end if;

  return query
  with cohorts as (
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

-- create or replace keeps existing grants, but the definer functions must never be
-- callable by anon, so that is stated rather than inherited.
revoke execute on function api.summary(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function api.funnel(uuid, jsonb, interval, timestamptz, timestamptz) from public, anon;
revoke execute on function api.retention(uuid, text, text, integer, text, timestamptz, timestamptz) from public, anon;
grant execute on function api.summary(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function api.funnel(uuid, jsonb, interval, timestamptz, timestamptz) to authenticated;
grant execute on function api.retention(uuid, text, text, integer, text, timestamptz, timestamptz) to authenticated;
