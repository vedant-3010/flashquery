-- The encrypted workspace (M17, F-SYNC, F-SEC-07): each person reaches only their own vault,
-- records and file chunks; saves can't overwrite each other unseen; storage stays within the plan.
-- Runs against the local Supabase: `npx supabase test db`. Everything rolls back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'cleo@example.com', now(), '{"full_name": "Cleo Cloud"}'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'nosy@example.com', now(), '{"full_name": "Nosy Neighbour"}');

create function pg_temp.act_as(person uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', person, 'role', 'authenticated')::text, true)
$$;

create function pg_temp.affected(statement text) returns integer language plpgsql as $$
declare
  changed integer;
begin
  execute statement;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- ---- Cleo's vault and records ----

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');

select throws_ok(
  $$ select public.sync_put('global', 'projects', 0, 'eA==') $$,
  'P0001', 'vault_missing', 'nothing saves before the vault exists'
);
select throws_ok(
  $$ select public.vault_reserve('file-0000', 10, 1) $$,
  'P0001', 'vault_missing', 'no file space either'
);
select lives_ok(
  $$ insert into public.vaults (kdf, wrapped_key, recovery_wrapped_key)
     values ('{"alg": "PBKDF2-SHA256", "iterations": 600000, "salt": "c2FsdA=="}',
             '{"iv": "aXY=", "data": "d3JhcHBlZA=="}', '{"iv": "aXY=", "data": "cmVjb3Zlcnk="}') $$,
  'a person creates their vault'
);
select throws_ok(
  $$ update public.vaults set kdf = '{"alg": "PBKDF2-SHA256", "iterations": 1000, "salt": "eA=="}' $$,
  '23514', null, 'a weak key derivation is refused'
);
select is(public.sync_put('global', 'projects', 0, 'Y2lwaGVydGV4dA=='), 1, 'a new record saves as version 1');
select is(public.sync_put('global', 'projects', 1, 'bmV3ZXI='), 2, 'saving over the version it read');
select is(public.sync_put('global', 'projects', 1, 'c3RhbGU='), null, 'a stale save is refused (another device was first)');
select is(public.sync_put('global', 'projects', 0, 'ZHVw'), null, 'and so is a second "new" record');
select is((select ciphertext from public.sync_records where key = 'projects'), 'bmV3ZXI=', 'the newer save stays');
select is(public.sync_put('p_123', 'history', 0, 'aGlzdG9yeQ=='), 1, 'a project''s record');

-- The service's clock, not the client's: a pull cursor can't be fooled.
update public.sync_records set updated_at = '2000-01-01', ciphertext = ciphertext where key = 'history';
select ok(
  (select updated_at from public.sync_records where key = 'history') > now() - interval '1 minute',
  'updated_at is set by the service'
);
update public.sync_records set user_id = '00000000-0000-0000-0000-0000000000c2' where key = 'history';
select is(
  (select user_id from public.sync_records where key = 'history'),
  '00000000-0000-0000-0000-0000000000c1'::uuid, 'a record can''t be handed to someone else'
);

-- Files: reserve, then chunks within the reservation only.
select is(
  public.vault_reserve('file-0001', 9000000, 3) ->> 'ok', 'true', 'reserving a 9 MB file in 3 chunks'
);
select throws_ok(
  $$ select public.vault_reserve('file-0002', 9000000, 1) $$,
  '22023', null, 'its chunks must fit the size'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('vault', '00000000-0000-0000-0000-0000000000c1/file-0001/0') $$,
  'uploading a reserved chunk'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('vault', '00000000-0000-0000-0000-0000000000c1/file-0001/3') $$,
  '42501', null, 'not a chunk beyond the reservation'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('vault', '00000000-0000-0000-0000-0000000000c1/unreserved1/0') $$,
  '42501', null, 'not a chunk of an unreserved file'
);
select is(
  (public.vault_usage() ->> 'limit')::bigint, 500000000::bigint, 'Free stores up to 500 MB'
);
select is(
  public.vault_reserve('file-0003', 600000000, 144) ->> 'reason', 'storage_full',
  'past the plan''s limit, a file is refused'
);
select is(
  (select count(*)::int from public.vault_files), 1, 'and nothing was reserved for it'
);

-- ---- Someone else ----

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c2');

select is((select count(*)::int from public.vaults), 0, 'nobody reads another''s vault');
select is((select count(*)::int from public.sync_records), 0, 'or their records');
select is((select count(*)::int from public.vault_files), 0, 'or their files');
select is((select count(*)::int from storage.objects where bucket_id = 'vault'), 0, 'or their chunks');
select is(
  pg_temp.affected($$ delete from public.sync_records $$), 0, 'or deletes them'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('vault', '00000000-0000-0000-0000-0000000000c1/file-0001/1') $$,
  '42501', null, 'or uploads into their folder'
);
select throws_ok(
  $$ insert into public.vault_files (file_id, bytes, chunks) values ('sneaky-file', 1, 1) $$,
  '42501', null, 'space is reserved only through vault_reserve'
);

-- ---- Records count against the plan too ----

reset role;
update public.plans set storage_bytes = 9000100 where id = 'free';
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$ select public.sync_put('p_123', 'dashboards', 0, repeat('A', 1000)) $$,
  'P0001', 'storage_full', 'a record past the limit is refused'
);

-- ---- Deleting the account takes it all ----

reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c1';
select is(
  (select count(*)::int from public.vaults) + (select count(*)::int from public.sync_records)
    + (select count(*)::int from public.vault_files),
  0, 'deleting the account deletes the vault, records and reservations'
);

select * from finish();
rollback;
