-- Migration 002 - project API keys.
--
-- Customers authenticate to the ingestion endpoint with a key we issue. The security
-- property that matters: a leak of our database must not hand anyone a working key.
-- So the full key exists exactly once, in the response that created it, and what we keep
-- is a salted SHA-256 hash in a table no client role can read under any circumstances.
--
-- Two key types, and the difference is not cosmetic:
--   pk_live_*  browser safe, write only, CORS gated by projects.allowed_origins
--   sk_live_*  server only, rejected outright if the request carries an Origin header

create extension if not exists pgcrypto with schema extensions;

-- ===========================================================================
-- 1. Tables
-- ===========================================================================

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  key_prefix text not null,
  key_type text not null check (key_type in ('public', 'secret')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

comment on table public.api_keys is
  'The visible half of a key. Safe to read: it holds no secret material, only the prefix we show in the interface.';
comment on column public.api_keys.key_prefix is
  'The first 12 characters of the key, in plaintext. Indexed, and how the ingest function finds candidate rows before it verifies a hash.';
comment on column public.api_keys.revoked_at is
  'Revocation is a timestamp, never a delete. After an incident the question is which key was used, not which keys still work.';

create index if not exists api_keys_prefix_idx on public.api_keys (key_prefix);
create index if not exists api_keys_project_idx on public.api_keys (project_id, created_at desc);

create table if not exists public.api_key_secrets (
  api_key_id uuid primary key references public.api_keys (id) on delete cascade,
  key_hash bytea not null,
  salt bytea not null
);

comment on table public.api_key_secrets is
  'Row level security is enabled with zero policies, deliberately. There is no policy that could be written here that would be correct: no dashboard user, of any role, in any organization, has a legitimate reason to read key hashes. Only the service role reaches this table, from the ingest Edge Function.';

alter table public.api_keys enable row level security;
alter table public.api_key_secrets enable row level security;

-- ===========================================================================
-- 2. Policies
-- ===========================================================================

-- Anyone in the organization can see that a key exists and when it was last used. That is
-- operational information, and hiding it from a member helps nobody.
drop policy if exists api_keys_select on public.api_keys;
create policy api_keys_select on public.api_keys
  for select to authenticated
  using (authz.can_read_project(project_id));

-- Creating and revoking keys is owner and admin only. A member can read the dashboard and
-- cannot mint a credential that writes to it.
drop policy if exists api_keys_update on public.api_keys;
create policy api_keys_update on public.api_keys
  for update to authenticated
  using (authz.can_write_project(project_id, array['owner', 'admin']))
  with check (authz.can_write_project(project_id, array['owner', 'admin']));

-- There is no insert policy and no delete policy on api_keys.
--
-- Insert goes through api.create_api_key(), because the row and its secret have to be
-- written in one transaction and the caller must never choose the key material.
-- Delete does not exist at all: revocation sets a timestamp, so the audit trail survives.

-- api_key_secrets gets no policy of any kind. See the table comment.

-- ===========================================================================
-- 3. Key generation and verification
-- ===========================================================================

-- URL safe random text, so a key can be pasted into a header, a query string or a shell
-- command without escaping.
create or replace function jobs.random_key_material(p_bytes integer default 24)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(p_bytes), 'base64'), '+/=', '-_')
$$;

