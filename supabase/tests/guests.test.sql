-- Guests (PRD D125, supabase/migrations/…_guests.sql): HushGlance AI without an account, counted
-- per keyed IP hash: the daily allowance, its limits and spend caps, giving back a failed question,
-- forgetting hashes after 2 days, and no client access. Runs against the local Supabase. Rolls back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- Two guests (64 hex characters each: HMAC-SHA256 of an address, made by the ai Edge Function).
create function pg_temp.g(n integer) returns text language sql as $$
  select repeat(to_hex(n), 64)
$$;

create function pg_temp.ask(visitor text, question text, model text, kind text default 'ask')
returns text language sql as $$
  select public.guest_begin(visitor, question, kind, model, null) ->> 'reason'
$$;

-- A signed-in person, for the global budget.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'ana@example.com', now());

set local role service_role;

-- ---- The daily allowance ----

select is(
  public.guest_begin(pg_temp.g(1), 'guest-question-1', 'ask', 'anthropic/claude-sonnet-5', null)
    ->> 'remaining',
  '2', 'a guest''s first question leaves 2'
);
select is(pg_temp.ask(pg_temp.g(1), 'guest-question-1', 'anthropic/claude-haiku-4.5'),
  'ok', 'its summary, on a fast model, is part of the same question');
select is(pg_temp.ask(pg_temp.g(1), 'guest-question-2', 'openai/gpt-6-sol'), 'ok', 'a second');
select is(pg_temp.ask(pg_temp.g(1), 'guest-question-3', 'anthropic/claude-sonnet-5'), 'ok', 'a third');
select is(pg_temp.ask(pg_temp.g(1), 'guest-question-4', 'anthropic/claude-sonnet-5'),
  'quota_reached', 'a fourth in the same day is refused');
select is(pg_temp.ask(pg_temp.g(2), 'guest-question-1', 'anthropic/claude-sonnet-5'),
  'ok', 'another address has its own allowance, even for the same question id');

select is(
  (public.guest_quota(pg_temp.g(1)) - 'renews_at'),
  '{"plan": "guest", "label": "Guest", "questions": 3, "period": "day", "used": 3,
    "remaining": 0, "tiers": ["standard"], "status": null, "has_customer": false}'::jsonb,
  'guest_quota has ai_quota''s shape'
);
select ok(
  (public.guest_quota(pg_temp.g(1)) ->> 'renews_at')::timestamptz
    between now() + interval '23 hours' and now() + interval '1 day',
  'and says when the oldest question stops counting'
);
select is(public.guest_quota(pg_temp.g(3)) ->> 'renews_at', null, 'none used: nothing to renew');

-- A question counts for 24 hours, then it's free again.
update public.guest_questions set created_at = now() - interval '25 hours'
  where guest = pg_temp.g(1) and question_id = 'guest-question-1';
select is(pg_temp.ask(pg_temp.g(1), 'guest-question-4', 'anthropic/claude-sonnet-5'),
  'ok', 'a day later, the oldest one no longer counts');
select is(pg_temp.ask(pg_temp.g(1), 'guest-question-1', 'anthropic/claude-sonnet-5'),
  'call_cap', 'and that old question can''t be continued');

-- ---- What guests may ask with ----

select is(pg_temp.ask(pg_temp.g(3), 'guest-premium-1', 'anthropic/claude-opus-5.5'),
  'model_not_in_plan', 'premium models are for Pro');
select is(pg_temp.ask(pg_temp.g(3), 'guest-fast-1', 'openai/gpt-6-luna'),
  'model_not_in_plan', 'a fast model can''t start a question');
select is(pg_temp.ask(pg_temp.g(3), 'guest-fast-1', 'openai/gpt-6-luna', 'suggest'),
  'ok', 'except "Suggest with AI"');
select is(pg_temp.ask(pg_temp.g(3), 'guest-unknown-1', 'someone/else'),
  'model_unknown', 'an unlisted model');
select throws_ok(
  $$ select public.guest_begin('203.0.113.7', 'guest-raw-ip-1', 'ask', 'anthropic/claude-sonnet-5', null) $$,
  '22023', 'guest_invalid', 'an address itself is never accepted, only its hash'
);

