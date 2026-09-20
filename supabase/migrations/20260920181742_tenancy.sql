-- Migration 001 - tenancy and access control.
--
-- Creates the schemas the project uses, the organization and project tables, and the row
-- level security that keeps one customer's data away from another's. Every table created
-- here gets its policies in this same file. That is the rule: a table without a policy is
-- either a leak or an empty result, and both get found in production rather than review.
--
-- Section order matters. A function written in plain SQL has its body validated when it
-- is created, so every helper has to come after the tables it reads, and every policy
-- after the helper it calls. The file therefore runs schemas, then tables, then helpers,
-- then policies, then triggers.
--
-- Roles on this stack:
--   anon           not logged in. Gets nothing here.
--   authenticated  a signed-in dashboard user. Everything below is scoped to them.
--   service_role   our own jobs and Edge Functions. Bypasses RLS entirely.


-- ===========================================================================
-- 1. Schemas
-- ===========================================================================

-- Read facing SQL functions the dashboard calls with supabase.rpc().
create schema if not exists api;

-- Internal job functions. No client grants, ever. This is deliberate and load bearing:
-- if a client can call a job, it can bypass the rules the job runs under.
create schema if not exists jobs;

-- Policy helpers. These would read more naturally in the auth schema, and the original
-- design called for auth.current_user_org_ids(), but Supabase owns that schema and denies
-- CREATE on it. This schema is not in the PostgREST exposed list, so the dashboard cannot
-- call these directly even though policies evaluate them on its behalf. See ADR-0007.
create schema if not exists authz;

grant usage on schema api to authenticated;
grant usage on schema authz to authenticated;
revoke all on schema jobs from public;

comment on schema api is 'Read facing functions callable by the dashboard through rpc().';
comment on schema jobs is 'Internal job functions. Service role only. No client grants.';
comment on schema authz is 'Security definer helpers that row level security policies call. Not exposed through the API.';


-- ===========================================================================
-- 2. Tables
-- ===========================================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$'),
  created_at timestamptz not null default now()
);

comment on table public.organizations is
  'The billing and membership boundary. Everything else hangs off this.';

create table if not exists public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

comment on column public.org_members.role is
  'owner manages everything including deletion, admin manages projects members and keys, member reads and creates saved views, viewer reads only.';

create index if not exists org_members_user_id_idx on public.org_members (user_id);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$'),
  timezone text not null default 'Etc/UTC',
  retention_days integer not null default 90 check (retention_days between 1 and 3650),
  allowed_origins text[] not null default '{}',
  filter_bots boolean not null default true,
  cache_epoch bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

comment on column public.projects.timezone is
  'IANA name. Rollups are stored in UTC and converted to this at query time, never stored per timezone.';
comment on column public.projects.retention_days is
  'Raw events older than this are pruned nightly. Rollups survive pruning, so history outlives the raw rows.';
comment on column public.projects.allowed_origins is
  'CORS allowlist for browser pk_live keys. Empty means no browser origin is allowed.';
comment on column public.projects.cache_epoch is
  'Bumped by the rollup job when this project data changes, which invalidates every cached query for it without a delete sweep.';

create index if not exists projects_org_id_idx on public.projects (org_id);

create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role text not null check (role in ('admin', 'member', 'viewer')),
  token_hash bytea not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.org_invites is
  'Only the hash of the invite token is stored. The token itself is shown once and is not recoverable from here.';
comment on column public.org_invites.role is
  'An invite cannot grant ownership. Ownership is transferred explicitly by an existing owner.';

create unique index if not exists org_invites_token_hash_idx on public.org_invites (token_hash);
create index if not exists org_invites_org_id_idx on public.org_invites (org_id);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_log is
  'Append only from the clients point of view. There is a read policy and deliberately no insert, update or delete policy, so the only way a row gets written is through a security definer function or the service role. A client that can forge or erase its own audit trail does not have one.';

create index if not exists audit_log_org_created_idx on public.audit_log (org_id, created_at desc);

-- Row level security on every table, before any policy exists. Between this statement and
-- the policy section the tables are readable by nobody, which is the correct default.
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.projects enable row level security;
alter table public.org_invites enable row level security;
alter table public.audit_log enable row level security;


-- ===========================================================================
-- 3. Helper functions used by policies
-- ===========================================================================

-- Every organization the current user belongs to, as an array.
--
-- Policies call this instead of running a membership subquery per row. Marked stable so
-- Postgres evaluates it once per statement rather than once per row, which is the
-- difference between a dashboard that loads and one that times out on the members table.
--
-- search_path is pinned to empty, so every reference inside has to be schema qualified.
-- That is what stops a caller from shadowing org_members with their own table and steering
-- a security definer function into reading it.
create or replace function authz.current_user_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.org_id), '{}'::uuid[])
  from public.org_members m
  where m.user_id = (select auth.uid())
