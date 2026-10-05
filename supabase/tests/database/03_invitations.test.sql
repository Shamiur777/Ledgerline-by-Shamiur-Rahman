begin;
create extension if not exists pgtap;
select * from no_plan();

insert into auth.users (id, email, aud, role, raw_user_meta_data, instance_id) values
  ('00000000-0000-0000-0000-0000000000a2', 'alice@inv.dev',   'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000b2', 'bob@inv.dev',     'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c2', 'mallory@inv.dev', 'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000d2', 'dana@inv.dev',    'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000');

create function pg_temp.login(uid text, mail text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', mail)::text, true);
  set local role authenticated;
end $$;
create temp table kv (k text primary key, v text);
grant all on kv to authenticated;
create function pg_temp.kv(k text) returns text language sql as $$ select v from kv where kv.k = $1 $$;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'alice@inv.dev');
insert into kv select 'org', create_organization('Invite Co')::text;

-- Who may invite
select pg_temp.login('00000000-0000-0000-0000-0000000000c2', 'mallory@inv.dev');
select throws_ok($$select create_invitation(pg_temp.kv('org')::uuid, 'x@inv.dev', 'viewer')$$, '42501', null, 'non-members cannot invite');

select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'alice@inv.dev');
select throws_ok($$select create_invitation(pg_temp.kv('org')::uuid, 'x@inv.dev', 'owner')$$, '42501', null, 'nobody can be invited as owner');
select throws_ok($$select create_invitation(pg_temp.kv('org')::uuid, 'not-an-email', 'viewer')$$, '22023', null, 'malformed email is rejected');
select throws_ok($$select create_invitation(pg_temp.kv('org')::uuid, 'ALICE@inv.dev', 'viewer')$$, '23505', null, 'existing members (case-insensitive) cannot be invited');

insert into kv select 'bobtok', create_invitation(pg_temp.kv('org')::uuid, 'Bob@Inv.dev', 'accountant');
select is(length(pg_temp.kv('bobtok')), 64, 'token is 64 hex chars');
select is((select count(*)::int from invitations where token_hash = sha256(convert_to(pg_temp.kv('bobtok'), 'UTF8'))), 1, 'only the hash of the token is stored');
select is((select email from invitations limit 1), 'bob@inv.dev', 'email is normalised to lowercase');

-- Invitations cannot be forged or edited by clients
select throws_ok($$insert into invitations(org_id, email, role, token_hash) values (pg_temp.kv('org')::uuid, 'e@inv.dev', 'admin', '\x00')$$, '42501', null, 'clients cannot insert invitations directly');
update invitations set role = 'admin';
select is((select role::text from invitations limit 1), 'accountant', 'clients cannot edit invitations (e.g. escalate the role)');

-- Re-inviting replaces the open invitation
insert into kv select 'dana1', create_invitation(pg_temp.kv('org')::uuid, 'dana@inv.dev', 'viewer');
insert into kv select 'dana2', create_invitation(pg_temp.kv('org')::uuid, 'dana@inv.dev', 'viewer');
select is((select count(*)::int from invitations where email = 'dana@inv.dev'), 1, 're-inviting keeps a single open invitation');
select pg_temp.login('00000000-0000-0000-0000-0000000000d2', 'dana@inv.dev');
select throws_ok($$select accept_invitation(pg_temp.kv('dana1'))$$, '22023', null, 'the replaced token no longer works');

-- Acceptance rules
select pg_temp.login('00000000-0000-0000-0000-0000000000c2', 'mallory@inv.dev');
select throws_ok($$select accept_invitation(pg_temp.kv('bobtok'))$$, '42501', null, 'a different email cannot use someone else''s invitation');
select is((select count(*)::int from memberships where user_id = '00000000-0000-0000-0000-0000000000c2'), 0, 'mallory did not become a member');
select throws_ok($$select accept_invitation('deadbeef')$$, '22023', null, 'unknown tokens are rejected with the generic message');
select is((select count(*)::int from invitation_preview('deadbeef')), 0, 'preview reveals nothing for unknown tokens');

select pg_temp.login('00000000-0000-0000-0000-0000000000b2', 'bob@inv.dev');
select is((select org_name from invitation_preview(pg_temp.kv('bobtok'))), 'Invite Co', 'invitee can preview with a valid token');
select is((select accept_invitation(pg_temp.kv('bobtok')))::text, pg_temp.kv('org'), 'bob accepts and gets the org id');
select is((select role::text from memberships where user_id = '00000000-0000-0000-0000-0000000000b2'), 'accountant', 'bob has the invited role');
select throws_ok($$select accept_invitation(pg_temp.kv('bobtok'))$$, '22023', null, 'an invitation cannot be reused');
select is((select count(*)::int from invitations), 0, 'non-admins cannot read invitations');

-- Expiry
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'alice@inv.dev');
insert into kv select 'late', create_invitation(pg_temp.kv('org')::uuid, 'late@inv.dev', 'viewer');
reset role;
update invitations set expires_at = now() - interval '1 minute' where email = 'late@inv.dev';
insert into auth.users (id, email, aud, role, raw_user_meta_data, instance_id) values
  ('00000000-0000-0000-0000-0000000000e2', 'late@inv.dev', 'authenticated', 'authenticated', '{}', '00000000-0000-0000-0000-000000000000');
select pg_temp.login('00000000-0000-0000-0000-0000000000e2', 'late@inv.dev');
select throws_ok($$select accept_invitation(pg_temp.kv('late'))$$, '22023', null, 'expired invitations are rejected');

-- Admins can see and revoke open invitations
select pg_temp.login('00000000-0000-0000-0000-0000000000a2', 'alice@inv.dev');
select cmp_ok((select count(*)::int from invitations), '>=', 1, 'admins can list invitations');
delete from invitations where email = 'late@inv.dev';
select is((select count(*)::int from invitations where email = 'late@inv.dev'), 0, 'admins can revoke open invitations');

-- Unauthenticated
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$select accept_invitation('whatever')$$, '28000', null, 'accepting requires authentication');

select * from finish();
rollback;
