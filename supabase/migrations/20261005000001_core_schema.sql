-- Ledgerline core schema. Every tenant table carries org_id; RLS is added in the next migration.

create extension if not exists pgcrypto;

create type member_role as enum ('viewer', 'accountant', 'approver', 'admin', 'owner');
create type txn_kind as enum ('income', 'expense', 'transfer');
create type category_kind as enum ('income', 'expense');
create type approval_status as enum ('pending', 'approved', 'rejected');

-- ───────── tenancy ─────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  fiscal_year_start_month int not null default 1 check (fiscal_year_start_month between 1 and 12),
  require_approval boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create table memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on memberships(user_id);

-- ───────── reference data ─────────
create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  opening_balance numeric(15,2) not null default 0,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index bank_accounts_org_idx on bank_accounts(org_id);

create table business_units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind category_kind not null,
  default_bank_account_id uuid references bank_accounts(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, kind, name)
);

create table vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  position_title text not null default '',
  default_amount numeric(15,2) not null default 0 check (default_amount >= 0),
  is_owner_pay boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index employees_org_idx on employees(org_id);

-- ───────── payables & payroll ─────────
create table bills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete restrict,
  description text not null default '',
  amount_due numeric(15,2) not null check (amount_due > 0),
  bill_date date not null default current_date,
  due_date date,
  created_at timestamptz not null default now()
);
create index bills_org_due_idx on bills(org_id, due_date);

create table payroll_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2100),
  created_at timestamptz not null default now(),
  unique (org_id, year, month)
);

create table payroll_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete restrict,
  amount_due numeric(15,2) not null check (amount_due >= 0),
  unique (payroll_run_id, employee_id)
);
create index payroll_items_org_idx on payroll_items(org_id);

-- ───────── ledger ─────────
create table transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind txn_kind not null,
  amount numeric(15,2) not null check (amount > 0),
  date date not null default current_date,
  bank_account_id uuid not null references bank_accounts(id) on delete restrict,
  to_bank_account_id uuid references bank_accounts(id) on delete restrict,
  category_id uuid references categories(id) on delete restrict,
  business_unit_id uuid references business_units(id) on delete set null,
  bill_id uuid references bills(id) on delete restrict,
  payroll_item_id uuid references payroll_items(id) on delete restrict,
  description text not null default '',
  reference text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint transfer_needs_destination check (
    (kind = 'transfer' and to_bank_account_id is not null and to_bank_account_id <> bank_account_id and category_id is null)
    or (kind <> 'transfer' and to_bank_account_id is null and category_id is not null)
  ),
  constraint settlement_only_on_expense check (
    (bill_id is null and payroll_item_id is null) or kind = 'expense'
  ),
  constraint one_settlement_target check (bill_id is null or payroll_item_id is null)
);
create index transactions_org_date_idx on transactions(org_id, date desc) where deleted_at is null;
create index transactions_bill_idx on transactions(bill_id) where bill_id is not null;
create index transactions_payroll_idx on transactions(payroll_item_id) where payroll_item_id is not null;

create table pending_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  amount numeric(15,2) not null check (amount > 0),
  date date not null default current_date,
  bank_account_id uuid not null references bank_accounts(id) on delete restrict,
  category_id uuid not null references categories(id) on delete restrict,
  business_unit_id uuid references business_units(id) on delete set null,
  bill_id uuid references bills(id) on delete restrict,
  payroll_item_id uuid references payroll_items(id) on delete restrict,
  description text not null default '',
  reference text not null default '',
  urgency text not null default '',
  status approval_status not null default 'pending',
  requested_by uuid not null references auth.users(id),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text not null default '',
  transaction_id uuid references transactions(id),
  created_at timestamptz not null default now(),
  constraint one_settlement_target_pending check (bill_id is null or payroll_item_id is null)
);
create index pending_payments_org_status_idx on pending_payments(org_id, status);

create table audit_log (
  id bigint generated always as identity primary key,
  -- Deliberately no FK to organizations: audit history must survive (and never block) org deletion.
  org_id uuid,
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_org_idx on audit_log(org_id, created_at desc);

-- keep updated_at fresh
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger transactions_touch before update on transactions
  for each row execute function touch_updated_at();

-- new auth user -> profile row
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