$$;

-- Does the current user hold one of these roles in this organization?
create or replace function authz.has_org_role(p_org_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  )
$$;

-- The shared predicate for every project scoped table added in later migrations.
--
-- Written once here so the rule lives in one place. Events, rollups, API keys, exports and
-- saved views all reach for this rather than restating the join, which means a fix to the
-- tenancy rule is a fix everywhere rather than in twenty policies that have drifted.
create or replace function authz.can_read_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.org_id = any (authz.current_user_org_ids())
  )
$$;

-- The same, for writes, with a role floor. A viewer can read a project and change nothing
-- in it.
create or replace function authz.can_write_project(p_project_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    join public.org_members m on m.org_id = p.org_id
    where p.id = p_project_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  )
$$;

-- Lowercase, hyphenated, no leading or trailing separators. Used for organization and
-- project slugs so a URL never carries whatever the user typed.
create or replace function public.slugify(p_input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_input, '')), '[^a-z0-9]+', '-', 'g'))
$$;

-- Writer used by security definer functions and jobs. Lives in the jobs schema, which has
-- no client grants, so it is unreachable from the dashboard.
create or replace function jobs.write_audit(
  p_org_id uuid,
  p_actor uuid,
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (org_id, actor_user_id, action, target_type, target_id, metadata)
  values (p_org_id, p_actor, p_action, p_target_type, p_target_id, p_metadata)
$$;


-- ===========================================================================
-- 4. Policies
-- ===========================================================================

-- organizations ------------------------------------------------------------

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = any (authz.current_user_org_ids()));

-- There is deliberately no insert policy on organizations. Creation goes through
-- api.create_organization() instead, for a reason worth writing down.
--
-- A direct insert cannot work here. PostgREST asks for the new row back, and the row level
-- security check on that RETURNING clause runs while the statement is still executing,
-- before any after-insert trigger could have written the membership row. The creator would
-- be unable to see the organization they just created. Beyond that, one function is a
-- single audited path that cannot produce an organization with no owner.

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (authz.has_org_role(id, array['owner', 'admin']))
  with check (authz.has_org_role(id, array['owner', 'admin']));

-- Deleting an organization destroys every project and event under it. Owner only.
drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations
  for delete to authenticated
  using (authz.has_org_role(id, array['owner']));

-- org_members --------------------------------------------------------------

drop policy if exists org_members_select on public.org_members;
create policy org_members_select on public.org_members
  for select to authenticated
  using (org_id = any (authz.current_user_org_ids()));

