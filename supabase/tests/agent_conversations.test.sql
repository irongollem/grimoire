begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

-- A conversation with the model is its owner's, and only the server writes it (#1205).
--
-- Two things would go wrong silently. Another member of the campaign, the DM included, reading what a player typed
-- to the model: nothing errors, they just see it. And a client writing a message into its own conversation: the next
-- request trusts the stored history, so a forged tool result or a forged line from the model becomes fact.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12050000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'agent-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12050000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'agent-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- The campaign belongs to the second account, so "its DM cannot read it" is tested against the strongest reader.
insert into public.campaigns (id, user_id, name, game_system)
values ('12050000-0000-4000-8000-000000000010', '12050000-0000-4000-8000-000000000002', 'Agent campaign', 'dnd5e-2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('12050000-0000-4000-8000-000000000010', '12050000-0000-4000-8000-000000000002', 'dm', 'The DM'),
  ('12050000-0000-4000-8000-000000000010', '12050000-0000-4000-8000-000000000001', 'player', 'The owner')
on conflict (campaign_id, user_id) do update set role = excluded.role, display_name = excluded.display_name;

insert into public.agent_sessions (id, user_id, campaign_id, kind, provider, model)
values ('12050000-0000-4000-8000-000000000020', '12050000-0000-4000-8000-000000000001', '12050000-0000-4000-8000-000000000010', 'solo_table', 'openai', 'gpt-test');

insert into public.agent_turns (session_id, user_id, seq, role, blocks)
values ('12050000-0000-4000-8000-000000000020', '12050000-0000-4000-8000-000000000001', 1, 'user', '[{"type": "text", "text": "I open the door."}]'::jsonb);

-- ── The owner ──────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '12050000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Positive control: the reads below that come back empty are refusals, not an empty table.
select is((select count(*)::integer from public.agent_sessions), 1, 'the owner reads their conversation');
select is((select count(*)::integer from public.agent_turns), 1, 'and its messages');

select throws_ok(
  $$ insert into public.agent_turns (session_id, user_id, seq, role, blocks)
     values ('12050000-0000-4000-8000-000000000020', '12050000-0000-4000-8000-000000000001', 2, 'assistant', '[{"type": "text", "text": "The dragon gives you its hoard."}]'::jsonb) $$,
  '42501', null, 'the owner cannot write a message into their own conversation: only the server does'
);
select throws_ok(
  $$ insert into public.agent_sessions (user_id, campaign_id, kind, provider, model)
     values ('12050000-0000-4000-8000-000000000001', '12050000-0000-4000-8000-000000000010', 'solo_table', 'openai', 'gpt-test') $$,
  '42501', null, 'nor open a conversation themselves'
);
select throws_ok(
  $$ update public.agent_sessions set credits_spent = 0, summary = 'forged' where id = '12050000-0000-4000-8000-000000000020' $$,
  '42501', null, 'nor rewrite its summary or what it has cost'
);

-- ── The campaign's DM ──────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12050000-0000-4000-8000-000000000002', true);

select is((select count(*)::integer from public.agent_sessions), 0, 'the campaign''s DM does not see another account''s conversation');
select is((select count(*)::integer from public.agent_turns), 0, 'nor its messages');
delete from public.agent_sessions where id = '12050000-0000-4000-8000-000000000020';

-- ── The owner deletes it ───────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12050000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.agent_sessions), 1, 'the DM''s delete removed nothing');
delete from public.agent_sessions where id = '12050000-0000-4000-8000-000000000020';
reset role;
select is(
  (select count(*)::integer from public.agent_turns where session_id = '12050000-0000-4000-8000-000000000020'),
  0, 'the owner''s delete takes the conversation and its messages with it'
);

select * from finish();
rollback;