-- Issues a key and returns it in full, once.
--
-- The key is generated here rather than by the client, so that the only copy that ever
-- existed outside this transaction is the one returned to the person who asked for it.
create or replace function api.create_api_key(
  p_project_id uuid,
  p_name text,
  p_key_type text default 'public'
)
returns table (id uuid, api_key text, key_prefix text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid;
  v_secret text;
  v_full_key text;
  v_salt bytea;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_key_type not in ('public', 'secret') then
    raise exception 'key type must be public or secret' using errcode = '22023';
  end if;

  -- Security definer bypasses row level security, so the permission check that the policy
  -- would have done has to happen explicitly here. This is the failure mode of every
  -- security definer function and the reason this check is the first thing in the body.
  if not authz.can_write_project(p_project_id, array['owner', 'admin']) then
    raise exception 'you need to be an owner or admin of this project to create a key'
      using errcode = '42501';
  end if;

  select p.org_id into v_org_id from public.projects p where p.id = p_project_id;

  v_secret := jobs.random_key_material(24);
  v_full_key := case when p_key_type = 'public' then 'pk_live_' else 'sk_live_' end || v_secret;
  v_salt := extensions.gen_random_bytes(16);

  insert into public.api_keys (project_id, name, key_prefix, key_type, created_by)
  values (p_project_id, trim(p_name), left(v_full_key, 12), p_key_type, v_uid)
  returning public.api_keys.id into v_id;

  insert into public.api_key_secrets (api_key_id, key_hash, salt)
  values (v_id, sha256(v_salt || convert_to(v_full_key, 'utf8')), v_salt);

  perform jobs.write_audit(
    v_org_id, v_uid, 'api_key.created', 'api_key', v_id::text,
    jsonb_build_object('name', trim(p_name), 'key_type', p_key_type, 'prefix', left(v_full_key, 12))
  );

  -- The only time the full key is ever returned.
  return query select v_id, v_full_key, left(v_full_key, 12);
end;
$$;

grant execute on function api.create_api_key(uuid, text, text) to authenticated;

create or replace function api.revoke_api_key(p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_key public.api_keys;
  v_org_id uuid;
begin
  select * into v_key from public.api_keys k where k.id = p_key_id;
  if v_key.id is null then
    raise exception 'no such key' using errcode = '22023';
  end if;

  if not authz.can_write_project(v_key.project_id, array['owner', 'admin']) then
    raise exception 'you need to be an owner or admin of this project to revoke a key'
      using errcode = '42501';
  end if;

  -- Revoking twice is not an error. The end state is what was asked for.
  if v_key.revoked_at is not null then
    return;
  end if;

  update public.api_keys set revoked_at = now() where id = p_key_id;

  select p.org_id into v_org_id from public.projects p where p.id = v_key.project_id;
  perform jobs.write_audit(
    v_org_id, v_uid, 'api_key.revoked', 'api_key', p_key_id::text,
    jsonb_build_object('name', v_key.name, 'prefix', v_key.key_prefix)
  );
end;
$$;

grant execute on function api.revoke_api_key(uuid) to authenticated;

-- Verification, used by the ingest Edge Function under the service role.
--
-- Lives in jobs, so no client can call it. It returns the project on success and nothing
-- at all on failure: an unknown key and a revoked key are indistinguishable from the
-- caller's side, which is what stops this being an oracle for probing key validity.
create or replace function jobs.verify_api_key(p_presented_key text)
returns table (api_key_id uuid, project_id uuid, key_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.project_id, k.key_type
  from public.api_keys k
  join public.api_key_secrets s on s.api_key_id = k.id
  where k.key_prefix = left(p_presented_key, 12)
    and k.revoked_at is null
    and s.key_hash = sha256(s.salt || convert_to(p_presented_key, 'utf8'))
  limit 1
$$;

-- last_used_at is interesting but not worth a write on every request. The ingest function
-- calls this at most once a minute per key.
create or replace function jobs.touch_api_key(p_key_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.api_keys
  set last_used_at = now()
  where id = p_key_id
    and (last_used_at is null or last_used_at < now() - interval '1 minute')
$$;

-- ===========================================================================
-- 4. Grants
-- ===========================================================================

-- Select and update only. Insert is api.create_api_key(), and there is no delete.
grant select, update on public.api_keys to authenticated;

-- api_key_secrets: no grant to any client role, on top of RLS with no policies. Two
-- independent locks, because this is the one table where a mistake is unrecoverable.
revoke all on public.api_key_secrets from anon, authenticated;

revoke all on all functions in schema jobs from public, anon, authenticated;
