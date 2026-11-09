-- Release hardening (PRD D124, supabase/migrations/…_hardening.sql): hosted AI spend limits, paid
-- plans that end on a refund or a lost webhook, account deletion with a live subscription, the
-- encrypted storage quota and the dashboard cap. Runs against the local Supabase. Rolls back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'eve@example.com', now(), '{"full_name": "Eve Free"}'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated',
   'authenticated', 'pia@example.com', now(), '{"full_name": "Pia Pro"}');

create function pg_temp.act_as(person uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', person, 'role', 'authenticated')::text, true)
$$;

create function pg_temp.ask(person uuid, question text, model text)
returns text language sql as $$
  select public.ai_begin(person, question, 'ask', model, null) ->> 'reason'
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

set local role service_role;

-- ---- Pia on Pro ----

select is(
  public.billing_apply('wh_h1', 'subscription.active', now() - interval '1 hour',
    '{"user_id": "00000000-0000-0000-0000-0000000000e2", "plan_id": "pro", "status": "active",
      "customer_id": "cus_h", "subscription_id": "sub_h", "period_end": "2099-01-01T00:00:00Z"}'::jsonb),
  'applied', 'Pia subscribes to Pro'
);

-- ---- A question's later calls stay at the price it was charged ----

select is(pg_temp.ask('00000000-0000-0000-0000-0000000000e2', 'std-question-1', 'anthropic/claude-sonnet-5'),
  'ok', 'a question on a standard model (1 question)');
select is(pg_temp.ask('00000000-0000-0000-0000-0000000000e2', 'std-question-1', 'anthropic/claude-opus-5.5'),
  'model_not_paid', 'its repair can''t switch to a premium model it didn''t pay for');
select is(pg_temp.ask('00000000-0000-0000-0000-0000000000e2', 'std-question-1', 'anthropic/claude-haiku-4.5'),
  'ok', 'its summary, on a fast model, still can');
select is(pg_temp.ask('00000000-0000-0000-0000-0000000000e2', 'pre-question-1', 'anthropic/claude-opus-5.5'),
  'ok', 'a premium question (5 questions)');
select is(pg_temp.ask('00000000-0000-0000-0000-0000000000e2', 'pre-question-1', 'openai/gpt-6-astra'),
  'ok', 'repairs within what it paid for');

-- ---- A question's spend limit ----

update public.ai_usage set cost_usd = 0.16 where question_id = 'std-question-1';
select is(pg_temp.ask('00000000-0000-0000-0000-0000000000e2', 'std-question-1', 'anthropic/claude-sonnet-5'),
  'question_budget', 'a standard question stops at $0.15');
update public.ai_usage set cost_usd = 0.16 where question_id = 'pre-question-1';
select is(pg_temp.ask('00000000-0000-0000-0000-0000000000e2', 'pre-question-1', 'anthropic/claude-opus-5.5'),
  'ok', 'a premium one has more room ($0.75)');

-- ---- A person's daily limit ----

insert into public.ai_usage (user_id, question_id, model, cost_usd)
  values ('00000000-0000-0000-0000-0000000000e1', 'spent-today-1', 'anthropic/claude-sonnet-5', 0.5);
select is(pg_temp.ask('00000000-0000-0000-0000-0000000000e1', 'eve-question-1', 'anthropic/claude-sonnet-5'),
  'daily_limit', 'past $0.50 in a day, a free account waits until tomorrow');
update public.ai_usage set at = now() - interval '25 hours' where question_id = 'spent-today-1';
select is(pg_temp.ask('00000000-0000-0000-0000-0000000000e1', 'eve-question-1', 'anthropic/claude-sonnet-5'),
  'ok', 'and the next day it asks again');
select is(pg_temp.ask('00000000-0000-0000-0000-0000000000e2', 'pia-question-9', 'anthropic/claude-sonnet-5'),
  'ok', 'Pia''s spend doesn''t count against Eve''s, or the reverse');

-- ---- Payments, refunds and disputes ----

select is(
  public.billing_apply('wh_p1', 'payment.succeeded', now() - interval '50 minutes',
    '{"kind": "payment", "payment_id": "pay_1", "user_id": "00000000-0000-0000-0000-0000000000e2",
      "subscription_id": "sub_h"}'::jsonb),
  'applied', 'a payment is remembered with its person'
);
select is(
  public.billing_apply('wh_p2', 'payment.succeeded', now() - interval '40 minutes',
    '{"kind": "payment", "payment_id": "pay_2", "subscription_id": "sub_h"}'::jsonb),
  'applied', 'or found through its subscription'
);
select is(
  public.billing_apply('wh_p3', 'payment.succeeded', now(),
    '{"kind": "payment", "payment_id": "pay_3", "subscription_id": "sub_unknown"}'::jsonb),
  'ignored', 'a payment that isn''t ours is ignored'
);
select is(
  public.billing_apply('wh_r0', 'refund.succeeded', now(),
    '{"kind": "revoke", "payment_id": "pay_unknown"}'::jsonb),
  'ignored', 'so is a refund of one'
);
select is(
  public.billing_apply('wh_r1', 'refund.succeeded', now() - interval '30 minutes',
    '{"kind": "revoke", "payment_id": "pay_1"}'::jsonb),
  'applied', 'a full refund of Pia''s payment…'
);
select is(
  (select plan_id from public.plan_of('00000000-0000-0000-0000-0000000000e2')),
  'free', '…ends Pro at once'
);
select is(
  public.billing_apply('wh_late', 'subscription.active', now() - interval '45 minutes',
    '{"user_id": "00000000-0000-0000-0000-0000000000e2", "plan_id": "pro", "status": "active"}'::jsonb),
  'stale', 'an older delivery arriving late doesn''t bring it back'
);
select is(
  public.billing_apply('wh_renew', 'subscription.renewed', now(),
    '{"user_id": "00000000-0000-0000-0000-0000000000e2", "plan_id": "pro", "status": "active",
      "period_end": "2099-02-01T00:00:00Z"}'::jsonb),
  'applied', 'a new payment (a renewal) does'
);

-- ---- A lost webhook can't give a plan for ever ----

update public.subscriptions set period_end = now() - interval '2 days'
  where user_id = '00000000-0000-0000-0000-0000000000e2';
select is((select plan_id from public.plan_of('00000000-0000-0000-0000-0000000000e2')),
  'pro', 'a renewal a day or two late keeps Pro');
update public.subscriptions set period_end = now() - interval '4 days'
  where user_id = '00000000-0000-0000-0000-0000000000e2';
select is((select plan_id from public.plan_of('00000000-0000-0000-0000-0000000000e2')),
  'free', 'past 3 days with no webhook, it ends');

-- ---- Encrypted storage and dashboards, as the people themselves ----

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');

select is(
  (select count(*)::int from public.billing_payments), 0, 'nobody reads payments'
);
select lives_ok(
  $$ insert into public.vaults (kdf, wrapped_key, recovery_wrapped_key)
     values ('{"alg": "PBKDF2-SHA256", "iterations": 600000, "salt": "c2FsdA=="}',
             '{"iv": "aXY=", "data": "d3JhcHBlZA=="}', '{"iv": "aXY=", "data": "cmVjb3Zlcnk="}') $$,
  'Eve sets up her vault'
);
select throws_ok(
  $$ select public.vault_reserve('tiny-but-many', 1, 100000) $$,
  '22023', null, '1 byte can''t reserve 100,000 chunks'
);
select is(
  public.vault_reserve('eve-file-0001', 4194363, 2) ->> 'ok', 'true',
  'the chunks a file''s size needs (4 MiB + 1 byte: 2 chunks)'
);
insert into storage.objects (bucket_id, name)
  values ('vault', '00000000-0000-0000-0000-0000000000e1/eve-file-0001/0');
select is(
  pg_temp.affected($$ delete from public.vault_files $$), 0,
  'a reservation can''t be deleted directly'
);
select is(public.vault_release('eve-file-0001'), false, 'nor released while a chunk remains');
-- What the Storage API does when the app deletes a chunk (SQL deletes are guarded otherwise).
do $$ begin perform set_config('storage.allow_delete_query', 'true', true); end $$;
delete from storage.objects
  where bucket_id = 'vault' and name = '00000000-0000-0000-0000-0000000000e1/eve-file-0001/0';
select is(public.vault_release('eve-file-0001'), true, 'once its chunks are gone, it''s released');

select lives_ok(
  $$ insert into public.dashboards (name, doc) select 'Board ' || n, '{}' from generate_series(1, 100) n $$,
  'an owner shares 100 dashboards'
);
select throws_ok(
  $$ insert into public.dashboards (name, doc) values ('One too many', '{}') $$,
  'P0001', 'too_many_dashboards', 'the 101st is refused'
);

-- ---- Deleting an account with a live subscription ----

reset role;
update public.subscriptions set status = 'active', period_end = now() + interval '20 days'
  where user_id = '00000000-0000-0000-0000-0000000000e2';
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e2');
select throws_ok(
  $$ select public.delete_my_account() $$,
  'P0001', 'subscription_active', 'Pia can''t delete her account while Pro still charges'
);

select * from finish();
rollback;
