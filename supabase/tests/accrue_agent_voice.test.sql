begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- A voiced line is charged on its conversation like a turn (#1021): exactly, with only whole credits billed.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('12210000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'voice-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name, game_system)
values ('12210000-0000-4000-8000-0000000000b1', '12210000-0000-4000-8000-0000000000a1', 'Voice campaign', 'dnd5e-2014');
insert into public.agent_sessions (id, user_id, campaign_id, kind, provider, model)
values ('12210000-0000-4000-8000-0000000000c1', '12210000-0000-4000-8000-0000000000a1', '12210000-0000-4000-8000-0000000000b1', 'solo_table', 'openai', 'gpt-test');

-- Three lines of 0.4 each: 0.4, 0.8, 1.2. Only the third crosses a whole credit.
select is(public.accrue_agent_voice('12210000-0000-4000-8000-0000000000c1', 0.4), 0, 'a line under a whole credit bills nothing yet');
select is(public.accrue_agent_voice('12210000-0000-4000-8000-0000000000c1', 0.4), 0, 'nor does the second');
select is(public.accrue_agent_voice('12210000-0000-4000-8000-0000000000c1', 0.4), 1, 'the line that takes the running total past a whole credit bills that one credit');
select is(
  (select credits_spent from public.agent_sessions where id = '12210000-0000-4000-8000-0000000000c1'),
  1.2::numeric, 'the conversation holds the exact total, so nothing is lost or billed twice'
);

-- A line and a turn share the one running total: 1.2 so far, a turn of 0.9 makes 2.1 and bills the second credit.
select is(
  public.append_agent_turns('12210000-0000-4000-8000-0000000000c1', 0,
    '[{"role": "user", "blocks": [{"type": "text", "text": "I listen."}]}]'::jsonb, 0.9),
  1, 'a turn after voiced lines bills from the same total, so a credit is never claimed by both'
);

select throws_ok(
  $$ select public.accrue_agent_voice('12210000-0000-4000-8000-0000000000c1', -1) $$,
  '22023', null, 'a negative cost is refused: a line can never give credits back'
);
select throws_ok(
  $$ select public.accrue_agent_voice('12210000-0000-4000-8000-0000000000c9', 0.4) $$,
  'P0002', null, 'a conversation that does not exist is refused'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12210000-0000-4000-8000-0000000000a1', true);
select throws_ok(
  $$ select public.accrue_agent_voice('12210000-0000-4000-8000-0000000000c1', 0) $$,
  '42501', null, 'the owner cannot call it: only the server charges a line'
);

select * from finish();
rollback;
