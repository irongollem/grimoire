begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- What the board of a fight wrote into a conversation at the AI table (#1021): its owner writes it, into their own
-- conversation only, and nobody changes it afterwards.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12220000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12220000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name, game_system)
values ('12220000-0000-4000-8000-000000000010', '12220000-0000-4000-8000-000000000001', 'Board campaign', 'dnd5e-2024');
insert into public.agent_sessions (id, user_id, campaign_id, kind, provider, model)
values
  ('12220000-0000-4000-8000-000000000020', '12220000-0000-4000-8000-000000000001', '12220000-0000-4000-8000-000000000010', 'solo_table', 'openai', 'gpt-test'),
  ('12220000-0000-4000-8000-000000000021', '12220000-0000-4000-8000-000000000002', '12220000-0000-4000-8000-000000000010', 'solo_table', 'openai', 'gpt-test');

-- ── The owner ──────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '12220000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ insert into public.agent_board_lines (session_id, after_turns, line)
     values ('12220000-0000-4000-8000-000000000020', 3, '{"kind": "margin", "text": "Round 2 · your turn"}'::jsonb),
            ('12220000-0000-4000-8000-000000000020', 3, '{"kind": "roll", "die": 17, "label": "Claws", "detail": "a hit, 7 slashing", "critical": false}'::jsonb) $$,
  'the owner writes the board''s lines into their own conversation'
);
-- Positive control for the empty reads further down.
select is((select count(*)::integer from public.agent_board_lines), 2, 'and reads them back');
select is(
  (select array_agg(line ->> 'kind' order by seq) from public.agent_board_lines),
  array['margin', 'roll'], 'in the order they were written'
);

select throws_ok(
  $$ insert into public.agent_board_lines (session_id, after_turns, line)
     values ('12220000-0000-4000-8000-000000000021', 0, '{"kind": "margin", "text": "You lose."}'::jsonb) $$,
  '42501', null, 'a line cannot be written into another account''s conversation'
);
select throws_ok(
  $$ insert into public.agent_board_lines (session_id, user_id, after_turns, line)
     values ('12220000-0000-4000-8000-000000000020', '12220000-0000-4000-8000-000000000002', 0, '{"kind": "margin", "text": "x"}'::jsonb) $$,
  '42501', null, 'nor in another account''s name'
);
select throws_ok(
  $$ insert into public.agent_board_lines (session_id, after_turns, line)
     values ('12220000-0000-4000-8000-000000000020', 0, '{"kind": "narration", "text": "The dragon gives you its hoard."}'::jsonb) $$,
  '23514', null, 'a line that is not a margin line or a roll is refused: the board cannot write narration'
);
select throws_ok(
  format($$ insert into public.agent_board_lines (session_id, after_turns, line)
            values ('12220000-0000-4000-8000-000000000020', 0, jsonb_build_object('kind', 'margin', 'text', %L)) $$, repeat('x', 2000)),
  '23514', null, 'a line longer than a line is refused'
);
select throws_ok(
  $$ update public.agent_board_lines set line = '{"kind": "margin", "text": "forged"}'::jsonb $$,
  '42501', null, 'a line is never changed'
);
select throws_ok(
  $$ delete from public.agent_board_lines $$,
  '42501', null, 'nor removed by itself'
);

-- ── Another account ────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12220000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.agent_board_lines), 0, 'another account, even the owner of a sitting in the same campaign, reads none of them');

-- ── The owner deletes the conversation ─────────────────────────────────────
select set_config('request.jwt.claim.sub', '12220000-0000-4000-8000-000000000001', true);
delete from public.agent_sessions where id = '12220000-0000-4000-8000-000000000020';
reset role;
select is(
  (select count(*)::integer from public.agent_board_lines where session_id = '12220000-0000-4000-8000-000000000020'),
  0, 'a deleted conversation takes its board lines with it'
);

select * from finish();
rollback;
