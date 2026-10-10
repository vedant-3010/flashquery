-- Row-level security for sharing (F-SEC-07): what an owner, a viewer, an editor, a stranger and an
-- anonymous link visitor can each read and change. Runs against the local Supabase:
-- `npx supabase test db` (docs/DEPLOY.md). Everything rolls back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- ---- People (created as the superuser; the trigger gives each a profile) ----

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'olivia@example.com', now(), '{"full_name": "Olivia Owner"}'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'vera@example.com', now(), '{"full_name": "Vera Viewer"}'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'ed@example.com', now(), '{"full_name": "Ed Editor"}'),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'sam@example.com', now(), '{"full_name": "Sam Stranger"}');

create function pg_temp.act_as(person uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', person, 'role', 'authenticated')::text, true)
$$;

-- How many rows a statement changed, as the current role (row-level security decides).
create function pg_temp.affected(statement text) returns integer language plpgsql as $$
declare
  changed integer;
begin
  execute statement;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- ---- The owner ----

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

select lives_ok(
  $$ insert into public.dashboards (id, name, doc)
     values ('00000000-0000-0000-0000-00000000d001', 'Sales review', '{"tiles": []}') $$,
  'an owner saves a dashboard'
);
select is((select count(*)::int from public.dashboards), 1, 'the owner reads it');
select lives_ok(
  $$ insert into public.dashboards (name, doc) values ('Read back', '{}') returning id, version $$,
  'an owner''s save reads back its id and version, as the app does'
);
delete from public.dashboards where name = 'Read back';
select throws_ok(
  $$ insert into public.dashboards (name, doc, owner_id)
     values ('Not mine', '{}', '00000000-0000-0000-0000-0000000000d4') $$,
  '42501', null, 'nobody saves a dashboard in someone else''s name'
);
select lives_ok(
  $$ insert into public.dashboard_invites (dashboard_id, email, role) values
     ('00000000-0000-0000-0000-00000000d001', 'vera@example.com', 'viewer'),
     ('00000000-0000-0000-0000-00000000d001', 'ed@example.com', 'editor') $$,
  'the owner invites people by email'
);
select lives_ok(
  $$ insert into public.share_links (slug, dashboard_id)
     values ('test-link-0123456789abcd', '00000000-0000-0000-0000-00000000d001') $$,
  'the owner makes a view-only link'
);
select lives_ok(
  $$ update public.dashboards set doc = '{"tiles": [], "saved": 2}'
     where id = '00000000-0000-0000-0000-00000000d001' $$,
  'the owner saves again'
);
select is(
  (select version from public.dashboards where id = '00000000-0000-0000-0000-00000000d001'), 2,
  'each save bumps the version'
);
select throws_ok(
  $$ update public.dashboards set owner_id = '00000000-0000-0000-0000-0000000000d4' $$,
  '42501', null, 'the owner can''t be changed'
);
select is((select count(*)::int from public.share_links), 1, 'the owner reads their links');

-- ---- A stranger ----

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d4');

select is((select count(*)::int from public.dashboards), 0, 'a stranger reads no dashboards');
select is((select count(*)::int from public.dashboard_invites), 0, 'a stranger reads no invites');
select is((select count(*)::int from public.share_links), 0, 'a stranger reads no links');
select is((select count(*)::int from public.dashboard_members), 0, 'a stranger reads no memberships');
select is(
  pg_temp.affected($$ update public.dashboards set name = 'Hacked' $$), 0,
  'a stranger changes nothing'
);
select is(pg_temp.affected($$ delete from public.dashboards $$), 0, 'a stranger deletes nothing');
select is(
  (select count(*)::int from public.open_dashboard('00000000-0000-0000-0000-00000000d001')), 0,
  'a stranger can''t open it'
);
select throws_ok(
  $$ select * from public.dashboard_people('00000000-0000-0000-0000-00000000d001') $$,
  '42501', null, 'a stranger can''t see who it''s shared with'
);
select is(public.claim_invites(), 0, 'a stranger has no invites to claim');

-- ---- A viewer ----

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');

select is((select count(*)::int from public.dashboards), 0, 'an invite alone shows nothing');
select is(public.claim_invites(), 1, 'signing in turns the invite into a membership');
select is((select count(*)::int from public.dashboards), 1, 'a viewer reads the dashboard');
select is(
  (select role from public.open_dashboard('00000000-0000-0000-0000-00000000d001')), 'viewer',
  'opened as a viewer'
);
select is(
  (select owner_name from public.shared_with_me()), 'Olivia Owner',
  'it''s in "Shared with me", with the owner''s name'
);
select is(pg_temp.affected($$ update public.dashboards set doc = '{}' $$), 0, 'a viewer can''t save');
select is((select count(*)::int from public.share_links), 0, 'a viewer reads no links');
select is((select count(*)::int from public.dashboard_invites), 0, 'a viewer reads no invites');
select is((select count(*)::int from public.dashboard_members), 1, 'a viewer sees only their own membership');

-- ---- An editor ----

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c3');

select is(public.claim_invites(), 1, 'the editor''s invite is claimed');
select is(
  pg_temp.affected($$ update public.dashboards set doc = '{"tiles": [], "saved": 3}'
                      where id = '00000000-0000-0000-0000-00000000d001' and version = 2 $$), 1,
  'an editor saves, naming the version they read'
);
select is(
  pg_temp.affected($$ update public.dashboards set doc = '{"stale": true}'
                      where id = '00000000-0000-0000-0000-00000000d001' and version = 2 $$), 0,
  'a save from an older version changes nothing (the conflict check)'
);
select throws_ok(
  $$ insert into public.dashboard_invites (dashboard_id, email, role)
     values ('00000000-0000-0000-0000-00000000d001', 'friend@example.com', 'editor') $$,
  '42501', null, 'an editor can''t invite'
);
select is(pg_temp.affected($$ delete from public.dashboards $$), 0, 'an editor can''t delete the dashboard');

-- ---- The owner sees who it's shared with ----

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

select is(
  (select count(*)::int from public.dashboard_people('00000000-0000-0000-0000-00000000d001')
   where kind = 'member'), 2,
  'the owner sees both members'
);

-- ---- Someone with the link and no account ----

set local role anon;
select set_config('request.jwt.claims', '', true);

select is((select count(*)::int from public.dashboards), 0, 'anonymous visitors read no tables');
select is(
  (select owner_name from public.shared_dashboard('test-link-0123456789abcd')), 'Olivia Owner',
  'a live link opens the dashboard'
);
select throws_ok(
  $$ select * from public.open_dashboard('00000000-0000-0000-0000-00000000d001') $$,
  '42501', null, 'without the link, anonymous visitors open nothing'
);

reset role;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
update public.share_links set revoked_at = now() where slug = 'test-link-0123456789abcd';
insert into public.share_links (slug, dashboard_id, expires_at)
values ('test-link-expired-0123456', '00000000-0000-0000-0000-00000000d001', now() - interval '1 minute');

set local role anon;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from public.shared_dashboard('test-link-0123456789abcd')), 0,
  'a revoked link shows nothing'
);
select is(
  (select count(*)::int from public.shared_dashboard('test-link-expired-0123456')), 0,
  'an expired link shows nothing'
);

-- ---- Leaving, the size cap, deleting an account ----

reset role;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b2');
select is(
  pg_temp.affected($$ delete from public.dashboard_members
                      where user_id = '00000000-0000-0000-0000-0000000000c3' $$), 0,
  'a viewer can''t remove someone else'
);
select is(
  pg_temp.affected($$ delete from public.dashboard_members
                      where user_id = '00000000-0000-0000-0000-0000000000b2' $$), 1,
  'a viewer can leave'
);

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ insert into public.dashboards (name, doc)
     values ('Too big', jsonb_build_object('pad', repeat('x', 5300000))) $$,
  '23514', null, 'a dashboard over 5 MB is refused'
);

reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
select is(
  (select count(*)::int from public.dashboards where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  0,
  'deleting an account deletes its dashboards'
);

select * from finish();
rollback;
