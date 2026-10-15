-- Plans and hosted AI (F-PLAN-01…04, PRD D119–D121): HushGlance's own models through OpenRouter for
-- signed-in users without a key, 3 free questions, then Starter or Pro (paid through Dodo Payments). Every table
-- has row-level security. Clients only read; the Edge Functions (supabase/functions/) write with the
-- secret key, through the functions at the end of this file. Requests and answers are never stored:
-- ai_usage holds token counts and cost, nothing a user typed or a model wrote.

-- ---- What can be asked with what ------------------------------------------------------------

-- The hosted models (D121): an OpenRouter slug each. A model is listed (enabled) once it passes the
-- NL→SQL eval (evals/run.eval.ts) with zero data retention forced. Its weight is how many questions
-- an ask with it uses: premium models cost more to run. 'fast' models write summaries and
-- suggestions, at no extra charge on a question already counted.
create table public.ai_models (
  id text primary key check (id ~ '^[a-z0-9-]+/[a-z0-9._-]+$'),
  label text not null check (char_length(label) between 1 and 60),
  maker text not null check (char_length(maker) between 1 and 40),
  description text not null default '' check (char_length(description) <= 200),
  tier text not null check (tier in ('standard', 'premium', 'fast')),
  weight integer not null check (weight between 1 and 20),
  -- USD per million tokens, for the spend breaker when OpenRouter doesn't report a cost.
  input_per_mtok numeric not null check (input_per_mtok >= 0),
  output_per_mtok numeric not null check (output_per_mtok >= 0),
  -- Share of the eval questions answered correctly through OpenRouter (evals/report.md); null until
  -- measured.
  eval_accuracy numeric check (eval_accuracy between 0 and 1),
  enabled boolean not null default false,
  sort integer not null default 0
);

create table public.plans (
  id text primary key check (id in ('free', 'starter', 'pro')),
  label text not null,
  -- Questions per period: free counts for ever, Starter and Pro per billing month.
  questions integer not null check (questions > 0),
  period text not null check (period in ('lifetime', 'month')),
  -- Which model tiers a plan may plan with ('fast' is always allowed for summaries).
  tiers text[] not null,
  -- Shown on the upgrade dialog and the landing page; Dodo holds the real prices.
  price_monthly_usd numeric,
  price_yearly_usd numeric
);

insert into public.plans (id, label, questions, period, tiers, price_monthly_usd, price_yearly_usd)
values
  ('free', 'Free', 3, 'lifetime', array['standard'], null, null),
  ('starter', 'Starter', 100, 'month', array['standard'], 5, 50),
  ('pro', 'Pro', 300, 'month', array['standard', 'premium'], 12, 120);

-- The short list (checked 2026-10-11 on openrouter.ai/api/v1/models and /endpoints/zdr: structured
-- outputs on a zero-data-retention endpoint). The app's own default and fast models are on; the rest
-- wait for an eval run (docs/DEPLOY.md, "Curating the hosted models").
insert into public.ai_models
  (id, label, maker, description, tier, weight, input_per_mtok, output_per_mtok, enabled, sort)
values
  ('anthropic/claude-sonnet-5', 'Claude Sonnet 5', 'Anthropic',
   'Careful SQL at a good pace. The default.', 'standard', 1, 2, 10, true, 10),
  ('openai/gpt-6-sol', 'GPT-6 Sol', 'OpenAI',
   'Balanced intelligence and cost.', 'standard', 1, 2, 10, true, 20),
  ('anthropic/claude-opus-5.5', 'Claude Opus 5.5', 'Anthropic',
   'Most capable Claude, for the hardest questions.', 'premium', 5, 4, 20, true, 30),
  ('openai/gpt-6-astra', 'GPT-6 Astra', 'OpenAI',
   'Most capable GPT. Slower.', 'premium', 5, 10, 50, true, 40),
  ('anthropic/claude-haiku-4.5', 'Claude Haiku 4.5', 'Anthropic',
   'Writes summaries and suggestions.', 'fast', 1, 1, 5, true, 50),
  ('openai/gpt-6-luna', 'GPT-6 Luna', 'OpenAI',
   'Writes summaries and suggestions.', 'fast', 1, 0.1, 0.5, true, 60),
  ('google/gemini-3.8-flash', 'Gemini 3.8 Flash', 'Google',
   'Fast and inexpensive.', 'standard', 1, 0.75, 3.75, false, 70),
  ('deepseek/deepseek-v4-pro', 'DeepSeek V4 Pro', 'DeepSeek',
   'Open weights, low cost.', 'standard', 1, 0.21, 0.42, false, 80),
  ('x-ai/grok-4.7', 'Grok 4.7', 'xAI', 'xAI''s latest.', 'standard', 1, 2, 6, false, 90),
  ('mistralai/mistral-large-4-0', 'Mistral Large 4', 'Mistral',
   'Mistral''s largest model.', 'standard', 1, 0.68, 2.09, false, 100);

-- ---- Subscriptions (written only by the billing webhook) ------------------------------------

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null
    check (status in ('active', 'cancelled', 'past_due', 'on_hold', 'failed', 'expired')),
  provider text not null default 'dodo' check (provider in ('dodo')),
  customer_id text,
  subscription_id text unique,
  period_start timestamptz,
  period_end timestamptz,
  -- The newest webhook applied: an older one arriving late must not undo it.
  event_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- Every webhook delivery seen, so a retried one is applied once (Dodo retries up to 8 times).
