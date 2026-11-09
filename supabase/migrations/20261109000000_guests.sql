-- Guests (PRD D125, F-PLAN-06): HushGlance AI without an account, a few questions a day per IP
-- address. A guest is known here only by a keyed hash of their address (an IPv6 address by its /64),
-- made in the ai Edge Function with a secret this database never sees: a copy of the database
-- doesn't give the addresses back. Hashes older than 2 days are cleared every hour (Supabase Cron)
-- and before every guest call; the calls' costs stay, anonymous. Written only by the ai Edge
-- Function, through the functions below (service role). Tested in supabase/tests/guests.test.sql.

-- ---- What guests may use (one row) ----------------------------------------------------------

create table public.guest_limits (
  id boolean primary key default true check (id),
  -- Questions per IP address in any 24 hours; 0 turns HushGlance AI off for guests.
  questions integer not null check (questions >= 0),
  -- The model tiers guests may ask with ('fast' ones write summaries and suggestions).
  tiers text[] not null,
  -- What one address may spend in 24 hours, and all guests together: guests can't use up the
  -- global budget (AI_DAILY_BUDGET_USD) that pauses hosted AI for everyone.
  daily_usd numeric not null check (daily_usd > 0),
  total_daily_usd numeric not null check (total_daily_usd >= 0)
);

insert into public.guest_limits (questions, tiers, daily_usd, total_daily_usd)
values (3, array['standard'], 0.25, 5);

-- ---- Guests' questions and calls ------------------------------------------------------------

