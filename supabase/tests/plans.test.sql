-- Plans and hosted AI (F-PLAN-01…04, F-SEC-07): who may read what, and the quota rules the ai and
-- billing Edge Functions rely on. Runs against the local Supabase: `npx supabase test db`
-- (docs/DEPLOY.md). Everything rolls back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'fran@example.com', now(), '{"full_name": "Fran Free"}'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pat@example.com', now(), '{"full_name": "Pat Pro"}'),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'una@example.com', null, '{"full_name": "Una Unconfirmed"}'),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'sam@example.com', now(), '{"full_name": "Sam Starter"}');

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

-- ai_begin as the Edge Function calls it, returning the reason.
create function pg_temp.begin_ask(person uuid, question text, model text, kind text default 'ask')
returns text language sql as $$
  select public.ai_begin(person, question, kind, model, null) ->> 'reason'
$$;

-- ---- The free plan (as the service role, which the ai function uses) ----

set local role service_role;

select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f1', 'question-0001', 'anthropic/claude-sonnet-5'),
  'ok', 'a free user asks a first question'
);
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f1', 'question-0001', 'anthropic/claude-haiku-4.5'),
  'ok', 'its summary, on a fast model, is part of the same question'
);
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f1', 'question-0001', 'anthropic/claude-sonnet-5'),
  'ok', 'a repair of the same question is too'
);
select is(
  (select units from public.ai_questions where question_id = 'question-0001'),
  1, 'and the question was charged once'
);
select is(
  (select calls from public.ai_questions where question_id = 'question-0001'),
  3, 'with its three calls counted'
);
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f1', 'question-0002', 'anthropic/claude-opus-5.5'),
  'model_not_in_plan', 'a free user can''t plan with a premium model'
);
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f1', 'question-0002', 'anthropic/claude-haiku-4.5'),
  'model_not_in_plan', 'nor start a question on a fast model'
);
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f1', 'suggest-0001', 'anthropic/claude-haiku-4.5', 'suggest'),
  'ok', 'except "Suggest with AI", which runs on one'
);
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f1', 'question-0003', 'google/gemini-3.8-flash'),
  'model_unknown', 'a model that isn''t listed is refused'
);
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f1', 'question-0004', 'openai/gpt-6-sol'),
  'ok', 'the third free question'
);
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f1', 'question-0005', 'openai/gpt-6-sol'),
  'quota_reached', 'the fourth is refused'
);
select is(
  (public.ai_begin('00000000-0000-0000-0000-0000000000f1', 'question-0005', 'ask', 'openai/gpt-6-sol', null) ->> 'remaining')::int,
  0, 'with none remaining'
);
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f1', 'question-0004', 'openai/gpt-6-luna'),
  'ok', 'a question already paid for still gets its summary'
);

-- The call cap: 8 calls per question, then a reused name buys nothing.
update public.ai_questions set calls = 8 where question_id = 'question-0004';
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f1', 'question-0004', 'openai/gpt-6-sol'),
  'call_cap', 'a question stops after 8 model calls'
);
update public.ai_questions set calls = 1, created_at = now() - interval '3 hours'
  where question_id = 'question-0004';
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f1', 'question-0004', 'openai/gpt-6-sol'),
  'call_cap', 'and after 2 hours'
);

select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f3', 'question-0100', 'anthropic/claude-sonnet-5'),
  'email_unconfirmed', 'an unconfirmed email gets no hosted questions'
);

-- The spend breaker and the rate limit.
select is(
  public.ai_begin('00000000-0000-0000-0000-0000000000f2', 'question-0200', 'ask', 'anthropic/claude-sonnet-5', 0) ->> 'reason',
  'hosted_paused', 'past the daily budget, hosted AI pauses'
);
insert into public.ai_usage (user_id, question_id, model)
  select '00000000-0000-0000-0000-0000000000f2', 'burst-' || n, 'anthropic/claude-sonnet-5'
  from generate_series(1, 20) n;
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f2', 'question-0201', 'anthropic/claude-sonnet-5'),
  'rate_limited', 'more than 20 calls a minute are refused'
);
delete from public.ai_usage where question_id like 'burst-%';

-- Finishing a call records its tokens and cost, never more.
select lives_ok(
  $$ select public.ai_finish(
       (select max(id) from public.ai_usage where question_id = 'question-0001'), 1200, 300, 800, 0.0054, 200) $$,
  'ai_finish records a call'
);
select results_eq(
  $$ select input_tokens, output_tokens, cache_read_tokens, cost_usd, status from public.ai_usage
     where id = (select max(id) from public.ai_usage where question_id = 'question-0001') $$,
  $$ values (1200, 300, 800, 0.0054::numeric, 200) $$,
  'with its usage'
);
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f2', 'question-0400', 'anthropic/claude-sonnet-5'),
  'ok', 'a question starts'
);
select lives_ok(
  $$ select public.ai_finish(
       (select max(id) from public.ai_usage where question_id = 'question-0400'), 0, 0, 0, 0, 503) $$,
  'its first call fails upstream'
);
select is(
  (select count(*)::int from public.ai_questions where question_id = 'question-0400'),
  0, 'so the question is given back'
);

-- ---- Pro, through the billing webhook ----

