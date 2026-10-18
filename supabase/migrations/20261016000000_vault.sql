-- The encrypted workspace (M17, F-SYNC-01…06, PRD D123): a signed-in user's projects, questions,
-- dashboards, notes and files, saved to their account so they can work on any device. Everything
-- here is encrypted in the browser first (src/lib/vault.ts): these tables and the storage bucket
-- hold ciphertext the service can't read. What it can see: who owns a row, its name (`history`,
-- …), its size and when it changed. Every table has row-level security: each person reaches only
-- their own rows.

-- ---- How much each plan may store ---------------------------------------------------------

-- Decimal units, as the app shows them (and as file browsers count): 500 MB, 5 GB, 25 GB.
alter table public.plans add column storage_bytes bigint not null default 500000000
  check (storage_bytes > 0);
update public.plans set storage_bytes = case id
  when 'free' then 500000000
  when 'starter' then 5000000000
  when 'pro' then 25000000000
end;

-- ---- The vault: the data key, wrapped ----------------------------------------------------

-- The account's data key, only ever encrypted: with a key derived from the passphrase (`kdf`), and
-- with the recovery key. Neither the passphrase nor the recovery key reaches the service.
create table public.vaults (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  kdf jsonb not null
    check (kdf ? 'salt' and kdf ? 'iterations' and (kdf ->> 'iterations')::integer >= 100000),
  wrapped_key jsonb not null check (wrapped_key ? 'iv' and wrapped_key ? 'data'),
  recovery_wrapped_key jsonb not null
    check (recovery_wrapped_key ? 'iv' and recovery_wrapped_key ? 'data'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- Encrypted records ---------------------------------------------------------------------

-- One row per saved record: the project list (scope 'global') or a project's history, dashboards,
-- notes, suggestions and file list (scope = the project's id). `version` counts saves, so two
-- devices can't overwrite each other unseen (sync_put); `updated_at` is the service's clock.
create table public.sync_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scope text not null check (scope ~ '^[A-Za-z0-9_-]{1,64}$'),
  key text not null check (key ~ '^[A-Za-z][A-Za-z0-9_-]{0,40}$'),
  version integer not null check (version > 0),
  ciphertext text not null check (octet_length(ciphertext) <= 11534336), -- 8 MiB, as base64
  updated_at timestamptz not null default now(),
  primary key (user_id, scope, key)
);
create index sync_records_changed on public.sync_records (user_id, updated_at);

-- ---- Encrypted files -----------------------------------------------------------------------

-- A file's space, reserved before its chunks upload (vault_reserve checks the plan's limit). The
-- chunks are objects vault/<user_id>/<file_id>/<index> in the private `vault` bucket.
create table public.vault_files (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_id text not null check (file_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  bytes bigint not null check (bytes >= 0),
  chunks integer not null check (chunks between 1 and 100000),
  created_at timestamptz not null default now(),
  primary key (user_id, file_id)
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('vault', 'vault', false, 4718592) -- a 4 MiB chunk once encrypted, with room to spare
on conflict (id) do nothing;

alter table public.vaults enable row level security;
alter table public.sync_records enable row level security;
alter table public.vault_files enable row level security;

create policy "Vaults: your own" on public.vaults
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Sync records: your own" on public.sync_records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Reserved only through vault_reserve (no insert policy), so the plan's limit can't be skipped.
create policy "Vault files: read your own" on public.vault_files
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Vault files: delete your own" on public.vault_files
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Storage: only your own folder; a chunk only for a reserved file, below its chunk count.
create policy "Vault: read your own chunks" on storage.objects
  for select to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Vault: upload reserved chunks" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and storage.filename(name) ~ '^[0-9]{1,6}$'
    and exists (
      select 1 from public.vault_files f
      where f.user_id = (select auth.uid())
        and f.file_id = (storage.foldername(name))[2]
        and storage.filename(name)::integer < f.chunks
    )
  );
create policy "Vault: delete your own chunks" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---- What's stored, against the plan ------------------------------------------------------

create function public.vault_used(person uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select sum(octet_length(r.ciphertext)) from public.sync_records r
                   where r.user_id = person), 0)
       + coalesce((select sum(f.bytes) from public.vault_files f where f.user_id = person), 0)
$$;

create function public.vault_limit(person uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select p.storage_bytes from public.plans p
  where p.id = (select plan_id from public.plan_of(person))
$$;

-- Records: the service's clock, the owner can't change, and the plan's limit.
create function public.sync_records_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;
  if public.vault_used(new.user_id)
     - coalesce(octet_length(case when tg_op = 'UPDATE' then old.ciphertext end), 0)
     + octet_length(new.ciphertext) > public.vault_limit(new.user_id) then
    raise exception 'storage_full' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger sync_records_guard
  before insert or update on public.sync_records
  for each row execute function public.sync_records_guard();

-- Save a record if nobody saved it since `expected` (0: it's new). Returns the new version, or null
-- when another device got there first (the caller pulls, merges and tries again).
create function public.sync_put(record_scope text, record_key text, expected integer, sealed text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved integer;
begin
  -- Without a vault, nothing saved could be read: a device still running after the cloud copy was
  -- deleted elsewhere must not save records under the old key.
  if not exists (select 1 from public.vaults v where v.user_id = (select auth.uid())) then
    raise exception 'vault_missing' using errcode = 'P0001';
  end if;
  if expected = 0 then
    insert into public.sync_records (user_id, scope, key, version, ciphertext)
    values ((select auth.uid()), record_scope, record_key, 1, sealed)
    on conflict (user_id, scope, key) do nothing
    returning version into saved;
  else
    update public.sync_records
    set version = version + 1, ciphertext = sealed
    where user_id = (select auth.uid()) and scope = record_scope and key = record_key
      and version = expected
    returning version into saved;
  end if;
  return saved;
end;
$$;

-- Reserve a file's space before its chunks upload; refused past the plan's limit.
create function public.vault_reserve(file text, file_bytes bigint, file_chunks integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid := (select auth.uid());
  used bigint;
  allowed bigint;
  existing public.vault_files%rowtype;
begin
  if person is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vaults v where v.user_id = person) then
    raise exception 'vault_missing' using errcode = 'P0001';
  end if;
  -- A chunk is at most 4 MiB of the file plus its IV, format byte and tag.
  if file_chunks < 1 or file_bytes > file_chunks::bigint * 4194333 then
    raise exception 'chunks_do_not_fit' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vault:' || person::text, 0));
  select * into existing from public.vault_files where user_id = person and file_id = file;
  if existing.file_id is not null then
    return jsonb_build_object('ok', true, 'used', public.vault_used(person),
                              'limit', public.vault_limit(person));
  end if;
  used := public.vault_used(person);
  allowed := public.vault_limit(person);
  if used + file_bytes > allowed then
    return jsonb_build_object('ok', false, 'reason', 'storage_full', 'used', used, 'limit', allowed);
  end if;
  insert into public.vault_files (user_id, file_id, bytes, chunks)
  values (person, file, file_bytes, file_chunks);
  return jsonb_build_object('ok', true, 'used', used + file_bytes, 'limit', allowed);
end;
$$;

-- The meter in Settings → Sync.
create function public.vault_usage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'used', public.vault_used((select auth.uid())),
    'limit', public.vault_limit((select auth.uid()))
  )
$$;

revoke execute on function public.vault_used(uuid) from public, anon, authenticated;
revoke execute on function public.vault_limit(uuid) from public, anon, authenticated;
revoke execute on function public.sync_records_guard() from public, anon, authenticated;
revoke execute on function public.sync_put(text, text, integer, text) from public, anon;
revoke execute on function public.vault_reserve(text, bigint, integer) from public, anon;
revoke execute on function public.vault_usage() from public, anon;
grant execute on function public.sync_put(text, text, integer, text) to authenticated;
grant execute on function public.vault_reserve(text, bigint, integer) to authenticated;
grant execute on function public.vault_usage() to authenticated;
