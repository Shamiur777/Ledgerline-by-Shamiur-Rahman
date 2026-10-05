begin;
create extension if not exists pgtap;
select * from no_plan();

-- Fixtures: four users. alice owns org A, bob owns org B, cara is a viewer in A, dan an accountant in A.
insert into auth.users (id, email, aud, role, raw_user_meta_data, instance_id) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.dev', 'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.dev',   'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000000c', 'cara@test.dev',  'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000000d', 'dan@test.dev',   'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000');

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

-- Alice and Bob each create an organization through the public function.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids select 'orgA', create_organization('Org Alpha', 'USD', 1, true);
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into ids select 'orgB', create_organization('Org Beta', 'EUR', 1, true);

-- Alice adds cara (viewer) and dan (accountant).
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select add_member_by_email((select v from ids where k = 'orgA'), 'cara@test.dev', 'viewer');
select add_member_by_email((select v from ids where k = 'orgA'), 'dan@test.dev', 'accountant');

-- Alice records a transaction in A.
insert into transactions(org_id, kind, amount, bank_account_id, category_id, description)
select o.v, 'income', 100, (select id from bank_accounts where org_id = o.v limit 1),
       (select id from categories where org_id = o.v and kind = 'income' limit 1), 'secret-A'
from ids o where o.k = 'orgA';

-- 1-4: Bob cannot see any of org A's data.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from organizations), 1, 'bob sees only his own organization');
select is((select count(*)::int from transactions where description = 'secret-A'), 0, 'bob cannot read org A transactions');
select is((select count(*)::int from bank_accounts where org_id = (select v from ids where k = 'orgA')), 0, 'bob cannot read org A bank accounts');
select is((select count(*)::int from memberships where org_id = (select v from ids where k = 'orgA')), 0, 'bob cannot read org A roster');

-- 5-6: Bob cannot write into org A.
select throws_ok(
  $$insert into transactions(org_id, kind, amount, bank_account_id, category_id)
    select o.v, 'income', 1, (select id from bank_accounts where org_id = o.v limit 1),
           (select id from categories where org_id = o.v limit 1) from ids o where o.k = 'orgA'$$,
  '42501', null, 'bob cannot insert into org A');
update transactions set amount = 999 where description = 'secret-A';
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((select amount from transactions where description = 'secret-A'), 100.00::numeric, 'bob update touched nothing');

-- 7: cross-tenant references are rejected even by a member of both worlds.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$insert into transactions(org_id, kind, amount, bank_account_id, category_id)
    select b.v, 'income', 1, (select id from bank_accounts where org_id = a.v limit 1),
           (select id from categories where org_id = b.v limit 1)
    from ids a, ids b where a.k = 'orgA' and b.k = 'orgB'$$,
  '42501', null, 'cannot reference another tenant''s bank account');

-- 8-11: role ladder inside org A.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from transactions where description = 'secret-A'), 1, 'viewer can read');
select throws_ok(
  $$insert into transactions(org_id, kind, amount, bank_account_id, category_id)
    select o.v, 'income', 1, (select id from bank_accounts where org_id = o.v limit 1),
           (select id from categories where org_id = o.v limit 1) from ids o where o.k = 'orgA'$$,
  '42501', null, 'viewer cannot write transactions');
select throws_ok(
  $$insert into categories(org_id, name, kind) select v, 'X', 'expense' from ids where k = 'orgA'$$,
  '42501', null, 'viewer cannot write categories');
select is((select count(*)::int from audit_log), 0, 'viewer cannot read audit log');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select lives_ok(
  $$insert into transactions(org_id, kind, amount, bank_account_id, category_id)
    select o.v, 'expense', 5, (select id from bank_accounts where org_id = o.v limit 1),
           (select id from categories where org_id = o.v and kind = 'expense' limit 1) from ids o where o.k = 'orgA'$$,
  'accountant can write transactions');
select throws_ok(
  $$insert into categories(org_id, name, kind) select v, 'Y', 'expense' from ids where k = 'orgA'$$,
  '42501', null, 'accountant cannot manage categories');

-- 12-14: membership management.
select throws_ok(
  $$select add_member_by_email((select v from ids where k = 'orgA'), 'bob@test.dev', 'viewer')$$,
  '42501', null, 'accountant cannot add members');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$select add_member_by_email((select v from ids where k = 'orgA'), 'bob@test.dev', 'owner')$$,
  '42501', null, 'nobody can grant owner');
select is((select count(*)::int from audit_log where org_id = (select v from ids where k = 'orgA')) > 0, true, 'admin+ can read audit log');

-- 15-16: audit log is append-only for clients.
delete from audit_log;
select is((select count(*)::int from audit_log where org_id = (select v from ids where k = 'orgA')) > 0, true, 'audit log cannot be deleted by clients');
select throws_ok($$insert into audit_log(org_id, action, entity) select v, 'x', 'y' from ids where k = 'orgA'$$,
  '42501', null, 'audit log cannot be forged by clients');

-- 17: reports refuse non-members instead of returning empty data.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$select * from account_balances((select v from ids where k = 'orgA'))$$,
  '42501', null, 'report functions reject non-members');

-- 18: owner row is protected.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update memberships set role = 'viewer' where role = 'owner';
select is((select count(*)::int from memberships where role = 'owner'), 1, 'owner role cannot be demoted via update');

select * from finish();
rollback;
