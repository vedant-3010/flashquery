-- Sharing (F-SHARE-01…07, F-SEC-07, PRD D103, D116): dashboards saved to the account, shared with
-- people by email (viewer or editor) and by view-only link. A dashboard is its document: layout,
-- titles, SQL, chart specs, text and each tile's last results. Never source files. Every table has
-- row-level security; the functions below do what a policy can't say safely.

create table public.dashboards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  doc jsonb not null,
  -- Bumped by the trigger on every save: a save names the version it read (optimistic locking).
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The size cap (D103): 5 MB of JSON per dashboard.
  constraint dashboards_doc_size check (octet_length(doc::text) <= 5242880)
);
create index dashboards_owner_id on public.dashboards (owner_id);

create table public.dashboard_members (
  dashboard_id uuid not null references public.dashboards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  -- The address the invite went to, so the owner recognises who joined.
  email text not null,
  created_at timestamptz not null default now(),
  primary key (dashboard_id, user_id)
);
create index dashboard_members_user_id on public.dashboard_members (user_id);

create table public.dashboard_invites (
  dashboard_id uuid not null references public.dashboards (id) on delete cascade,
  email text not null check (email = lower(email) and email like '_%@_%'),
  role text not null check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key (dashboard_id, email)
);

create table public.share_links (
  -- 24 URL-safe characters from 18 random bytes: unguessable.
  slug text primary key default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')
    check (slug ~ '^[A-Za-z0-9_-]{20,}$'),
  dashboard_id uuid not null references public.dashboards (id) on delete cascade,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index share_links_dashboard_id on public.share_links (dashboard_id);

-- ---- Who may do what -------------------------------------------------------------------------

-- 'owner', 'editor', 'viewer' or null. Security definer, so policies can ask it without recursing
-- through each other's row-level security.
create function public.dashboard_role(dashboard uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.dashboards d where d.id = dashboard and d.owner_id = (select auth.uid())
    ) then 'owner'
    else (
      select m.role from public.dashboard_members m
      where m.dashboard_id = dashboard and m.user_id = (select auth.uid())
    )
  end
$$;

alter table public.dashboards enable row level security;
alter table public.dashboard_members enable row level security;
alter table public.dashboard_invites enable row level security;
alter table public.share_links enable row level security;

-- The owner by the row itself: a row being inserted isn't visible to dashboard_role yet, and the
-- insert reads back its id (RETURNING checks this policy).
create policy "Dashboards: owners and members read" on public.dashboards
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.dashboard_role(id) is not null);

create policy "Dashboards: you create your own" on public.dashboards
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Dashboards: owners and editors save" on public.dashboards
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.dashboard_role(id) = 'editor')
  with check (owner_id = (select auth.uid()) or public.dashboard_role(id) = 'editor');

create policy "Dashboards: owners delete" on public.dashboards
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- The owner can't be changed, and the version and times are the trigger's.
revoke update on public.dashboards from authenticated;
grant update (name, doc) on public.dashboards to authenticated;

create function public.dashboards_saved()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger dashboards_saved
  before update on public.dashboards
  for each row execute function public.dashboards_saved();

create policy "Members: you and the owner see a membership" on public.dashboard_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.dashboard_role(dashboard_id) = 'owner');

create policy "Members: the owner changes a role" on public.dashboard_members
  for update to authenticated
  using (public.dashboard_role(dashboard_id) = 'owner')
  with check (public.dashboard_role(dashboard_id) = 'owner');

create policy "Members: the owner removes, or you leave" on public.dashboard_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.dashboard_role(dashboard_id) = 'owner');

-- No insert policy: people join by claiming an invite (claim_invites below).
revoke update on public.dashboard_members from authenticated;
grant update (role) on public.dashboard_members to authenticated;

create policy "Invites: the owner manages them" on public.dashboard_invites
  for all to authenticated
  using (public.dashboard_role(dashboard_id) = 'owner')
  with check (public.dashboard_role(dashboard_id) = 'owner');

create policy "Links: the owner manages them" on public.share_links
  for all to authenticated
  using (public.dashboard_role(dashboard_id) = 'owner')
  with check (public.dashboard_role(dashboard_id) = 'owner');

