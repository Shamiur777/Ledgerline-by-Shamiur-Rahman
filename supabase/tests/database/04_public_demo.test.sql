begin;
create extension if not exists pgtap;
select * from no_plan();

-- Hermetic: a developer database may already hold a seeded demo company. Clear the flag inside this
-- (rolled-back) transaction so the test controls the demo state.
update organizations set is_demo = false;

insert into auth.users (id, email, aud, role, raw_user_meta_data, instance_id) values
  ('00000000-0000-0000-0000-0000000000a4', 'alice@demo.dev', 'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000f4', null, 'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000');

create function pg_temp.login(uid text, anon boolean) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anon)::text, true);
  set local role authenticated;
end $$;
create temp table kv (k text primary key, v text);
grant all on kv to authenticated;
create function pg_temp.kv(k text) returns text language sql as $$ select v from kv where kv.k = $1 $$;

-- No demo configured yet
select pg_temp.login('00000000-0000-0000-0000-0000000000f4', true);
select throws_ok($$select join_demo()$$, 'P0002', null, 'join_demo fails clearly when no demo company exists');

-- A real user creates a company; the platform owner (postgres) flags it as the demo.
select pg_temp.login('00000000-0000-0000-0000-0000000000a4', false);
insert into kv select 'org', create_organization('Demo Co')::text;
insert into transactions(org_id, kind, amount, bank_account_id, category_id)
  select pg_temp.kv('org')::uuid, 'income', 10, (select id from bank_accounts where org_id = pg_temp.kv('org')::uuid limit 1),
         (select id from categories where org_id = pg_temp.kv('org')::uuid and kind = 'income' limit 1);

-- Clients cannot set the demo flag, even as owner of the company.
select throws_ok($$update organizations set is_demo = true where id = pg_temp.kv('org')::uuid$$, '42501', null, 'owners cannot flag their own company as the demo');
update organizations set name = 'Renamed Co' where id = pg_temp.kv('org')::uuid;
select is((select name from organizations where id = pg_temp.kv('org')::uuid), 'Renamed Co', 'owners can still edit ordinary settings');

reset role;
update organizations set is_demo = true where id = pg_temp.kv('org')::uuid;
insert into kv select 'slug', slug from organizations where id = pg_temp.kv('org')::uuid;
select throws_ok($$insert into organizations(name, slug, is_demo) values ('Second Demo', 'second-demo', true)$$, '23505', null, 'only one demo company can exist');

-- Real users cannot walk into the demo
select pg_temp.login('00000000-0000-0000-0000-0000000000a4', false);
select throws_ok($$select join_demo()$$, '42501', null, 'non-anonymous users cannot use join_demo');

-- Anonymous visitor
select pg_temp.login('00000000-0000-0000-0000-0000000000f4', true);
select is((select join_demo()), pg_temp.kv('slug'), 'anonymous visitor joins and learns the demo slug');
select is((select role::text from memberships where user_id = '00000000-0000-0000-0000-0000000000f4'), 'viewer', 'visitor is a viewer');
select lives_ok($$select join_demo()$$, 'joining twice is harmless');
select is((select count(*)::int from transactions), 1, 'visitor can read demo data');
select throws_ok(
  $$insert into transactions(org_id, kind, amount, bank_account_id, category_id)
    select org_id, 'income', 1, bank_account_id, category_id from transactions limit 1$$, '42501', null, 'visitor cannot write transactions');
select throws_ok($$insert into bank_accounts(org_id, name) values (pg_temp.kv('org')::uuid, 'Evil')$$, '42501', null, 'visitor cannot add accounts');
select throws_ok($$select create_invitation(pg_temp.kv('org')::uuid, 'x@demo.dev', 'viewer')$$, '42501', null, 'visitor cannot invite');
select throws_ok($$select create_organization('Spam Co')$$, '42501', null, 'visitor cannot create companies');
select is((select count(*)::int from audit_log), 0, 'visitor cannot read the audit log');

-- Company cap for normal accounts
select pg_temp.login('00000000-0000-0000-0000-0000000000a4', false);
select lives_ok($$select create_organization('Cap 2')$$, 'second company');
select lives_ok($$select create_organization('Cap 3')$$, 'third company');
select lives_ok($$select create_organization('Cap 4')$$, 'fourth company');
select lives_ok($$select create_organization('Cap 5')$$, 'fifth company');
select throws_ok($$select create_organization('Cap 6')$$, '54000', null, 'sixth company is refused');

select * from finish();
rollback;
