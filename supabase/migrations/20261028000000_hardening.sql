-- Release hardening (PRD D124): limits that keep one account from running up costs for everyone,
-- payments that end when the money goes back, and storage that can't be claimed without paying
-- for it. Tested in supabase/tests/hardening.test.sql.

-- ---- Hosted AI: what one question and one person may spend ---------------------------------

-- A question stops once its calls cost this much (typical: $0.013–0.016 on a standard model,
-- about $0.08 at the 8-call cap, D121). Summaries count towards the question they belong to.
alter table public.ai_models add column max_question_usd numeric not null default 0.15
  check (max_question_usd > 0);
update public.ai_models set max_question_usd = case tier
  when 'premium' then 0.75
  when 'fast' then 0.05
  else 0.15
end;

-- A person's hosted AI stops for the day at this much (the last 24 hours): one account can't use up
-- the global budget (AI_DAILY_BUDGET_USD) that pauses hosted AI for everyone.
alter table public.plans add column daily_usd numeric not null default 0.5 check (daily_usd > 0);
update public.plans set daily_usd = case id when 'free' then 0.5 when 'starter' then 2 when 'pro' then 5 end;

create index ai_usage_user_question on public.ai_usage (user_id, question_id);

-- As before (…_plans.sql), plus: a person's daily limit; a question's spend limit; and a question's
-- later calls stay at the price it was charged (a fast model for its summary, or a model of the
-- same weight or less: a question charged 1 can't make premium calls).
create or replace function public.ai_begin(
  person uuid,
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
  chosen public.ai_models%rowtype;
  plan public.plans%rowtype;
  current_plan text;
  since timestamptz;
  renews timestamptz;
  existing public.ai_questions%rowtype;
  used integer;
  usage_id bigint;
  deny jsonb;
  question_limit numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai:' || person::text, 0));

  select * into chosen from public.ai_models m where m.id = model and m.enabled;
  select p.plan_id, p.period_start, p.period_end into current_plan, since, renews
    from public.plan_of(person) p;
  select * into plan from public.plans where id = current_plan;
  used := public.questions_used(person, current_plan, since);
  deny := jsonb_build_object(
    'allowed', false, 'plan', current_plan, 'remaining', greatest(plan.questions - used, 0)
  );

  if not exists (
    select 1 from auth.users u
    where u.id = person and u.email_confirmed_at is not null and not u.is_anonymous
  ) then
    return deny || '{"reason": "email_unconfirmed"}';
  end if;
  if daily_budget is not null and (
    select coalesce(sum(cost_usd), 0) from public.ai_usage where at > now() - interval '1 day'
  ) >= daily_budget then
    return deny || '{"reason": "hosted_paused"}';
  end if;
  if (
    select count(*) from public.ai_usage where user_id = person and at > now() - interval '1 minute'
  ) >= 20 then
    return deny || '{"reason": "rate_limited"}';
  end if;
  if (
    select coalesce(sum(cost_usd), 0) from public.ai_usage
    where user_id = person and at > now() - interval '1 day'
  ) >= plan.daily_usd then
    return deny || '{"reason": "daily_limit"}';
  end if;
  if chosen.id is null then
    return deny || '{"reason": "model_unknown"}';
  end if;

  select * into existing from public.ai_questions q
    where q.user_id = person and q.question_id = question;

  if existing.question_id is not null then
    -- A question already paid for: its repairs, summary and fixes, within limits.
    if existing.calls >= 8 or existing.created_at < now() - interval '2 hours' then
      return deny || '{"reason": "call_cap"}';
    end if;
    if chosen.tier <> 'fast' and not (chosen.tier = any (plan.tiers)) then
      return deny || '{"reason": "model_not_in_plan"}';
    end if;
    if chosen.tier <> 'fast' and chosen.weight > existing.units then
      return deny || '{"reason": "model_not_paid"}';
    end if;
    select coalesce(
      (select m.max_question_usd from public.ai_models m where m.id = existing.model), 0.15
    ) into question_limit;
    if (
      select coalesce(sum(cost_usd), 0) from public.ai_usage
      where user_id = person and question_id = question
    ) >= question_limit then
      return deny || '{"reason": "question_budget"}';
    end if;
    update public.ai_questions set calls = calls + 1
      where user_id = person and question_id = question;
  else
    -- A new question: a planning model on the plan, or a fast one for "Suggest with AI".
    if not (chosen.tier = any (plan.tiers) or (chosen.tier = 'fast' and kind = 'suggest')) then
      return deny || '{"reason": "model_not_in_plan"}';
    end if;
    if used + chosen.weight > plan.questions then
      return deny || '{"reason": "quota_reached"}';
    end if;
    insert into public.ai_questions (user_id, question_id, kind, model, units)
      values (person, question, kind, chosen.id, chosen.weight);
    used := used + chosen.weight;
  end if;

  insert into public.ai_usage (user_id, question_id, model)
    values (person, question, chosen.id)
    returning id into usage_id;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'ok',
    'plan', current_plan,
    'remaining', greatest(plan.questions - used, 0),
    'usage_id', usage_id,
    'input_per_mtok', chosen.input_per_mtok,
    'output_per_mtok', chosen.output_per_mtok
  );
end;
$$;

-- ---- Paid plans: a lost webhook can't give one for ever --------------------------------------

-- As before, but an 'active' subscription whose period ended more than 3 days ago (its renewal
-- or expiry webhook never arrived) no longer counts.
create or replace function public.plan_of(person uuid)
returns table (plan_id text, period_start timestamptz, period_end timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(s.plan_id, 'free'), s.period_start, s.period_end
  from (select 1) as one
  left join public.subscriptions s
    on s.user_id = person
    and (
      (s.status = 'active' and (s.period_end is null or s.period_end > now() - interval '3 days'))
      or (s.status in ('cancelled', 'past_due') and s.period_end > now())
    )
$$;

-- ---- Refunds and lost disputes end the paid plan ---------------------------------------------

-- Each payment for a subscription we started, so a refund or dispute (which names only the payment)
-- finds its person. Written only by billing_apply; no client access.
create table public.billing_payments (
  payment_id text primary key check (char_length(payment_id) between 1 and 200),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id text,
  received_at timestamptz not null default now()
);
alter table public.billing_payments enable row level security;
create policy "Billing payments: no client access" on public.billing_payments
  for select to authenticated
  using (false);

-- As before (…_plans.sql) for subscription events (`change` without a kind). Two more kinds:
--   {"kind": "payment", "payment_id", "user_id"?, "subscription_id"?}: remember the payment;
--   {"kind": "revoke", "payment_id"}: a full refund or a dispute the money went back on: the paid
--   plan ends now (a later renewal, a new payment, starts it again).
create or replace function public.billing_apply(
  webhook text,
  event_type text,
  event_time timestamptz,
  change jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
  outcome text;
  paid public.billing_payments%rowtype;
  kind text := coalesce(change ->> 'kind', 'subscription');
begin
  if exists (select 1 from public.billing_events where webhook_id = webhook) then
    return 'duplicate';
  end if;
  if change is null then
    outcome := 'ignored';
  elsif kind = 'payment' then
    person := coalesce(
      (select u.id from auth.users u where u.id::text = change ->> 'user_id'),
      (select s.user_id from public.subscriptions s
       where s.subscription_id = change ->> 'subscription_id')
    );
    if person is null or coalesce(change ->> 'payment_id', '') = '' then
      outcome := 'ignored';
    else
      insert into public.billing_payments (payment_id, user_id, subscription_id)
      values (change ->> 'payment_id', person, change ->> 'subscription_id')
      on conflict (payment_id) do nothing;
      outcome := 'applied';
    end if;
  elsif kind = 'revoke' then
    select * into paid from public.billing_payments p where p.payment_id = change ->> 'payment_id';
    if paid.payment_id is null then
      outcome := 'ignored';
    else
      update public.subscriptions s
      set status = 'expired',
          event_at = greatest(s.event_at, event_time),
          updated_at = now()
      where s.user_id = paid.user_id
        and (paid.subscription_id is null or s.subscription_id is null
             or s.subscription_id = paid.subscription_id);
      outcome := case when found then 'applied' else 'ignored' end;
    end if;
  else
    person := (change ->> 'user_id')::uuid;
    if not exists (select 1 from auth.users where id = person) then
      outcome := 'ignored';
    elsif change ->> 'plan_id' is null
      and not exists (select 1 from public.subscriptions s where s.user_id = person) then
      -- An event without a product can update a subscription we know, not start one.
      outcome := 'ignored';
    elsif exists (
      select 1 from public.subscriptions s where s.user_id = person and s.event_at > event_time
    ) then
      outcome := 'stale';
    else
      insert into public.subscriptions as s (
        user_id, plan_id, status, customer_id, subscription_id, period_start, period_end, event_at,
        updated_at
      )
      values (
        person,
        coalesce(
          change ->> 'plan_id',
          (select s.plan_id from public.subscriptions s where s.user_id = person)
        ),
        change ->> 'status',
        change ->> 'customer_id',
        change ->> 'subscription_id',
        (change ->> 'period_start')::timestamptz,
        (change ->> 'period_end')::timestamptz,
        event_time,
        now()
      )
      on conflict (user_id) do update set
        plan_id = excluded.plan_id,
        status = excluded.status,
        customer_id = coalesce(excluded.customer_id, s.customer_id),
        subscription_id = coalesce(excluded.subscription_id, s.subscription_id),
        period_start = coalesce(excluded.period_start, s.period_start),
        period_end = coalesce(excluded.period_end, s.period_end),
        event_at = excluded.event_at,
        updated_at = now();
      outcome := 'applied';
    end if;
  end if;
  insert into public.billing_events (webhook_id, type, outcome) values (webhook, event_type, outcome);
  return outcome;
end;
$$;

-- ---- Deleting an account doesn't leave a subscription charging -----------------------------

-- As before (…_profiles.sql), but refused while a subscription can still charge (active, or
-- retrying a failed payment): the person cancels it first (Plan and billing → Manage
-- subscription). A cancelled one charges no more, so it doesn't stop the deletion.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.subscriptions s
    where s.user_id = auth.uid() and s.status in ('active', 'past_due', 'on_hold')
  ) then
    raise exception 'subscription_active' using errcode = 'P0001';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---- Encrypted storage: space can't be claimed without paying for it ------------------------

-- A file's chunk count must be the one its size needs (src/lib/vault.ts: 4 MiB of the file plus
-- 29 bytes each), not just at least: 1 byte reserved for 100,000 chunks would store 450 GB.
create or replace function public.vault_reserve(file text, file_bytes bigint, file_chunks integer)
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
  if file_bytes < 0 or file_chunks <> greatest(1, ceil(file_bytes / 4194333.0))::integer then
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

-- A reservation goes only with its chunks: deleting the row while they stay would free the space
-- they still use. The app deletes the chunks, then releases (src/platform/vault.ts).
drop policy "Vault files: delete your own" on public.vault_files;

create function public.vault_release(file text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid := (select auth.uid());
  prefix text;
begin
  if person is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  prefix := person::text || '/' || file || '/';
  -- Compared as a prefix, not with LIKE: file ids contain '_', a LIKE wildcard.
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = 'vault' and left(o.name, length(prefix)) = prefix
  ) then
    return false;
  end if;
  delete from public.vault_files where user_id = person and file_id = file;
  return true;
end;
$$;

revoke execute on function public.vault_release(text) from public, anon;
grant execute on function public.vault_release(text) to authenticated;

-- ---- Shared dashboards: at most 100 per owner ----------------------------------------------

-- Each is at most 5 MB (dashboards_doc_size); this keeps that from multiplying without end.
create function public.dashboards_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.dashboards d where d.owner_id = new.owner_id) >= 100 then
    raise exception 'too_many_dashboards' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.dashboards_limit() from public, anon, authenticated;

create trigger dashboards_limit
  before insert on public.dashboards
  for each row execute function public.dashboards_limit();
