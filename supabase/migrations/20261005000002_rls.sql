-- Row-level security: tenant isolation is enforced here, not in application code.

create function role_rank(r member_role) returns int
language sql immutable as $$
  select case r when 'viewer' then 1 when 'accountant' then 2 when 'approver' then 3
                when 'admin' then 4 when 'owner' then 5 end
$$;

-- True when the calling user belongs to p_org with at least p_min role.
-- SECURITY DEFINER so it can read memberships without recursing into its own RLS policy.
create function is_member(p_org uuid, p_min member_role default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = p_org and m.user_id = auth.uid()
      and role_rank(m.role) >= role_rank(p_min)
  )
$$;
revoke all on function is_member(uuid, member_role) from public;
grant execute on function is_member(uuid, member_role) to authenticated;

-- Enable RLS everywhere.
alter table organizations   enable row level security;
alter table profiles        enable row level security;
alter table memberships     enable row level security;
alter table bank_accounts   enable row level security;
alter table business_units  enable row level security;
alter table categories      enable row level security;
alter table vendors         enable row level security;
alter table departments     enable row level security;
alter table employees       enable row level security;
alter table bills           enable row level security;
alter table payroll_runs    enable row level security;
alter table payroll_items   enable row level security;
alter table transactions    enable row level security;
alter table pending_payments enable row level security;
alter table audit_log       enable row level security;

-- organizations: members read; admins update; creation only via create_organization().
create policy org_select on organizations for select using (is_member(id));
create policy org_update on organizations for update using (is_member(id, 'admin')) with check (is_member(id, 'admin'));

-- profiles: self, plus people who share an org with you.
create policy profiles_select on profiles for select using (
  id = auth.uid() or exists (
    select 1 from memberships a join memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- memberships: members see their org's roster; admins manage; the owner row is immutable here.
create policy memberships_select on memberships for select using (is_member(org_id));
create policy memberships_insert on memberships for insert with check (is_member(org_id, 'admin') and role <> 'owner');
create policy memberships_update on memberships for update
  using (is_member(org_id, 'admin') and role <> 'owner')
  with check (is_member(org_id, 'admin') and role <> 'owner');
create policy memberships_delete on memberships for delete using (
  (is_member(org_id, 'admin') and role <> 'owner') or (user_id = auth.uid() and role <> 'owner')
);

-- reference data: members read, admins write.
do $$
declare t text;
begin
  foreach t in array array['bank_accounts','business_units','categories','vendors','departments','employees'] loop
    execute format('create policy %I_select on %I for select using (is_member(org_id))', t, t);
    execute format('create policy %I_insert on %I for insert with check (is_member(org_id, ''admin''))', t, t);
    execute format('create policy %I_update on %I for update using (is_member(org_id, ''admin'')) with check (is_member(org_id, ''admin''))', t, t);
    execute format('create policy %I_delete on %I for delete using (is_member(org_id, ''admin''))', t, t);
  end loop;
  -- ledger-adjacent data: accountants write.
  foreach t in array array['bills','payroll_runs','payroll_items','transactions'] loop
    execute format('create policy %I_select on %I for select using (is_member(org_id))', t, t);
    execute format('create policy %I_insert on %I for insert with check (is_member(org_id, ''accountant''))', t, t);
    execute format('create policy %I_update on %I for update using (is_member(org_id, ''accountant'')) with check (is_member(org_id, ''accountant''))', t, t);
  end loop;
end $$;
-- hard deletes: admins only (day-to-day removal is a soft delete via UPDATE).
create policy bills_delete on bills for delete using (is_member(org_id, 'admin'));
create policy payroll_runs_delete on payroll_runs for delete using (is_member(org_id, 'admin'));
create policy payroll_items_delete on payroll_items for delete using (is_member(org_id, 'accountant'));

-- pending payments: accountants request; decisions go through approve/reject functions only.
create policy pending_select on pending_payments for select using (is_member(org_id));
create policy pending_insert on pending_payments for insert
  with check (is_member(org_id, 'accountant') and requested_by = auth.uid() and status = 'pending');
create policy pending_cancel on pending_payments for delete
  using (status = 'pending' and (requested_by = auth.uid() or is_member(org_id, 'admin')));

-- audit log: admins read; nobody writes directly (triggers are SECURITY DEFINER).
create policy audit_select on audit_log for select using (is_member(org_id, 'admin'));

-- Defense in depth: forbid cross-tenant references (a row in org A pointing at org B's account).
create function assert_same_org(p_table text, p_id uuid, p_org uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  if p_id is null then return; end if;
  execute format('select org_id from %I where id = $1', p_table) into v_org using p_id;
  if v_org is distinct from p_org then
    raise exception 'cross-tenant reference to % rejected', p_table using errcode = '42501';
  end if;
end $$;
revoke all on function assert_same_org(text, uuid, uuid) from public;

create function enforce_same_org() returns trigger language plpgsql as $$
begin
  if tg_table_name in ('transactions', 'pending_payments') then
    perform assert_same_org('bank_accounts', new.bank_account_id, new.org_id);
    perform assert_same_org('categories', new.category_id, new.org_id);
    perform assert_same_org('business_units', new.business_unit_id, new.org_id);
    perform assert_same_org('bills', new.bill_id, new.org_id);
    perform assert_same_org('payroll_items', new.payroll_item_id, new.org_id);
    if tg_table_name = 'transactions' then
      perform assert_same_org('bank_accounts', new.to_bank_account_id, new.org_id);
    end if;
  elsif tg_table_name = 'bills' then
    perform assert_same_org('vendors', new.vendor_id, new.org_id);
  elsif tg_table_name = 'employees' then
    perform assert_same_org('departments', new.department_id, new.org_id);
  elsif tg_table_name = 'payroll_items' then
    perform assert_same_org('payroll_runs', new.payroll_run_id, new.org_id);
    perform assert_same_org('employees', new.employee_id, new.org_id);
  elsif tg_table_name = 'categories' then
    perform assert_same_org('bank_accounts', new.default_bank_account_id, new.org_id);
  end if;
  return new;
end $$;

create trigger same_org_transactions before insert or update on transactions for each row execute function enforce_same_org();
create trigger same_org_pending before insert or update on pending_payments for each row execute function enforce_same_org();
create trigger same_org_bills before insert or update on bills for each row execute function enforce_same_org();
create trigger same_org_employees before insert or update on employees for each row execute function enforce_same_org();
create trigger same_org_payroll_items before insert or update on payroll_items for each row execute function enforce_same_org();
create trigger same_org_categories before insert or update on categories for each row execute function enforce_same_org();
