-- Migration 010 - exports, saved views, and the pruning jobs.

-- ===========================================================================
-- 1. Saved views
-- ===========================================================================

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 80),
  query jsonb not null,
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

comment on column public.saved_views.query is
  'The explorer state as the client sent it: events, filter, breakdown, range preset. Stored as jsonb rather than normalised columns because the explorer will grow options and a migration per option is not a good trade.';

create index if not exists saved_views_project_idx on public.saved_views (project_id, created_at desc);

alter table public.saved_views enable row level security;

-- A view is visible to its author, or to the whole project if it was shared.
drop policy if exists saved_views_select on public.saved_views;
create policy saved_views_select on public.saved_views
  for select to authenticated
  using (
    authz.can_read_project(project_id)
    and (is_shared or created_by = (select auth.uid()))
  );

-- A viewer reads the dashboard and does not create anything, including saved views.
drop policy if exists saved_views_insert on public.saved_views;
create policy saved_views_insert on public.saved_views
  for insert to authenticated
  with check (
    authz.can_write_project(project_id, array['owner', 'admin', 'member'])
    and created_by = (select auth.uid())
  );

-- Only the author edits or deletes their own view, whatever their role. An admin who could
-- silently rewrite someone else's saved view would make saved views untrustworthy.
drop policy if exists saved_views_update on public.saved_views;
create policy saved_views_update on public.saved_views
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

drop policy if exists saved_views_delete on public.saved_views;
create policy saved_views_delete on public.saved_views
  for delete to authenticated
  using (created_by = (select auth.uid()));

grant select, insert, update, delete on public.saved_views to authenticated;

-- ===========================================================================
-- 2. Exports
-- ===========================================================================

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('events', 'timeseries', 'breakdown')),
  format text not null default 'csv' check (format in ('csv', 'json')),
  params jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  storage_path text,
  row_count bigint,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

comment on table public.exports is
  'One row per export request. The row is created immediately and the work happens afterwards, so the request returns in milliseconds rather than holding a connection open for a hundred thousand rows.';

create index if not exists exports_project_idx on public.exports (project_id, created_at desc);
create index if not exists exports_queued_idx on public.exports (status) where status = 'queued';

alter table public.exports enable row level security;

drop policy if exists exports_select on public.exports;
create policy exports_select on public.exports
  for select to authenticated
  using (authz.can_read_project(project_id));

drop policy if exists exports_insert on public.exports;
create policy exports_insert on public.exports
  for insert to authenticated
  with check (
    authz.can_write_project(project_id, array['owner', 'admin', 'member'])
    and requested_by = (select auth.uid())
  );

-- No update policy. Status transitions belong to the worker, under the service role. A
-- client that could mark its own export 'done' would be describing a file that does not
-- exist.

grant select, insert on public.exports to authenticated;

-- ===========================================================================
-- 3. Retention pruning
-- ===========================================================================

-- Deletes raw events past each project's retention window, in chunks.
--
-- Chunked because a single delete of several million rows takes a long lock and bloats the
-- table in one go. Rollups are never touched: that is the whole point of aggregating, and
-- it means a project on 30 day retention still has two years of charts.
create or replace function jobs.prune_events(p_batch_size integer default 20000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project record;
  v_deleted integer;
  v_total integer := 0;
  v_run_id uuid;
begin
  for v_project in
    select p.id, p.org_id, p.retention_days from public.projects p
  loop
    insert into public.rollup_runs (job_name, project_id, status)
    values ('prune', v_project.id, 'running')
    returning id into v_run_id;

    loop
      delete from public.events_raw e
      where e.ctid in (
        select e2.ctid
        from public.events_raw e2
        where e2.project_id = v_project.id
          and e2.ts < now() - make_interval(days => v_project.retention_days)
        limit p_batch_size
      );

      get diagnostics v_deleted = row_count;
      v_total := v_total + v_deleted;
      exit when v_deleted = 0;
    end loop;

    update public.rollup_runs
      set status = 'ok', finished_at = now(), rows_written = v_total
      where id = v_run_id;

    if v_total > 0 then
      perform jobs.write_audit(
        v_project.org_id, null, 'retention.pruned', 'project', v_project.id::text,
        jsonb_build_object('rows_deleted', v_total, 'retention_days', v_project.retention_days)
      );
    end if;
  end loop;

  -- Rejected events are diagnostic and are not worth keeping for long.
  delete from public.events_rejected where received_at < now() - interval '14 days';

  return v_total;
end;
$$;

-- Export files are deleted after 30 days. The row stays, so the history of who exported
-- what survives the file itself.
create or replace function jobs.expire_exports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.exports
    set status = 'failed',
        error = 'The file was deleted after 30 days. Run the export again.',
        storage_path = null
    where status = 'done'
      and created_at < now() - interval '30 days'
      and storage_path is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

do $$ begin perform cron.unschedule('prune-events'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('expire-exports'); exception when others then null; end $$;

-- Nightly, off the hour, so it does not collide with the rollup schedule.
select cron.schedule('prune-events', '23 3 * * *', $$select jobs.prune_events()$$);
select cron.schedule('expire-exports', '43 3 * * *', $$select jobs.expire_exports()$$);

-- ===========================================================================
-- 4. Export bookkeeping helpers, for the worker
-- ===========================================================================

create or replace function jobs.claim_export(p_export_id uuid)
returns table (id uuid, project_id uuid, kind text, format text, params jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.exports e
     set status = 'running'
   where e.id = p_export_id and e.status = 'queued'
  returning e.id, e.project_id, e.kind, e.format, e.params;
end;
$$;

create or replace function jobs.finish_export(
  p_export_id uuid,
  p_storage_path text,
  p_row_count bigint
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.exports
     set status = 'done', storage_path = p_storage_path, row_count = p_row_count,
         finished_at = now()
   where id = p_export_id
$$;

create or replace function jobs.fail_export(p_export_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.exports
     set status = 'failed', error = p_error, finished_at = now()
   where id = p_export_id
$$;

-- Downloading is audited: a signed URL to a file of customer events is exactly the kind of
-- access someone will need to account for later.
create or replace function api.record_export_download(p_export_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_export public.exports;
  v_org_id uuid;
begin
  select * into v_export from public.exports e where e.id = p_export_id;
  if v_export.id is null or not authz.can_read_project(v_export.project_id) then
    raise exception 'no such export' using errcode = '22023';
  end if;

  select p.org_id into v_org_id from public.projects p where p.id = v_export.project_id;

  perform jobs.write_audit(
    v_org_id, (select auth.uid()), 'export.downloaded', 'export', p_export_id::text,
    jsonb_build_object('kind', v_export.kind, 'rows', v_export.row_count)
  );
end;
$$;

grant execute on function api.record_export_download(uuid) to authenticated;

revoke all on all functions in schema jobs from public, anon, authenticated;
grant execute on all functions in schema jobs to service_role;
