-- Reporting functions. SECURITY INVOKER (the default) so RLS applies to the caller.
-- Each also checks membership explicitly so a non-member gets an error rather than an empty set.

create function assert_member(p_org uuid) returns void
language plpgsql stable as $$
begin
  if not is_member(p_org) then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-- Balance per account as of a date: opening + income - expense +/- transfers.
create function account_balances(p_org uuid, p_as_of date default current_date)
returns table (bank_account_id uuid, name text, balance numeric)
language plpgsql stable as $$
begin
  perform assert_member(p_org);
  return query
  select b.id, b.name,
    b.opening_balance + coalesce((
      select sum(case
        when t.kind = 'income'   and t.bank_account_id = b.id then t.amount
        when t.kind = 'expense'  and t.bank_account_id = b.id then -t.amount
        when t.kind = 'transfer' and t.bank_account_id = b.id then -t.amount
        when t.kind = 'transfer' and t.to_bank_account_id = b.id then t.amount
        else 0 end)
      from transactions t
      where t.org_id = p_org and t.deleted_at is null and t.date <= p_as_of
        and (t.bank_account_id = b.id or t.to_bank_account_id = b.id)
    ), 0) as balance
  from bank_accounts b
  where b.org_id = p_org and not b.archived
  order by b.sort_order, b.name;
end $$;

create function monthly_totals(p_org uuid, p_from date, p_to date)
returns table (month date, income numeric, expense numeric)
language plpgsql stable as $$
begin
  perform assert_member(p_org);
  return query
  select m::date,
    coalesce(sum(t.amount) filter (where t.kind = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.kind = 'expense'), 0)
  from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') m
  left join transactions t
    on t.org_id = p_org and t.deleted_at is null and t.kind <> 'transfer'
   and t.date >= m::date and t.date < (m + interval '1 month')::date
   and t.date between p_from and p_to
  group by m order by m;
end $$;

create function pnl_by_category(p_org uuid, p_from date, p_to date)
returns table (category_id uuid, name text, kind category_kind, total numeric)
language plpgsql stable as $$
begin
  perform assert_member(p_org);
  return query
  select c.id, c.name, c.kind, coalesce(sum(t.amount), 0)
  from categories c
  left join transactions t on t.category_id = c.id and t.deleted_at is null and t.date between p_from and p_to
  where c.org_id = p_org
  group by c.id, c.name, c.kind
  having coalesce(sum(t.amount), 0) > 0
  order by c.kind desc, 4 desc;
end $$;

-- Bills outstanding (amount due minus non-deleted payments).
create function bills_outstanding(p_org uuid)
returns table (bill_id uuid, vendor_name text, description text, amount_due numeric, paid numeric,
               outstanding numeric, bill_date date, due_date date)
language plpgsql stable as $$
begin
  perform assert_member(p_org);
  return query
  select b.id, v.name, b.description, b.amount_due,
         coalesce(sum(t.amount), 0), b.amount_due - coalesce(sum(t.amount), 0), b.bill_date, b.due_date
  from bills b
  join vendors v on v.id = b.vendor_id
  left join transactions t on t.bill_id = b.id and t.deleted_at is null
  where b.org_id = p_org
  group by b.id, v.name
  order by b.due_date nulls first, b.bill_date;
end $$;

create function upcoming_bills(p_org uuid, p_days int default 10)
returns table (bill_id uuid, vendor_name text, outstanding numeric, due_date date, days_left int)
language plpgsql stable as $$
begin
  perform assert_member(p_org);
  return query
  select o.bill_id, o.vendor_name, o.outstanding, o.due_date, (o.due_date - current_date)::int
  from bills_outstanding(p_org) o
  where o.outstanding > 0 and o.due_date is not null and o.due_date <= current_date + p_days
  order by o.due_date;
end $$;

-- Payroll outstanding for every run, per employee.
create function payroll_outstanding(p_org uuid)
returns table (payroll_item_id uuid, run_year int, run_month int, employee_id uuid, employee_name text,
               is_owner_pay boolean, amount_due numeric, paid numeric, remaining numeric)
language plpgsql stable as $$
begin
  perform assert_member(p_org);
  return query
  select i.id, r.year, r.month, e.id, e.name, e.is_owner_pay, i.amount_due,
         coalesce(sum(t.amount), 0), i.amount_due - coalesce(sum(t.amount), 0)
  from payroll_items i
  join payroll_runs r on r.id = i.payroll_run_id
  join employees e on e.id = i.employee_id
  left join transactions t on t.payroll_item_id = i.id and t.deleted_at is null
  where i.org_id = p_org
  group by i.id, r.year, r.month, e.id
  order by r.year desc, r.month desc, e.name;
end $$;

-- Simplified balance sheet: assets = cash; liabilities = unpaid bills + unpaid payroll; equity = difference.
create function balance_sheet(p_org uuid, p_as_of date default current_date)
returns table (cash numeric, payables numeric, payroll_due numeric, equity numeric)
language plpgsql stable as $$
declare v_cash numeric; v_pay numeric; v_payroll numeric;
begin
  perform assert_member(p_org);
  select coalesce(sum(balance), 0) into v_cash from account_balances(p_org, p_as_of);
  select coalesce(sum(b.amount_due - coalesce((select sum(t.amount) from transactions t
           where t.bill_id = b.id and t.deleted_at is null and t.date <= p_as_of), 0)), 0)
    into v_pay from bills b where b.org_id = p_org and b.bill_date <= p_as_of;
  select coalesce(sum(i.amount_due - coalesce((select sum(t.amount) from transactions t
           where t.payroll_item_id = i.id and t.deleted_at is null and t.date <= p_as_of), 0)), 0)
    into v_payroll from payroll_items i join payroll_runs r on r.id = i.payroll_run_id
    where i.org_id = p_org and make_date(r.year, r.month, 1) <= p_as_of;
  return query select v_cash, v_pay, v_payroll, v_cash - v_pay - v_payroll;
end $$;
