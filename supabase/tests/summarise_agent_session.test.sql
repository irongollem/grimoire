begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- The story so far is stored with the point it covers, counted, and never moved backwards (#1205).

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('12050000-0000-4000-8000-0000000001a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'summary-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name, game_system)
values ('12050000-0000-4000-8000-0000000001b1', '12050000-0000-4000-8000-0000000001a1', 'Summary campaign', 'dnd5e-2014');
insert into public.agent_sessions (id, user_id, campaign_id, kind, provider, model, credits_spent)
values ('12050000-0000-4000-8000-0000000001c1', '12050000-0000-4000-8000-0000000001a1', '12050000-0000-4000-8000-0000000001b1', 'solo_table', 'openai', 'gpt-test', 0.8);
insert into public.agent_turns (session_id, user_id, seq, role, blocks)
select '12050000-0000-4000-8000-0000000001c1', '12050000-0000-4000-8000-0000000001a1', n,
       case when n % 2 = 1 then 'user' else 'assistant' end, '[{"type": "text", "text": "..."}]'::jsonb
from generate_series(1, 6) n;

-- 0.8 accrued so far; the summary call accrues 0.3, which takes the total to 1.1.
select is(
  public.summarise_agent_session('12050000-0000-4000-8000-0000000001c1', 0, 4, 'The party opened the door.', 900, 120, 300, 0, 0.3),
  1, 'a summary that takes the running total past a whole credit bills that one credit'
);
select results_eq(
  $$ select summary, summary_through_seq, input_tokens, output_tokens, cache_read_tokens, credits_spent
       from public.agent_sessions where id = '12050000-0000-4000-8000-0000000001c1' $$,
  $$ values ('The party opened the door.', 4, 900::bigint, 120::bigint, 300::bigint, 1.1::numeric(14, 6)) $$,
  'the summary, the point it covers, its tokens and what it accrued land together'
);
select is(
  (select count(*)::integer from public.agent_turns where session_id = '12050000-0000-4000-8000-0000000001c1'),
  6, 'and no message is removed: the summary changes what is sent, not what was said'
);

-- A second summary that still believes nothing was covered: it would put an older summary over a newer one.
select throws_ok(
  $$ select public.summarise_agent_session('12050000-0000-4000-8000-0000000001c1', 0, 2, 'Older.', 10, 10, 0, 0, 0.5) $$,
  '40001', null, 'a summary written against a point that has moved on is dropped'
);
select results_eq(
  $$ select summary, summary_through_seq, credits_spent from public.agent_sessions where id = '12050000-0000-4000-8000-0000000001c1' $$,
  $$ values ('The party opened the door.', 4, 1.1::numeric(14, 6)) $$,
  'and the dropped one changed nothing and counted nothing'
);

select throws_ok(
  $$ select public.summarise_agent_session('12050000-0000-4000-8000-0000000001c1', 4, 4, 'Same point.', 0, 0, 0, 0, 0) $$,
  '22023', null, 'a summary that covers no more than the last one is refused'
);
select throws_ok(
  $$ select public.summarise_agent_session('12050000-0000-4000-8000-0000000001c1', 4, 7, 'Past the end.', 0, 0, 0, 0, 0) $$,
  '22023', null, 'a summary may not cover a message that is not stored: the model would never be sent it'
);
select throws_ok(
  $$ select public.summarise_agent_session('12050000-0000-4000-8000-0000000001c1', 4, 6, '   ', 0, 0, 0, 0, 0) $$,
  '22023', null, 'an empty summary is refused: it would hide the conversation behind nothing'
);
select throws_ok(
  $$ select public.summarise_agent_session('12050000-0000-4000-8000-0000000001c1', 4, 6, 'Fine.', 0, 0, 0, 0, -1) $$,
  '22023', null, 'a negative accrual is refused: it would hand credits back'
);
select throws_ok(
  $$ select public.summarise_agent_session('12050000-0000-4000-8000-0000000001c9', 0, 1, 'Nobody.', 0, 0, 0, 0, 0) $$,
  'P0002', null, 'a conversation that does not exist is refused'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12050000-0000-4000-8000-0000000001a1', true);
select throws_ok(
  $$ select public.summarise_agent_session('12050000-0000-4000-8000-0000000001c1', 4, 6, 'Mine now.', 0, 0, 0, 0, 0) $$,
  '42501', null, 'the owner cannot call it: only the server writes the story so far'
);

select * from finish();
rollback;
