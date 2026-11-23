begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

-- Ask Grimoire (#1253): a routed turn is free only when the DM ran the generator. settle_ask_routes confirms a route
-- against a generation charged after it (one route per charge) and meters every other one by its tokens.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12530000-0000-4000-8000-0000000001a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'route-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12530000-0000-4000-8000-0000000001a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'route-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name, game_system)
values ('12530000-0000-4000-8000-0000000001b1', '12530000-0000-4000-8000-0000000001a1', 'Route campaign', 'dnd5e-2014');
insert into public.agent_sessions (id, user_id, campaign_id, kind, provider, model)
values ('12530000-0000-4000-8000-0000000001c1', '12530000-0000-4000-8000-0000000001a1', '12530000-0000-4000-8000-0000000001b1', 'ask', 'openai', 'gpt-test');
-- Today's free answers are spent, so an unconfirmed route is metered.
insert into public.ask_usage (user_id, day, free_used, carry)
values ('12530000-0000-4000-8000-0000000001a1', (now() at time zone 'utc')::date, 5, 0);

-- Two routes, oldest first, both before the one charged generation.
insert into public.ask_pending_routes (proposal_id, user_id, session_id, credits, created_at)
values
  ('12530000-0000-4000-8000-0000000001d1', '12530000-0000-4000-8000-0000000001a1', '12530000-0000-4000-8000-0000000001c1', 0.7, now() - interval '30 minutes'),
  ('12530000-0000-4000-8000-0000000001d2', '12530000-0000-4000-8000-0000000001a1', '12530000-0000-4000-8000-0000000001c1', 0.6, now() - interval '20 minutes');
insert into public.ai_credit_ledger (id, user_id, delta, reason, created_at)
values
  -- A free line, an Ask line, and another account's spend never confirm.
  ('12530000-0000-4000-8000-0000000001e0', '12530000-0000-4000-8000-0000000001a1', 0, 'npc_text', now() - interval '25 minutes'),
  ('12530000-0000-4000-8000-0000000001e9', '12530000-0000-4000-8000-0000000001a1', -1, 'ask_answer', now() - interval '25 minutes'),
  ('12530000-0000-4000-8000-0000000001e2', '12530000-0000-4000-8000-0000000001a2', -1, 'npc_text', now() - interval '25 minutes'),
  -- The one real generation, after d1 and d2.
  ('12530000-0000-4000-8000-0000000001e1', '12530000-0000-4000-8000-0000000001a1', -1, 'npc_text', now() - interval '25 minutes');

-- A signed-in account cannot settle (or so dodge) anything.
set local role authenticated;
set local request.jwt.claims to '{"sub": "12530000-0000-4000-8000-0000000001a1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.settle_ask_routes('12530000-0000-4000-8000-0000000001a1', 5) $$,
  '42501', null, 'only the server settles routes'
);
select isnt_empty(
  $$ select 1 from public.ask_pending_routes where user_id = '12530000-0000-4000-8000-0000000001a1' $$,
  'positive control: the owner reads their own pending routes'
);
set local request.jwt.claims to '{"sub": "12530000-0000-4000-8000-0000000001a2", "role": "authenticated"}';
select is_empty(
  $$ select 1 from public.ask_pending_routes where user_id = '12530000-0000-4000-8000-0000000001a1' $$,
  'another account cannot read them'
);
reset role;

select is(
  (select row(credits, free_left)::text from public.settle_ask_routes('12530000-0000-4000-8000-0000000001a1', 5)),
  row(0, 0)::text, 'one route confirmed and one metered at 0.6 owes no whole credit yet'
);
select is_empty(
  $$ select 1 from public.ai_credit_ledger where user_id = '12530000-0000-4000-8000-0000000001a1' and reason = 'ask_answer' and created_at = now() $$,
  'nothing is charged while what is owed is under a whole credit'
);
select is_empty(
  $$ select 1 from public.ask_pending_routes where proposal_id = '12530000-0000-4000-8000-0000000001d2' $$,
  'one generation confirms one route: the next unconfirmed one is settled and removed'
);
select is(
  (select carry from public.ask_usage where user_id = '12530000-0000-4000-8000-0000000001a1'),
  0.6::numeric, 'the settled route is metered by its tokens, not counted as a whole credit'
);
-- Bug caught: confirmed routes kept for ever, so every settlement walks an account's whole history.
select is_empty(
  $$ select 1 from public.ask_pending_routes where proposal_id = '12530000-0000-4000-8000-0000000001d1' $$,
  'a confirmed route is removed once no open route is older than the charge that confirmed it'
);

-- A route made a minute ago with nothing charged yet: its generator may still be painting, so it is left open, not
-- metered.
insert into public.ask_pending_routes (proposal_id, user_id, session_id, credits, created_at)
values ('12530000-0000-4000-8000-0000000001d3', '12530000-0000-4000-8000-0000000001a1', '12530000-0000-4000-8000-0000000001c1', 0.5, now() - interval '1 minute');
select is(
  (select credits from public.settle_ask_routes('12530000-0000-4000-8000-0000000001a1', 5)),
  0, 'a route whose generator may still be running is not metered'
);
select isnt_empty(
  $$ select 1 from public.ask_pending_routes where proposal_id = '12530000-0000-4000-8000-0000000001d3' and confirmed_at is null $$,
  'it stays open for a later turn'
);

-- Past the window, nothing confirmed it, and with the carry at 0.6 its 0.5 takes the meter past one whole credit.
update public.ask_pending_routes set created_at = now() - interval '11 minutes' where proposal_id = '12530000-0000-4000-8000-0000000001d3';
select is(
  (select credits from public.settle_ask_routes('12530000-0000-4000-8000-0000000001a1', 5)),
  1, 'unconfirmed routes add up on the meter: 0.6 and 0.5 charge one credit'
);
-- Bug caught: the owed credit returned for the turn to spend later, under a hold that could be refused after the
-- routes were already deleted, so the debt was never written.
select is(
  (select sum(delta) from public.ai_credit_ledger
   where user_id = '12530000-0000-4000-8000-0000000001a1' and reason = 'ask_answer' and created_at = now()),
  -1::numeric, 'settlement charges what the routes owe itself, in the same transaction that removes them'
);

-- Bug caught: a confirmed route removed while an older open route could still match its charge, which would let one
-- generation confirm two routes.
insert into public.ai_credit_ledger (id, user_id, delta, reason, created_at)
values ('12530000-0000-4000-8000-0000000001e3', '12530000-0000-4000-8000-0000000001a1', -1, 'npc_text', now() - interval '1 minute');
insert into public.ask_pending_routes (proposal_id, user_id, session_id, credits, created_at, confirmed_at, confirmed_by)
values
  ('12530000-0000-4000-8000-0000000001d4', '12530000-0000-4000-8000-0000000001a1', '12530000-0000-4000-8000-0000000001c1', 0.4, now() - interval '3 minutes', null, null),
  ('12530000-0000-4000-8000-0000000001d5', '12530000-0000-4000-8000-0000000001a1', '12530000-0000-4000-8000-0000000001c1', 0.4, now() - interval '2 minutes', now(), '12530000-0000-4000-8000-0000000001e3');
select * from public.settle_ask_routes('12530000-0000-4000-8000-0000000001a1', 5);
select isnt_empty(
  $$ select 1 from public.ask_pending_routes where proposal_id = '12530000-0000-4000-8000-0000000001d5' $$,
  'a confirmed route is kept while an open route older than its charge remains'
);

select * from finish();
rollback;
