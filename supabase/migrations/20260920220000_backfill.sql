-- Migration 006 - backfill support.
--
-- The scheduled job only recomputes buckets that newly arrived events touched. That is the
-- right behaviour for keeping up, and it is exactly wrong after fixing a bug in the
-- aggregation itself: the affected buckets have no new events, so the job will never look
-- at them again and the bad numbers stay forever.
--
-- This recomputes a ts range unconditionally, ignoring watermarks entirely.

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

  select array_agg(distinct d::date)
    into v_days
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
         case when r.rank <= 200 then r.prop_value else '__other__' end,
         sum(r.event_count)
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

revoke all on all functions in schema jobs from public, anon, authenticated;
grant execute on all functions in schema jobs to service_role;
