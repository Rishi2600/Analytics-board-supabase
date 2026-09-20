-- Migration 004 - reading and managing members.
--
-- Member emails live in auth.users, which no client role can read and should not be able
-- to: that table holds password hashes, recovery tokens and confirmation state for every
-- user of the platform. The dashboard still needs to show "who is in this organization",
-- so these functions return the two columns that are actually needed and nothing else.

create or replace function api.list_org_members(p_org_id uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Security definer means row level security is bypassed, so the membership check that a
  -- policy would have performed has to be explicit and has to come first.
  if not (p_org_id = any (authz.current_user_org_ids())) then
    raise exception 'you are not a member of this organization' using errcode = '42501';
  end if;

  return query
    select m.user_id, u.email::text, m.role, m.created_at
    from public.org_members m
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org_id
    order by m.created_at;
end;
$$;

grant execute on function api.list_org_members(uuid) to authenticated;

-- Creates an invite and returns the token once.
--
-- Same shape as an API key: the token is generated here, only its hash is stored, and the
-- caller gets the single readable copy. A leak of org_invites hands nobody a way in.
create or replace function api.create_invite(p_org_id uuid, p_email text, p_role text)
returns table (invite_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_token text;
  v_id uuid;
begin
  if not authz.has_org_role(p_org_id, array['owner', 'admin']) then
    raise exception 'you need to be an owner or admin to invite people' using errcode = '42501';
  end if;

  if p_role not in ('admin', 'member', 'viewer') then
    raise exception 'an invite cannot grant ownership' using errcode = '22023';
  end if;

  v_token := jobs.random_key_material(24);

  insert into public.org_invites (org_id, email, role, token_hash, expires_at, created_by)
  values (
    p_org_id,
    lower(trim(p_email)),
    p_role,
    sha256(convert_to(v_token, 'utf8')),
    now() + interval '7 days',
    v_uid
  )
  returning id into v_id;

  perform jobs.write_audit(
    p_org_id, v_uid, 'member.invited', 'invite', v_id::text,
    jsonb_build_object('email', lower(trim(p_email)), 'role', p_role)
  );

  return query select v_id, v_token;
end;
$$;

grant execute on function api.create_invite(uuid, text, text) to authenticated;
