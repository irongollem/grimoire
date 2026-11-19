begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

-- A finished turn is saved whole, in order, and counted (#1205).

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('12050000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'append-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name, game_system)
values ('12050000-0000-4000-8000-0000000000b1', '12050000-0000-4000-8000-0000000000a1', 'Append campaign', 'dnd5e-2014');
insert into public.agent_sessions (id, user_id, campaign_id, kind, provider, model)
values ('12050000-0000-4000-8000-0000000000c1', '12050000-0000-4000-8000-0000000000a1', '12050000-0000-4000-8000-0000000000b1', 'solo_table', 'openai', 'gpt-test');

-- A turn of two messages: the player's, and the model's with the tokens its call used. It accrued 0.4 of a credit.
select is(
  public.append_agent_turns(
    '12050000-0000-4000-8000-0000000000c1', 0,
    '[{"role": "user", "blocks": [{"type": "text", "text": "I open the door."}]},
      {"role": "assistant", "blocks": [{"type": "text", "text": "It creaks."}], "provider": "openai", "model": "gpt-test",
       "input_tokens": 1000, "output_tokens": 50, "cache_read_tokens": 4000, "cache_write_tokens": 0}]'::jsonb,
    0.4),
  0, 'a turn that leaves the running total under one credit bills nothing'
);
select is(
  (select max(seq) from public.agent_turns where session_id = '12050000-0000-4000-8000-0000000000c1'),
  2, 'and its two messages took seq 1 and 2'
);
select is(
  (select array_agg(role order by seq) from public.agent_turns where session_id = '12050000-0000-4000-8000-0000000000c1'),
  array['user', 'assistant'], 'in the order they were given'
);
select is(
  (select count(distinct user_id)::integer from public.agent_turns
    where session_id = '12050000-0000-4000-8000-0000000000c1' and user_id = '12050000-0000-4000-8000-0000000000a1'),
  1, 'every message belongs to the conversation''s owner, taken from the session'
);
select results_eq(
  $$ select input_tokens, output_tokens, cache_read_tokens, credits_spent from public.agent_sessions where id = '12050000-0000-4000-8000-0000000000c1' $$,
  $$ values (1000::bigint, 50::bigint, 4000::bigint, 0.4::numeric(14, 6)) $$,
  'the session''s totals rise by exactly what the turn used and accrued'
);

-- A second tab that still believes the conversation is empty.
select throws_ok(
  $$ select public.append_agent_turns('12050000-0000-4000-8000-0000000000c1', 0,
       '[{"role": "user", "blocks": [{"type": "text", "text": "I close it."}]}]'::jsonb, 0.3) $$,
  '40001', null, 'a turn written against a conversation that has moved on is refused'
);
select results_eq(
  $$ select (select count(*)::integer from public.agent_turns where session_id = '12050000-0000-4000-8000-0000000000c1'), credits_spent
       from public.agent_sessions where id = '12050000-0000-4000-8000-0000000000c1' $$,
  $$ values (2, 0.4::numeric(14, 6)) $$,
  'and the refused turn wrote nothing and counted nothing'
);

select throws_ok(
  $$ select public.append_agent_turns('12050000-0000-4000-8000-0000000000c1', 2, '[]'::jsonb, 0) $$,
  '22023', null, 'an empty turn is refused'
);
select throws_ok(
  $$ select public.append_agent_turns('12050000-0000-4000-8000-0000000000c9', 0,
       '[{"role": "user", "blocks": []}]'::jsonb, 0) $$,
  'P0002', null, 'a conversation that does not exist is refused'
);

-- 0.4 so far. A turn that accrues 0.7 takes the total to 1.1: one whole credit is new.
select is(
  public.append_agent_turns('12050000-0000-4000-8000-0000000000c1', 2,
    '[{"role": "user", "blocks": [{"type": "text", "text": "I listen."}]}]'::jsonb, 0.7),
  1, 'the turn that takes the running total past a whole credit bills that one credit'
);
-- 1.1 so far. 0.9 more is exactly 2.0: reaching a whole credit is crossing it. Then 2.5 more is 4.5: two at once.
select is(
  public.append_agent_turns('12050000-0000-4000-8000-0000000000c1', 3,
    '[{"role": "user", "blocks": [{"type": "text", "text": "I wait."}]}]'::jsonb, 0.9),
  1, 'a total that lands exactly on a whole credit bills it'
);
select is(
  public.append_agent_turns('12050000-0000-4000-8000-0000000000c1', 4,
    '[{"role": "user", "blocks": [{"type": "text", "text": "I wait longer."}]}]'::jsonb, 2.5),
  2, 'a long turn that crosses two whole credits bills both, and the half stays accrued'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12050000-0000-4000-8000-0000000000a1', true);
select throws_ok(
  $$ select public.append_agent_turns('12050000-0000-4000-8000-0000000000c1', 5,
       '[{"role": "assistant", "blocks": [{"type": "text", "text": "You win."}]}]'::jsonb, 0) $$,
  '42501', null, 'the owner cannot call it: only the server appends'
);

select * from finish();
rollback;