select is(
  public.billing_apply('wh_1', 'subscription.active', now() - interval '1 minute',
    '{"user_id": "00000000-0000-0000-0000-0000000000f2", "plan_id": "pro", "status": "active",
      "customer_id": "cus_1", "subscription_id": "sub_1"}'::jsonb
    || jsonb_build_object('period_start', now() - interval '1 day', 'period_end', now() + interval '29 days')),
  'applied', 'a subscription webhook makes a Pro subscription'
);
select is(
  public.billing_apply('wh_1', 'subscription.active', now(), '{}'::jsonb),
  'duplicate', 'a retried delivery is applied once'
);
select is(
  public.billing_apply('wh_0', 'subscription.on_hold', now() - interval '1 hour',
    '{"user_id": "00000000-0000-0000-0000-0000000000f2", "plan_id": "pro", "status": "on_hold"}'),
  'stale', 'an older event arriving late doesn''t undo a newer one'
);
select is(
  public.billing_apply('wh_x', 'payment.succeeded', now(), null),
  'ignored', 'events about anything else are recorded and ignored'
);
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f2', 'question-0300', 'anthropic/claude-opus-5.5'),
  'ok', 'Pro plans with a premium model'
);
select is(
  (select units from public.ai_questions where question_id = 'question-0300'),
  5, 'which uses 5 questions'
);
-- Questions from before this billing period don't count against it.
insert into public.ai_questions (user_id, question_id, kind, model, units, created_at)
  values ('00000000-0000-0000-0000-0000000000f2', 'old-question', 'ask', 'openai/gpt-6-sol', 290,
          now() - interval '40 days');
select is(
  (public.ai_begin('00000000-0000-0000-0000-0000000000f2', 'question-0301', 'ask', 'openai/gpt-6-sol', null) ->> 'remaining')::int,
  294, 'Pro counts only this billing period'
);

select is(
  public.billing_apply('wh_2', 'subscription.cancelled', now(),
    '{"user_id": "00000000-0000-0000-0000-0000000000f2", "plan_id": "pro", "status": "cancelled"}'),
  'applied', 'a cancellation'
);
select is(
  (select plan_id from public.plan_of('00000000-0000-0000-0000-0000000000f2')),
  'pro', 'keeps Pro until the paid period ends'
);
update public.subscriptions set period_end = now() - interval '1 minute'
  where user_id = '00000000-0000-0000-0000-0000000000f2';
select is(
  (select plan_id from public.plan_of('00000000-0000-0000-0000-0000000000f2')),
  'free', 'then falls back to free'
);
select is(
  public.billing_apply('wh_3', 'subscription.renewed', now() + interval '1 second',
    '{"user_id": "00000000-0000-0000-0000-0000000000f2", "plan_id": "pro", "status": "active"}'::jsonb
    || jsonb_build_object('period_start', now(), 'period_end', now() + interval '30 days')),
  'applied', 'resubscribing'
);
select is(
  public.billing_apply('wh_4', 'subscription.on_hold', now() + interval '2 seconds',
    '{"user_id": "00000000-0000-0000-0000-0000000000f2", "plan_id": "pro", "status": "on_hold"}'),
  'applied', 'a failed renewal'
);
select is(
  (select plan_id from public.plan_of('00000000-0000-0000-0000-0000000000f2')),
  'free', 'puts the account on hold, back on free'
);

-- ---- Starter, then a plan change to Pro ----

select is(
  public.billing_apply('wh_s1', 'subscription.active', now(),
    '{"user_id": "00000000-0000-0000-0000-0000000000f4", "plan_id": "starter", "status": "active"}'::jsonb
    || jsonb_build_object('period_start', now() - interval '1 day', 'period_end', now() + interval '29 days')),
  'applied', 'a Starter subscription'
);
select is(
  (public.ai_begin('00000000-0000-0000-0000-0000000000f4', 'starter-0001', 'ask', 'anthropic/claude-sonnet-5', null) ->> 'remaining')::int,
  99, 'Starter has 100 questions a month'
);
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f4', 'starter-0002', 'anthropic/claude-opus-5.5'),
  'model_not_in_plan', 'Starter plans with standard models only'
);
select is(
  public.billing_apply('wh_s2', 'subscription.plan_changed', now() + interval '1 second',
    '{"user_id": "00000000-0000-0000-0000-0000000000f4", "plan_id": "pro", "status": "active"}'),
  'applied', 'upgrading Starter to Pro'
);
select is(
  pg_temp.begin_ask('00000000-0000-0000-0000-0000000000f4', 'starter-0003', 'anthropic/claude-opus-5.5'),
  'ok', 'then premium models work'
);
select is(
  (public.ai_begin('00000000-0000-0000-0000-0000000000f4', 'starter-0004', 'ask', 'openai/gpt-6-sol', null) ->> 'remaining')::int,
  293, 'with Pro''s 300, the Starter questions of this period still counted'
);

-- ---- What signed-in people can see and do ----

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');

select is(
  (public.ai_quota() ->> 'remaining')::int, 0, 'ai_quota tells a free user what''s left'
);
select is(
  (select count(*)::int from public.ai_models), 6, 'anyone reads the listed models, not the rest'
);
select is(
  (select count(*)::int from public.ai_questions), 3, 'a person reads their own questions'
);
select is(
  (select count(*)::int from public.subscriptions), 0, 'and no one else''s subscription'
);
select is(
  (select count(*)::int from public.billing_events), 0, 'nobody reads billing events'
);
select is(
  pg_temp.affected($$ update public.ai_questions set units = 0 $$), 0,
  'nobody edits their own usage'
);
select throws_ok(
  $$ select public.ai_begin('00000000-0000-0000-0000-0000000000f1', 'question-9999', 'ask', 'openai/gpt-6-sol', null) $$,
  '42501', null, 'only the Edge Function may start a question'
);
select throws_ok(
  $$ insert into public.subscriptions (user_id, plan_id, status, event_at)
     values ('00000000-0000-0000-0000-0000000000f1', 'pro', 'active', now()) $$,
  '42501', null, 'nobody gives themselves Pro'
);

select * from finish();
rollback;