-- As ai_questions, for a guest: one row per question, charged once.
create table public.guest_questions (
  guest text not null check (guest ~ '^[0-9a-f]{64}$'),
  question_id text not null check (question_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  kind text not null check (kind in ('ask', 'dashboard', 'suggest')),
  model text not null,
  units integer not null check (units > 0),
  calls integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (guest, question_id)
);
create index guest_questions_created on public.guest_questions (created_at);

-- Guests' model calls go in the one ledger, ai_usage, so the spend breaker counts them: a guest's
-- hash in place of a person (never both). A row with neither is a call whose guest was forgotten.
alter table public.ai_usage alter column user_id drop not null;
alter table public.ai_usage add column guest text check (guest ~ '^[0-9a-f]{64}$');
alter table public.ai_usage add constraint ai_usage_one_caller
  check (user_id is null or guest is null);
create index ai_usage_guest_at on public.ai_usage (guest, at) where guest is not null;
create index ai_usage_guest_question on public.ai_usage (guest, question_id)
  where guest is not null;
create index ai_usage_guest_expiry on public.ai_usage (at) where guest is not null;
create index ai_usage_without_user on public.ai_usage (at) where user_id is null;

alter table public.guest_limits enable row level security;
alter table public.guest_questions enable row level security;

-- Nobody reads these through the API: only the service role (which bypasses row-level security)
-- does, from the ai Edge Function. ai_usage's policy ("read your own") never matches a guest's row.
create policy "Guest limits: no client access" on public.guest_limits
  for select to anon, authenticated
  using (false);

create policy "Guest questions: no client access" on public.guest_questions
  for select to anon, authenticated
  using (false);

-- ---- The ai Edge Function's calls (service role only) ---------------------------------------

-- Forgets guests whose questions no longer count: their questions go, and their calls keep only
-- token counts and cost.
create function public.guest_forget()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.guest_questions where created_at < now() - interval '2 days';
  update public.ai_usage set guest = null
    where guest is not null and at < now() - interval '2 days';
$$;

-- Questions a guest used in the last 24 hours.
create function public.guest_used(visitor text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(q.units), 0)::integer
  from public.guest_questions q
  where q.guest = visitor and q.created_at > now() - interval '1 day'
$$;

-- As ai_begin (…_hardening.sql), for a guest: may this address make the call, and what does it
-- cost? Serialized per guest, so two questions racing for the last free one can't both get it.
create function public.guest_begin(
  visitor text,
  question text,
  kind text,
  model text,
  daily_budget numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits public.guest_limits%rowtype;
  chosen public.ai_models%rowtype;
  existing public.guest_questions%rowtype;
  used integer;
  usage_id bigint;
  deny jsonb;
  question_limit numeric;
begin
  if visitor is null or visitor !~ '^[0-9a-f]{64}$' then
    raise exception 'guest_invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('guest:' || visitor, 0));
  perform public.guest_forget();

  select * into limits from public.guest_limits;
  select * into chosen from public.ai_models m where m.id = model and m.enabled;
  used := public.guest_used(visitor);
  deny := jsonb_build_object(
    'allowed', false, 'plan', 'guest',
    'remaining', greatest(coalesce(limits.questions, 0) - used, 0)
  );

  if limits.id is null or limits.questions = 0 then
    return deny || '{"reason": "guests_off"}';
  end if;
  if daily_budget is not null and (
    select coalesce(sum(cost_usd), 0) from public.ai_usage where at > now() - interval '1 day'
  ) >= daily_budget then
    return deny || '{"reason": "hosted_paused"}';
  end if;
  if (
    select coalesce(sum(u.cost_usd), 0) from public.ai_usage u
    where u.user_id is null and u.at > now() - interval '1 day'
  ) >= limits.total_daily_usd then
    return deny || '{"reason": "guests_paused"}';
  end if;
  if (
    select count(*) from public.ai_usage u
    where u.guest = visitor and u.at > now() - interval '1 minute'
  ) >= 20 then
    return deny || '{"reason": "rate_limited"}';
  end if;
  if (
    select coalesce(sum(u.cost_usd), 0) from public.ai_usage u
    where u.guest = visitor and u.at > now() - interval '1 day'
  ) >= limits.daily_usd then
    return deny || '{"reason": "daily_limit"}';
  end if;
  if chosen.id is null then
    return deny || '{"reason": "model_unknown"}';
  end if;

  select * into existing from public.guest_questions q
    where q.guest = visitor and q.question_id = question;

  if existing.question_id is not null then
    -- A question already counted: its repairs, summary and fixes, within the same limits.
    if existing.calls >= 8 or existing.created_at < now() - interval '2 hours' then
      return deny || '{"reason": "call_cap"}';
    end if;
    if chosen.tier <> 'fast' and not (chosen.tier = any (limits.tiers)) then
      return deny || '{"reason": "model_not_in_plan"}';
    end if;
    if chosen.tier <> 'fast' and chosen.weight > existing.units then
      return deny || '{"reason": "model_not_paid"}';
    end if;
    select coalesce(
      (select m.max_question_usd from public.ai_models m where m.id = existing.model), 0.15
    ) into question_limit;
    if (
      select coalesce(sum(u.cost_usd), 0) from public.ai_usage u
      where u.guest = visitor and u.question_id = question
    ) >= question_limit then
      return deny || '{"reason": "question_budget"}';
    end if;
    update public.guest_questions q set calls = q.calls + 1
      where q.guest = visitor and q.question_id = question;
  else
    if not (chosen.tier = any (limits.tiers) or (chosen.tier = 'fast' and kind = 'suggest')) then
      return deny || '{"reason": "model_not_in_plan"}';
    end if;
    if used + chosen.weight > limits.questions then
      return deny || '{"reason": "quota_reached"}';
    end if;
    insert into public.guest_questions (guest, question_id, kind, model, units)
      values (visitor, question, kind, chosen.id, chosen.weight);
    used := used + chosen.weight;
  end if;

  insert into public.ai_usage (guest, question_id, model)
    values (visitor, question, chosen.id)
    returning id into usage_id;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'ok',
    'plan', 'guest',
    'remaining', greatest(limits.questions - used, 0),
    'usage_id', usage_id,
    'input_per_mtok', chosen.input_per_mtok,
    'output_per_mtok', chosen.output_per_mtok
  );
end;
$$;

-- A guest's allowance, in ai_quota's shape (the ask bar's meter). `renews_at`: when the oldest
-- question counted stops counting (the next one is free again), while any is used.
create function public.guest_quota(visitor text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  limits public.guest_limits%rowtype;
  used integer;
  oldest timestamptz;
begin
  select * into limits from public.guest_limits;
  used := public.guest_used(visitor);
  select min(q.created_at) into oldest from public.guest_questions q
    where q.guest = visitor and q.created_at > now() - interval '1 day';
  return jsonb_build_object(
    'plan', 'guest',
    'label', 'Guest',
    'questions', coalesce(limits.questions, 0),
    'period', 'day',
    'used', used,
    'remaining', greatest(coalesce(limits.questions, 0) - used, 0),
    'tiers', to_jsonb(coalesce(limits.tiers, array[]::text[])),
    'renews_at', oldest + interval '1 day',
    'status', null,
    'has_customer', false
  );
end;
$$;

-- As before (…_plans.sql), and a guest's question whose first call failed upstream is given back
-- too: nobody pays for an answer they didn't get.
create or replace function public.ai_finish(
  usage bigint,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cost numeric,
  upstream_status integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  finished public.ai_usage%rowtype;
begin
  update public.ai_usage u
  set input_tokens = greatest(ai_finish.input_tokens, 0),
      output_tokens = greatest(ai_finish.output_tokens, 0),
      cache_read_tokens = greatest(ai_finish.cache_read_tokens, 0),
      cost_usd = greatest(ai_finish.cost, 0),
      status = ai_finish.upstream_status
  where u.id = ai_finish.usage
  returning u.* into finished;
  if finished.id is not null and ai_finish.upstream_status not between 200 and 299 then
    if finished.user_id is not null then
      delete from public.ai_questions q
      where q.user_id = finished.user_id and q.question_id = finished.question_id and q.calls = 1;
    elsif finished.guest is not null then
      delete from public.guest_questions q
      where q.guest = finished.guest and q.question_id = finished.question_id and q.calls = 1;
    end if;
  end if;
end;
$$;

revoke execute on function public.guest_forget() from public, anon, authenticated;
revoke execute on function public.guest_used(text) from public, anon, authenticated;
revoke execute on function public.guest_begin(text, text, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.guest_quota(text) from public, anon, authenticated;
revoke execute on function public.ai_finish(bigint, integer, integer, integer, numeric, integer) from public, anon, authenticated;
grant execute on function public.guest_begin(text, text, text, text, numeric) to service_role;
grant execute on function public.guest_quota(text) to service_role;
grant execute on function public.ai_finish(bigint, integer, integer, integer, numeric, integer) to service_role;

-- ---- Forgetting on a schedule (Supabase Cron) -----------------------------------------------

-- Every hour, so a hash goes within an hour of turning 2 days old even when no guest asks.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('hushglance-guest-forget', '17 * * * *', 'select public.guest_forget()');