revoke update on public.share_links from authenticated;
grant update (expires_at, revoked_at) on public.share_links to authenticated;

-- ---- Functions the app calls -----------------------------------------------------------------

/** After signing in: invites to your confirmed address become memberships. Returns how many. */
create function public.claim_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  address text;
  claimed integer;
begin
  select lower(u.email) into address
  from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
  if address is null then
    return 0;
  end if;
  with taken as (
    delete from public.dashboard_invites i where i.email = address returning i.dashboard_id, i.role
  )
  insert into public.dashboard_members (dashboard_id, user_id, role, email)
  select t.dashboard_id, (select auth.uid()), t.role, address
  from taken t
  -- Not your own dashboard; an existing membership takes the invite's role.
  where not exists (
    select 1 from public.dashboards d where d.id = t.dashboard_id and d.owner_id = (select auth.uid())
  )
  on conflict (dashboard_id, user_id) do update set role = excluded.role;
  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

/** A view-only link (F-SHARE-04): the dashboard, if the link is live. Open to anyone with it. */
create function public.shared_dashboard(link text)
returns table (name text, doc jsonb, owner_name text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.name, d.doc, coalesce(p.display_name, ''), d.updated_at
  from public.share_links l
  join public.dashboards d on d.id = l.dashboard_id
  left join public.profiles p on p.id = d.owner_id
  where l.slug = link
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now())
$$;

/** A dashboard you own or were invited to, with its owner's name and your role. */
create function public.open_dashboard(dashboard uuid)
returns table (
  id uuid, name text, doc jsonb, version integer, owner_name text, role text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.name, d.doc, d.version, coalesce(p.display_name, ''), public.dashboard_role(d.id),
    d.updated_at
  from public.dashboards d
  left join public.profiles p on p.id = d.owner_id
  where d.id = dashboard and public.dashboard_role(d.id) is not null
$$;

/** Home's "Shared with me" (F-SHARE-05): dashboards others shared with you. */
create function public.shared_with_me()
returns table (id uuid, name text, owner_name text, role text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.name, coalesce(p.display_name, ''), m.role, d.updated_at
  from public.dashboard_members m
  join public.dashboards d on d.id = m.dashboard_id
  left join public.profiles p on p.id = d.owner_id
  where m.user_id = (select auth.uid())
  order by d.updated_at desc
$$;

/** The share dialog's people (F-SHARE-03): members and pending invites. The owner only. */
create function public.dashboard_people(dashboard uuid)
returns table (kind text, user_id uuid, name text, email text, role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.dashboard_role(dashboard) is distinct from 'owner' then
    raise exception 'Only the owner sees who it is shared with' using errcode = '42501';
  end if;
  return query
    select 'member'::text, m.user_id, coalesce(p.display_name, ''), m.email, m.role, m.created_at
    from public.dashboard_members m
    left join public.profiles p on p.id = m.user_id
    where m.dashboard_id = dashboard
    union all
    select 'invite'::text, null::uuid, ''::text, i.email, i.role, i.created_at
    from public.dashboard_invites i
    where i.dashboard_id = dashboard
    order by 6;
end;
$$;

revoke execute on function public.dashboard_role(uuid) from public, anon;
revoke execute on function public.dashboards_saved() from public, anon, authenticated;
revoke execute on function public.claim_invites() from public, anon;
revoke execute on function public.open_dashboard(uuid) from public, anon;
revoke execute on function public.shared_with_me() from public, anon;
revoke execute on function public.dashboard_people(uuid) from public, anon;
revoke execute on function public.shared_dashboard(text) from public;
grant execute on function public.dashboard_role(uuid) to authenticated;
grant execute on function public.claim_invites() to authenticated;
grant execute on function public.open_dashboard(uuid) to authenticated;
grant execute on function public.shared_with_me() to authenticated;
grant execute on function public.dashboard_people(uuid) to authenticated;
-- A link works with no account: anyone holding it may read that one dashboard.
grant execute on function public.shared_dashboard(text) to anon, authenticated;
