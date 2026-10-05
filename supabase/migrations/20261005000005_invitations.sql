-- Invitations: admins mint a single-use, expiring link; only a SHA-256 hash of the token is stored,
-- so a database leak cannot be turned into working invite links. Acceptance is bound to the invited email.

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+$'),
  role member_role not null check (role <> 'owner'),
  token_hash bytea not null unique,
  invited_by uuid references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index invitations_one_open_per_email on invitations(org_id, email) where accepted_at is null;

alter table invitations enable row level security;
create policy invitations_select on invitations for select using (is_member(org_id, 'admin'));
create policy invitations_delete on invitations for delete using (is_member(org_id, 'admin') and accepted_at is null);
-- No insert/update policies: everything goes through the functions below.

create trigger audit_invitations after insert or update or delete on invitations
  for each row execute function write_audit();

-- Returns the raw token exactly once; callers build the link from it.
create function create_invitation(p_org uuid, p_email text, p_role member_role)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not is_member(p_org, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role = 'owner' then raise exception 'cannot invite as owner' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+$' then raise exception 'invalid email address' using errcode = '22023'; end if;
  if exists (
    select 1 from memberships m join auth.users u on u.id = m.user_id
    where m.org_id = p_org and lower(u.email) = v_email
  ) then raise exception '% is already a member', v_email using errcode = '23505'; end if;

  -- Re-inviting replaces any open invitation for the same address.
  delete from invitations where org_id = p_org and email = v_email and accepted_at is null;
  insert into invitations(org_id, email, role, token_hash, invited_by)
  values (p_org, v_email, p_role, sha256(convert_to(v_token, 'UTF8')), auth.uid());
  return v_token;
end $$;
grant execute on function create_invitation(uuid, text, member_role) to authenticated;

-- What an invitee may see before accepting: org name and role only, and only with a valid token.
create function invitation_preview(p_token text)
returns table (org_name text, role member_role, email text)
language sql stable security definer set search_path = public as $$
  select o.name, i.role, i.email
  from invitations i join organizations o on o.id = i.org_id
  where i.token_hash = sha256(convert_to(p_token, 'UTF8')) and i.accepted_at is null and i.expires_at > now()
$$;
grant execute on function invitation_preview(text) to authenticated;

create function accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv invitations%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into inv from invitations
   where token_hash = sha256(convert_to(p_token, 'UTF8')) and accepted_at is null and expires_at > now()
   for update;
  -- One generic message for unknown, used and expired tokens, so tokens can't be probed.
  if not found then raise exception 'this invitation is invalid or has expired' using errcode = '22023'; end if;
  if inv.email <> v_email then
    raise exception 'this invitation was sent to a different email address' using errcode = '42501';
  end if;

  insert into memberships(org_id, user_id, role) values (inv.org_id, auth.uid(), inv.role)
  on conflict (org_id, user_id) do update set role = excluded.role where memberships.role <> 'owner';
  update invitations set accepted_at = now() where id = inv.id;
  return inv.org_id;
end $$;
grant execute on function accept_invitation(text) to authenticated;