-- ---- A failed first call gives the question back ----

select is(pg_temp.ask(pg_temp.g(4), 'guest-failed-1', 'anthropic/claude-sonnet-5'), 'ok', 'asked');
select public.ai_finish(
  (select id from public.ai_usage where guest = pg_temp.g(4) and question_id = 'guest-failed-1'),
  0, 0, 0, 0, 502
);
select is(public.guest_used(pg_temp.g(4)), 0, 'OpenRouter failed: the question isn''t counted');
select is(
  (select cost_usd from public.ai_usage where guest = pg_temp.g(4)), 0::numeric,
  'and its call records no cost'
);

-- ---- Spend limits ----

update public.ai_usage set cost_usd = 0.16 where guest = pg_temp.g(2);
select is(pg_temp.ask(pg_temp.g(2), 'guest-question-1', 'anthropic/claude-sonnet-5'),
  'question_budget', 'a question stops at its spend limit');
update public.ai_usage set cost_usd = 0.25 where guest = pg_temp.g(2);
select is(pg_temp.ask(pg_temp.g(2), 'guest-question-9', 'anthropic/claude-sonnet-5'),
  'daily_limit', 'an address stops for the day at $0.25');

update public.guest_limits set total_daily_usd = 0.5;
update public.ai_usage set cost_usd = 0.3 where guest = pg_temp.g(1) and question_id = 'guest-question-2';
select is(pg_temp.ask(pg_temp.g(5), 'guest-question-1', 'anthropic/claude-sonnet-5'),
  'guests_paused', 'all guests together stop at their own budget');

-- Guests' spend counts towards the breaker that pauses hosted AI for everyone.
select is(
  public.ai_begin('00000000-0000-0000-0000-0000000000a1', 'user-question-1', 'ask',
    'anthropic/claude-sonnet-5', 0.5) ->> 'reason',
  'hosted_paused', 'a signed-in question sees the guests'' spend in the global budget'
);

update public.guest_limits set questions = 0;
select is(pg_temp.ask(pg_temp.g(6), 'guest-question-1', 'anthropic/claude-sonnet-5'),
  'guests_off', 'questions = 0 turns guests off');
update public.guest_limits set questions = 3, total_daily_usd = 5;

-- ---- A call has a person or a guest, never both ----

select throws_ok(
  $$ insert into public.ai_usage (user_id, guest, question_id, model)
     values ('00000000-0000-0000-0000-0000000000a1', repeat('a', 64), 'both-question-1',
       'anthropic/claude-sonnet-5') $$,
  '23514', 'new row for relation "ai_usage" violates check constraint "ai_usage_one_caller"',
  'a call can''t name both a person and a guest'
);

-- ---- Hashes are forgotten after 2 days ----

update public.ai_usage set at = now() - interval '3 days' where guest = pg_temp.g(3);
update public.guest_questions set created_at = now() - interval '3 days' where guest = pg_temp.g(3);
select is(pg_temp.ask(pg_temp.g(7), 'guest-question-1', 'anthropic/claude-sonnet-5'), 'ok',
  'any guest''s call clears what is older than 2 days');
select is(
  (select count(*)::integer from public.ai_usage where guest is null and user_id is null), 1,
  'the old call stays (its cost counts), with no hash'
);
select is(
  (select count(*)::integer from public.ai_usage where guest = pg_temp.g(3)), 0,
  'no call keeps the old hash'
);
select is(
  (select count(*)::integer from public.guest_questions where guest = pg_temp.g(3)), 0,
  'nor any question'
);

-- ---- Clients can't read or call any of it ----

reset role;
select is(
  (select command from cron.job where jobname = 'hushglance-guest-forget'),
  'select public.guest_forget()', 'and every hour, even when no guest asks'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
select is((select count(*)::integer from public.guest_questions), 0, 'no one reads guests'' questions');
select throws_ok(
  $$ select public.guest_begin(repeat('b', 64), 'guest-question-1', 'ask', 'anthropic/claude-sonnet-5', null) $$,
  '42501', 'permission denied for function guest_begin', 'a signed-in person can''t charge a guest'
);

select * from finish();
rollback;
