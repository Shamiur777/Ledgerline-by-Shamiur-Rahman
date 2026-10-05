begin;
create extension if not exists pgtap;
select * from no_plan();

-- Users: alice (owner), dan (accountant), eve (approver).
insert into auth.users (id, email, aud, role, raw_user_meta_data, instance_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@rules.dev', 'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000d1', 'dan@rules.dev',   'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000e1', 'eve@rules.dev',   'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000');

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;

-- Unauthenticated callers cannot create organizations.
select throws_ok($$select create_organization('Nope')$$, '28000', null, 'create_organization requires authentication');

-- Alice creates the org, adds dan and eve, and a savings account.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
insert into ids select 'org', create_organization('Rules Co', 'USD', 1, true);
insert into ids select 'org2', create_organization('Rules Co', 'USD', 1, true);
select isnt((select slug from organizations where id = pg_temp.id('org')), (select slug from organizations where id = pg_temp.id('org2')), 'same-named companies get distinct slugs');

select add_member_by_email(pg_temp.id('org'), 'dan@rules.dev', 'accountant');
select add_member_by_email(pg_temp.id('org'), 'eve@rules.dev', 'approver');
insert into ids select 'main', id from bank_accounts where org_id = pg_temp.id('org') and name = 'Main Account';
with r as (insert into bank_accounts(org_id, name) values (pg_temp.id('org'), 'Savings') returning id) insert into ids select 'sav', id from r;
insert into ids select 'inc', id from categories where org_id = pg_temp.id('org') and kind = 'income' limit 1;
insert into ids select 'exp', id from categories where org_id = pg_temp.id('org') and kind = 'expense' limit 1;

-- Balances ------------------------------------------------------------------
insert into transactions(org_id, kind, amount, bank_account_id, category_id) values (pg_temp.id('org'), 'income', 1000, pg_temp.id('main'), pg_temp.id('inc'));
with r as (insert into transactions(org_id, kind, amount, bank_account_id, category_id) values (pg_temp.id('org'), 'expense', 300, pg_temp.id('main'), pg_temp.id('exp')) returning id) insert into ids select 'spend', id from r;
select is((select balance from account_balances(pg_temp.id('org')) where name = 'Main Account'), 700.00::numeric, 'income and expense move the balance');

insert into transactions(org_id, kind, amount, bank_account_id, to_bank_account_id) values (pg_temp.id('org'), 'transfer', 200, pg_temp.id('main'), pg_temp.id('sav'));
select is((select balance from account_balances(pg_temp.id('org')) where name = 'Main Account'), 500.00::numeric, 'transfer debits the source');
select is((select balance from account_balances(pg_temp.id('org')) where name = 'Savings'), 200.00::numeric, 'transfer credits the destination');

update transactions set deleted_at = now() where id = pg_temp.id('spend');
select is((select balance from account_balances(pg_temp.id('org')) where name = 'Main Account'), 800.00::numeric, 'soft-deleted transactions are excluded from balances');

-- Constraints ---------------------------------------------------------------
select throws_ok(
  $$insert into transactions(org_id, kind, amount, bank_account_id, to_bank_account_id, category_id)
    values (pg_temp.id('org'), 'transfer', 1, pg_temp.id('main'), pg_temp.id('sav'), pg_temp.id('exp'))$$,
  '23514', null, 'a transfer cannot carry a category');
select throws_ok(
  $$insert into transactions(org_id, kind, amount, bank_account_id, category_id) values (pg_temp.id('org'), 'income', 0, pg_temp.id('main'), pg_temp.id('inc'))$$,
  '23514', null, 'amount must be positive');

-- Bills & overpayment -------------------------------------------------------
insert into vendors(org_id, name) values (pg_temp.id('org'), 'Acme Supplies');
with r as (insert into bills(org_id, vendor_id, amount_due, due_date) values (pg_temp.id('org'), (select id from vendors where name = 'Acme Supplies'), 500, current_date + 3) returning id) insert into ids select 'bill', id from r;
select lives_ok($$insert into transactions(org_id, kind, amount, bank_account_id, category_id, bill_id) values (pg_temp.id('org'), 'expense', 300, pg_temp.id('main'), pg_temp.id('exp'), pg_temp.id('bill'))$$, 'partial bill payment is allowed');
select throws_ok($$insert into transactions(org_id, kind, amount, bank_account_id, category_id, bill_id) values (pg_temp.id('org'), 'expense', 300, pg_temp.id('main'), pg_temp.id('exp'), pg_temp.id('bill'))$$, '23514', null, 'overpaying a bill is rejected');
select is((select outstanding from bills_outstanding(pg_temp.id('org')) where bill_id = pg_temp.id('bill')), 200.00::numeric, 'outstanding reflects payments');
select is((select payables from balance_sheet(pg_temp.id('org'))), 200.00::numeric, 'balance sheet payables match');
select is((select count(*)::int from upcoming_bills(pg_temp.id('org'), 10)), 1, 'bill due in 3 days appears in upcoming bills');

-- Editing a payment upward past the bill is also rejected (UPDATE path).
insert into ids select 'p1', (select id from transactions where bill_id = pg_temp.id('bill') limit 1);
select throws_ok($$update transactions set amount = 600 where id = pg_temp.id('p1')$$, '23514', null, 'raising a payment above the bill is rejected');

-- A deleted payment cannot be resurrected into an overpayment.
with r as (insert into bills(org_id, vendor_id, amount_due) values (pg_temp.id('org'), (select id from vendors where name = 'Acme Supplies'), 100) returning id) insert into ids select 'bill2', id from r;
with r as (insert into transactions(org_id, kind, amount, bank_account_id, category_id, bill_id) values (pg_temp.id('org'), 'expense', 100, pg_temp.id('main'), pg_temp.id('exp'), pg_temp.id('bill2')) returning id) insert into ids select 'b2p1', id from r;
update transactions set deleted_at = now() where id = pg_temp.id('b2p1');
insert into transactions(org_id, kind, amount, bank_account_id, category_id, bill_id) values (pg_temp.id('org'), 'expense', 100, pg_temp.id('main'), pg_temp.id('exp'), pg_temp.id('bill2'));
select throws_ok($$update transactions set deleted_at = null where id = pg_temp.id('b2p1')$$, '23514', null, 'restoring a deleted payment cannot overpay');

-- Payroll -------------------------------------------------------------------
insert into employees(org_id, name, default_amount) values (pg_temp.id('org'), 'Pat Worker', 1000);
with r as (insert into payroll_runs(org_id, year, month) values (pg_temp.id('org'), 2026, 10) returning id) insert into ids select 'run', id from r;
with r as (insert into payroll_items(org_id, payroll_run_id, employee_id, amount_due) values (pg_temp.id('org'), pg_temp.id('run'), (select id from employees where name = 'Pat Worker'), 1000) returning id) insert into ids select 'item', id from r;
select lives_ok($$insert into transactions(org_id, kind, amount, bank_account_id, category_id, payroll_item_id) values (pg_temp.id('org'), 'expense', 600, pg_temp.id('main'), pg_temp.id('exp'), pg_temp.id('item'))$$, 'partial salary payment');
select throws_ok($$insert into transactions(org_id, kind, amount, bank_account_id, category_id, payroll_item_id) values (pg_temp.id('org'), 'expense', 500, pg_temp.id('main'), pg_temp.id('exp'), pg_temp.id('item'))$$, '23514', null, 'overpaying a salary is rejected');
select is((select remaining from payroll_outstanding(pg_temp.id('org')) where payroll_item_id = pg_temp.id('item')), 400.00::numeric, 'payroll remaining is correct');

-- Approvals -----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
with r as (
  insert into pending_payments(org_id, amount, bank_account_id, category_id, bill_id, requested_by, description)
  values (pg_temp.id('org'), 100, pg_temp.id('main'), pg_temp.id('exp'), pg_temp.id('bill'), '00000000-0000-0000-0000-0000000000d1', 'Pay Acme') returning id) insert into ids select 'pend', id from r;
select throws_ok($$insert into pending_payments(org_id, amount, bank_account_id, category_id, bill_id, requested_by) values (pg_temp.id('org'), 150, pg_temp.id('main'), pg_temp.id('exp'), pg_temp.id('bill'), '00000000-0000-0000-0000-0000000000d1')$$, '23514', null, 'pending requests count toward the overpayment limit');
select throws_ok($$insert into pending_payments(org_id, amount, bank_account_id, category_id, requested_by) values (pg_temp.id('org'), 5, pg_temp.id('main'), pg_temp.id('exp'), '00000000-0000-0000-0000-0000000000a1')$$, '42501', null, 'a requester cannot impersonate someone else');
select throws_ok($$select approve_pending_payment(pg_temp.id('pend'))$$, '42501', null, 'an accountant cannot approve');

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
insert into ids select 'txn', approve_pending_payment(pg_temp.id('pend'));
select is((select status::text from pending_payments where id = pg_temp.id('pend')), 'approved', 'approval marks the request approved');
select is((select amount from transactions where id = pg_temp.id('txn')), 100.00::numeric, 'approval posts a transaction for the same amount');
select is((select count(*)::int from transactions where bill_id = pg_temp.id('bill') and deleted_at is null), 2, 'the posted transaction is linked to the bill');
select throws_ok($$select approve_pending_payment(pg_temp.id('pend'))$$, 'P0001', null, 'a request cannot be approved twice');

-- Four-eyes: eve requests, eve cannot approve her own while another approver (alice) exists.
with r as (
  insert into pending_payments(org_id, amount, bank_account_id, category_id, requested_by, description)
  values (pg_temp.id('org'), 10, pg_temp.id('main'), pg_temp.id('exp'), '00000000-0000-0000-0000-0000000000e1', 'Self request') returning id) insert into ids select 'own', id from r;
select throws_ok($$select approve_pending_payment(pg_temp.id('own'))$$, '42501', null, 'approvers cannot approve their own request');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select approve_pending_payment(pg_temp.id('own'))$$, 'a different approver can approve it');

-- Rejection
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
with r as (
  insert into pending_payments(org_id, amount, bank_account_id, category_id, requested_by) values (pg_temp.id('org'), 1, pg_temp.id('main'), pg_temp.id('exp'), '00000000-0000-0000-0000-0000000000d1') returning id) insert into ids select 'rej', id from r;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$select reject_pending_payment(pg_temp.id('rej'), 'not needed')$$, 'approver can reject');
select is((select status::text || ':' || decision_note from pending_payments where id = pg_temp.id('rej')), 'rejected:not needed', 'rejection records status and reason');

-- Audit trail ---------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select cmp_ok((select count(*)::int from audit_log where org_id = pg_temp.id('org') and entity = 'transactions' and action = 'insert'), '>=', 5, 'ledger inserts are audited by triggers');
select ok(exists (select 1 from audit_log where org_id = pg_temp.id('org') and entity = 'pending_payments' and action = 'update'), 'approvals are audited');
select ok(exists (select 1 from audit_log where org_id = pg_temp.id('org') and entity = 'transactions' and action = 'update' and diff->'old'->>'deleted_at' is null and diff->'new'->>'deleted_at' is not null), 'soft deletes are audited with before/after');

select * from finish();
rollback;