create table public.billing_events (
  webhook_id text primary key check (char_length(webhook_id) between 1 and 200),
  type text not null,
  outcome text not null check (outcome in ('applied', 'ignored', 'stale')),
  received_at timestamptz not null default now()
);

-- ---- Metering (written only by the ai Edge Function) ----------------------------------------

-- One row per question: an ask with its repairs, explorations, summary and Python fix, a dashboard,
-- or one "Suggest with AI". The client names it (x-fq-question); a name is charged once and then
-- capped at 8 model calls within 2 hours, so reusing one buys nothing.
create table public.ai_questions (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id text not null check (question_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  kind text not null check (kind in ('ask', 'dashboard', 'suggest')),
  model text not null,
  units integer not null check (units > 0),
  calls integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index ai_questions_user_created on public.ai_questions (user_id, created_at);

-- One row per model call: token counts and cost. Never the request or the response.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_usd numeric not null default 0,
  -- The upstream HTTP status; 0 while the call is in flight.
  status integer not null default 0,
  at timestamptz not null default now()
);
create index ai_usage_user_at on public.ai_usage (user_id, at);
create index ai_usage_at on public.ai_usage (at);

alter table public.ai_models enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.ai_questions enable row level security;
alter table public.ai_usage enable row level security;

create policy "AI models: anyone reads the listed ones" on public.ai_models
  for select to anon, authenticated
  using (enabled);

create policy "Plans: anyone reads them" on public.plans
  for select to anon, authenticated
  using (true);

create policy "Subscriptions: read your own" on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Nobody reads or writes these through the API: only the service role (which bypasses row-level
-- security) does, from the billing Edge Function.
create policy "Billing events: no client access" on public.billing_events
  for select to authenticated
  using (false);

create policy "AI questions: read your own" on public.ai_questions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "AI usage: read your own" on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No insert, update or delete policies anywhere: clients can't change plans, subscriptions or usage.

-- ---- The plan a person is on ----------------------------------------------------------------

-- A paid plan (Starter or Pro) while active, or until the paid period ends after a cancellation or
-- a failed renewal.
create function public.plan_of(person uuid)
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
      s.status = 'active'
      or (s.status in ('cancelled', 'past_due') and s.period_end > now())
    )
$$;

-- Questions used in the plan's current period: ever on free, since the billing period started on
-- a paid plan (or the calendar month, before the first webhook names one).
create function public.questions_used(person uuid, plan text, since timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(q.units), 0)::integer
  from public.ai_questions q
  where q.user_id = person
    and (plan = 'free' or q.created_at >= coalesce(since, date_trunc('month', now())))
$$;

-- ---- The ai Edge Function's calls (service role only) ---------------------------------------

-- Before a model call: may this person make it, and what does it cost? Charges a new question its
-- model's weight; returns the usage row to finish. Serialized per person (an advisory lock), so
-- two questions racing for the last free one can't both get it.
create function public.ai_begin(
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

-- After a model call: its token counts, cost and status. A question whose first call failed
-- upstream is given back: nobody pays for an answer they didn't get.
create function public.ai_finish(
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
    delete from public.ai_questions q
    where q.user_id = finished.user_id and q.question_id = finished.question_id and q.calls = 1;
  end if;
end;
$$;

-- ---- The billing Edge Function's call (service role only) -----------------------------------

-- Applies one verified webhook delivery: once per webhook id, and never older over newer.
-- `change` is null for an event that doesn't concern a subscription we know (recorded as ignored).
create function public.billing_apply(
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
begin
  if exists (select 1 from public.billing_events where webhook_id = webhook) then
    return 'duplicate';
  end if;
  if change is null then
    outcome := 'ignored';
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

-- ---- The app's call -------------------------------------------------------------------------

-- The signed-in person's plan and what's left of it (the ask bar's meter, Plan and billing).
create function public.ai_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  person uuid := (select auth.uid());
  current_plan text;
  since timestamptz;
  renews timestamptz;
  plan public.plans%rowtype;
  used integer;
  sub public.subscriptions%rowtype;
begin
  if person is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select p.plan_id, p.period_start, p.period_end into current_plan, since, renews
    from public.plan_of(person) p;
  select * into plan from public.plans where id = current_plan;
  select * into sub from public.subscriptions where user_id = person;
  used := public.questions_used(person, current_plan, since);
  return jsonb_build_object(
    'plan', current_plan,
    'label', plan.label,
    'questions', plan.questions,
    'period', plan.period,
    'used', used,
    'remaining', greatest(plan.questions - used, 0),
    'tiers', to_jsonb(plan.tiers),
    'renews_at', renews,
    'status', sub.status,
    'has_customer', sub.customer_id is not null
  );
end;
$$;

revoke execute on function public.plan_of(uuid) from public, anon, authenticated;
revoke execute on function public.questions_used(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.ai_begin(uuid, text, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.ai_finish(bigint, integer, integer, integer, numeric, integer) from public, anon, authenticated;
revoke execute on function public.billing_apply(text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke execute on function public.ai_quota() from public, anon;
grant execute on function public.ai_begin(uuid, text, text, text, numeric) to service_role;
grant execute on function public.ai_finish(bigint, integer, integer, integer, numeric, integer) to service_role;
grant execute on function public.billing_apply(text, text, timestamptz, jsonb) to service_role;
grant execute on function public.ai_quota() to authenticated;
