-- Atomic business operations, integrity triggers, and the audit trail.

-- ───────── create_organization ─────────
create function create_organization(
  p_name text, p_currency char(3) default 'USD', p_fy_start int default 1, p_starter boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_slug text;
  v_base text;
  v_account uuid;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;

  v_base := trim(both '-' from lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')));
  if v_base = '' then v_base := 'org'; end if;
  v_slug := v_base;
  while exists (select 1 from organizations where slug = v_slug) loop
    v_slug := v_base || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 5);
  end loop;

  insert into organizations(name, slug, currency, fiscal_year_start_month, created_by)
  values (trim(p_name), v_slug, upper(p_currency), p_fy_start, v_uid)
  returning id into v_org;

  insert into memberships(org_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into bank_accounts(org_id, name, sort_order) values (v_org, 'Main Account', 0) returning id into v_account;
  insert into business_units(org_id, name) values (v_org, 'General');

  if p_starter then
    insert into categories(org_id, name, kind) values
      (v_org, 'Sales', 'income'), (v_org, 'Services', 'income'), (v_org, 'Interest', 'income'), (v_org, 'Other Income', 'income'),
      (v_org, 'Salaries', 'expense'), (v_org, 'Rent', 'expense'), (v_org, 'Utilities', 'expense'),
      (v_org, 'Software & Subscriptions', 'expense'), (v_org, 'Marketing', 'expense'),
      (v_org, 'Travel', 'expense'), (v_org, 'Professional Fees', 'expense'),
      (v_org, 'Vendor Payments', 'expense'), (v_org, 'Other Expense', 'expense');
  end if;
  return v_org;
end $$;
grant execute on function create_organization(text, char, int, boolean) to authenticated;

-- ───────── add a member by email (admin+) ─────────
create function add_member_by_email(p_org uuid, p_email text, p_role member_role)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not is_member(p_org, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role = 'owner' then raise exception 'cannot grant owner role' using errcode = '42501'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'no account found for % — ask them to sign up first', p_email; end if;
  insert into memberships(org_id, user_id, role) values (p_org, v_user, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role where memberships.role <> 'owner';
  return v_user;
end $$;
grant execute on function add_member_by_email(uuid, text, member_role) to authenticated;

-- ───────── outstanding helpers ─────────
create function bill_paid(p_bill uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from transactions where bill_id = p_bill and deleted_at is null
$$;
create function payroll_item_paid(p_item uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from transactions where payroll_item_id = p_item and deleted_at is null
$$;

-- ───────── overpayment guard ─────────
-- Locks the settled row so two concurrent payments cannot both slip under the limit.
create function prevent_overpayment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_due numeric; v_paid numeric; v_pending numeric := 0; v_self numeric := 0;
begin
  if tg_table_name = 'transactions' then
    if new.deleted_at is not null then return new; end if;
  end if;

  if new.bill_id is not null then
    select amount_due into v_due from bills where id = new.bill_id for update;
    v_paid := bill_paid(new.bill_id);
    if tg_table_name = 'transactions' then
      if tg_op = 'UPDATE' and old.deleted_at is null and old.bill_id = new.bill_id then v_self := old.amount; end if;
    else
      select coalesce(sum(amount), 0) into v_pending from pending_payments
        where bill_id = new.bill_id and status = 'pending';
    end if;
    if v_paid - v_self + v_pending + new.amount > v_due then
      raise exception 'payment exceeds amount due on bill (due %, already committed %)', v_due, v_paid - v_self + v_pending
        using errcode = '23514';
    end if;
  elsif new.payroll_item_id is not null then
    select amount_due into v_due from payroll_items where id = new.payroll_item_id for update;
    v_paid := payroll_item_paid(new.payroll_item_id);
    if tg_table_name = 'transactions' then
      if tg_op = 'UPDATE' and old.deleted_at is null and old.payroll_item_id = new.payroll_item_id then v_self := old.amount; end if;
    else
      select coalesce(sum(amount), 0) into v_pending from pending_payments
        where payroll_item_id = new.payroll_item_id and status = 'pending';
    end if;
    if v_paid - v_self + v_pending + new.amount > v_due then
      raise exception 'payment exceeds amount due on salary (due %, already committed %)', v_due, v_paid - v_self + v_pending
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger overpay_transactions before insert or update on transactions
  for each row execute function prevent_overpayment();
create trigger overpay_pending before insert on pending_payments
  for each row execute function prevent_overpayment();

-- ───────── approvals ─────────
create function approve_pending_payment(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  p pending_payments%rowtype;
  v_txn uuid;
  v_other_approvers int;
begin
  select * into p from pending_payments where id = p_id for update;
  if not found then raise exception 'pending payment not found'; end if;
  if not is_member(p.org_id, 'approver') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status <> 'pending' then raise exception 'payment already %', p.status; end if;

  -- Four-eyes rule: you cannot approve your own request unless you are the only approver.
  if p.requested_by = auth.uid() then
    select count(*) into v_other_approvers from memberships
      where org_id = p.org_id and user_id <> auth.uid() and role_rank(role) >= role_rank('approver');
    if v_other_approvers > 0 then
      raise exception 'you cannot approve your own request' using errcode = '42501';
    end if;
  end if;

  insert into transactions(org_id, kind, amount, date, bank_account_id, category_id, business_unit_id,
                           bill_id, payroll_item_id, description, reference, created_by)
  values (p.org_id, 'expense', p.amount, current_date, p.bank_account_id, p.category_id, p.business_unit_id,
          p.bill_id, p.payroll_item_id, p.description, p.reference, p.requested_by)
  returning id into v_txn;

  update pending_payments
     set status = 'approved', decided_by = auth.uid(), decided_at = now(), transaction_id = v_txn
   where id = p_id;
  return v_txn;
end $$;
grant execute on function approve_pending_payment(uuid) to authenticated;

create function reject_pending_payment(p_id uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare p pending_payments%rowtype;
begin
  select * into p from pending_payments where id = p_id for update;
  if not found then raise exception 'pending payment not found'; end if;
  if not is_member(p.org_id, 'approver') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p.status <> 'pending' then raise exception 'payment already %', p.status; end if;
  update pending_payments
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(p_note, '')
   where id = p_id;
end $$;
grant execute on function reject_pending_payment(uuid, text) to authenticated;

-- ───────── audit trail ─────────
create function write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_org uuid := coalesce((v_row->>'org_id')::uuid, case when tg_table_name = 'organizations' then (v_row->>'id')::uuid end);
begin
  insert into audit_log(org_id, user_id, action, entity, entity_id, diff)
  values (
    v_org, auth.uid(), lower(tg_op), tg_table_name,
    case when v_row ? 'id' then (v_row->>'id')::uuid end,
    case tg_op when 'INSERT' then jsonb_build_object('new', to_jsonb(new))
               when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
               else jsonb_build_object('old', to_jsonb(old)) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['organizations','memberships','bank_accounts','categories','vendors','bills',
                           'employees','payroll_runs','payroll_items','transactions','pending_payments'] loop
    execute format('create trigger audit_%I after insert or update or delete on %I for each row execute function write_audit()', t, t);
  end loop;
end $$;