drop policy if exists org_members_insert on public.org_members;
create policy org_members_insert on public.org_members
  for insert to authenticated
  with check (authz.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists org_members_update on public.org_members;
create policy org_members_update on public.org_members
  for update to authenticated
  using (authz.has_org_role(org_id, array['owner', 'admin']))
  with check (authz.has_org_role(org_id, array['owner', 'admin']));

-- An admin or owner can remove someone. Anyone can remove themselves, which is how you
-- leave an organization.
drop policy if exists org_members_delete on public.org_members;
create policy org_members_delete on public.org_members
  for delete to authenticated
  using (
    authz.has_org_role(org_id, array['owner', 'admin'])
    or user_id = (select auth.uid())
  );

-- projects -----------------------------------------------------------------

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (org_id = any (authz.current_user_org_ids()));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated
  with check (authz.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (authz.has_org_role(org_id, array['owner', 'admin']))
  with check (authz.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using (authz.has_org_role(org_id, array['owner', 'admin']));

-- org_invites --------------------------------------------------------------

drop policy if exists org_invites_select on public.org_invites;
create policy org_invites_select on public.org_invites
  for select to authenticated
  using (authz.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists org_invites_insert on public.org_invites;
create policy org_invites_insert on public.org_invites
  for insert to authenticated
  with check (authz.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists org_invites_update on public.org_invites;
create policy org_invites_update on public.org_invites
  for update to authenticated
  using (authz.has_org_role(org_id, array['owner', 'admin']))
  with check (authz.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists org_invites_delete on public.org_invites;
create policy org_invites_delete on public.org_invites
  for delete to authenticated
  using (authz.has_org_role(org_id, array['owner', 'admin']));

-- audit_log ----------------------------------------------------------------

-- Read only, on purpose. See the table comment: there is no insert, update or delete
-- policy, so the audit trail cannot be forged or erased by the client it describes.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (org_id = any (authz.current_user_org_ids()));


-- ===========================================================================
-- 5. Triggers
-- ===========================================================================

-- The timezone has to be a name Postgres actually knows, or every rollup conversion for
-- this project silently falls back and the charts are wrong by hours. Checked here rather
-- than trusted from the client.
create or replace function public.validate_project_timezone()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'unknown timezone: %', new.timezone
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_validate_timezone on public.projects;
create trigger projects_validate_timezone
  before insert or update of timezone on public.projects
  for each row execute function public.validate_project_timezone();

-- An organization with no owner cannot be administered by anyone, and the only route back
-- is a support ticket. Cheaper to refuse the last removal or demotion.
create or replace function public.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid := old.org_id;
  v_owner_count integer;
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;

  select count(*) into v_owner_count
  from public.org_members
  where org_id = v_org_id and role = 'owner';

  if v_owner_count <= 1 then
    raise exception 'an organization must keep at least one owner'
      using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists org_members_guard_last_owner on public.org_members;
create trigger org_members_guard_last_owner
  before update or delete on public.org_members
  for each row execute function public.guard_last_owner();

-- Record role changes. Who gained access and when is exactly the question asked after an
-- incident.
create or replace function public.audit_member_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role is distinct from new.role then
    perform jobs.write_audit(
      new.org_id, (select auth.uid()), 'member.role_changed', 'user', new.user_id::text,
      jsonb_build_object('from', old.role, 'to', new.role)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists org_members_audit_role on public.org_members;
create trigger org_members_audit_role
  after update on public.org_members
  for each row execute function public.audit_member_role_change();


-- ===========================================================================
-- 6. Organization creation and invite acceptance
-- ===========================================================================

-- Creates an organization and makes the caller its owner, in one transaction.
--
-- This is the only way an organization comes into existence. See the note in the policy
-- section for why a direct insert cannot work.
create or replace function api.create_organization(p_name text, p_slug text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_slug text;
  v_org_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_slug := public.slugify(coalesce(nullif(trim(p_slug), ''), p_name));
  if v_slug = '' then
    raise exception 'an organization needs a name that contains at least one letter or number'
      using errcode = '22023';
  end if;

  -- Slugs are globally unique and appear in URLs, so a collision is expected rather than
  -- exceptional. Suffix instead of failing, and let the caller keep the name they chose.
  if exists (select 1 from public.organizations o where o.slug = v_slug) then
    v_slug := left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  insert into public.organizations (name, slug)
  values (trim(p_name), v_slug)
  returning id into v_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (v_org_id, v_uid, 'owner');

  perform jobs.write_audit(v_org_id, v_uid, 'org.created', 'organization', v_org_id::text,
    jsonb_build_object('name', trim(p_name), 'slug', v_slug));

  return v_org_id;
end;
$$;

grant execute on function api.create_organization(text, text) to authenticated;


-- Accepting an invite is the one membership write that cannot go through a policy: the
-- person accepting is by definition not a member yet, so no policy could let them in.
-- Security definer, with the token checked inside, is the right shape for that.
--
-- The raw token never touches the database. It is hashed here and compared against the
-- stored hash, so a leak of this table does not hand anyone a usable invite.
create or replace function api.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.org_invites;
  v_uid uuid := (select auth.uid());
  v_email text := (select u.email from auth.users u where u.id = (select auth.uid()));
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_invite
  from public.org_invites i
  where i.token_hash = sha256(convert_to(p_token, 'utf8'));

  -- One message for all the failure cases below. Telling the caller which one it was
  -- turns this function into an oracle for probing valid tokens.
  if v_invite.id is null
     or v_invite.accepted_at is not null
     or v_invite.expires_at < now()
     or lower(v_invite.email) <> lower(coalesce(v_email, '')) then
    raise exception 'this invite is not valid' using errcode = '22023';
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (v_invite.org_id, v_uid, v_invite.role)
  on conflict (org_id, user_id) do nothing;

  update public.org_invites set accepted_at = now() where id = v_invite.id;

  perform jobs.write_audit(
    v_invite.org_id, v_uid, 'member.invite_accepted', 'user', v_uid::text,
    jsonb_build_object('role', v_invite.role)
  );

  return v_invite.org_id;
end;
$$;

grant execute on function api.accept_invite(text) to authenticated;


-- ===========================================================================
-- 7. Grants
-- ===========================================================================

-- Policies evaluate as the querying role, so authenticated needs execute on the helpers.
-- They are security definer and read only, and the schema is not exposed through the API.
grant execute on all functions in schema authz to authenticated;

-- The dashboard reaches these tables directly through PostgREST, under the policies above.
-- No insert on organizations: api.create_organization() is the only route in.
grant select, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.org_members to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.org_invites to authenticated;
grant select on public.audit_log to authenticated;

-- Nothing in the jobs schema is callable by a client, including anything added later.
revoke all on all functions in schema jobs from public, anon, authenticated;
