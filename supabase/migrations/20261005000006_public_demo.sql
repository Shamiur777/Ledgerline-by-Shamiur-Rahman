-- Public-demo support. Visitors sign in anonymously (a throwaway identity each) and are joined to the
-- demo company as read-only viewers. No shared credentials exist, so nobody can lock others out.

alter table organizations add column is_demo boolean not null default false;
-- At most one demo company.
create unique index one_demo_org on organizations ((true)) where is_demo;

-- Clients may edit settings but never the demo flag (or anything else not listed here).
revoke update on organizations from authenticated;
grant update (name, fiscal_year_start_month, require_approval) on organizations to authenticated;

-- Abuse limits on company creation: anonymous visitors cannot create companies, and any single
-- account is capped, so the public API cannot be used to fill the database.
create function enforce_org_limits() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'demo visitors cannot create companies; sign up for a real account' using errcode = '42501';
  end if;
  if (select count(*) from organizations where created_by = new.created_by) >= 5 then
    raise exception 'company limit reached for this account' using errcode = '54000';
  end if;
  return new;
end $$;
create trigger org_limits before insert on organizations
  for each row execute function enforce_org_limits();

-- Called right after signInAnonymously(): joins the caller to the demo company as a viewer.
create function join_demo() returns text
language plpgsql security definer set search_path = public as $$
declare v_org organizations%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'only anonymous demo visitors can join the demo' using errcode = '42501';
  end if;
  select * into v_org from organizations where is_demo;
  if not found then raise exception 'no demo company is configured' using errcode = 'P0002'; end if;
  insert into memberships(org_id, user_id, role) values (v_org.id, auth.uid(), 'viewer')
  on conflict (org_id, user_id) do nothing;
  return v_org.slug;
end $$;
grant execute on function join_demo() to authenticated;
