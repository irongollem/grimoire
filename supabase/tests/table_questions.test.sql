begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

-- Table questions (20261116074944, #1212): a DM sends a roll table to the table, and
-- each player picks, the table votes, or a player rolls. Each test names the bug it
-- fails on; the hidden-vote ones are the epic's story 6, proven as the wrong member.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12120000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tq-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12120000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tq-p1@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12120000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tq-p2@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12120000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tq-out@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12120000-0000-4000-8000-000000000010', '12120000-0000-4000-8000-000000000001', 'Questions', 'dnd5e-2014');
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('12120000-0000-4000-8000-000000000021', '12120000-0000-4000-8000-000000000001', '12120000-0000-4000-8000-000000000002', '12120000-0000-4000-8000-000000000010', 'Pip', '2014'),
  ('12120000-0000-4000-8000-000000000022', '12120000-0000-4000-8000-000000000001', '12120000-0000-4000-8000-000000000003', '12120000-0000-4000-8000-000000000010', 'Wren', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('12120000-0000-4000-8000-000000000010', '12120000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('12120000-0000-4000-8000-000000000010', '12120000-0000-4000-8000-000000000002', 'player', 'P1', '12120000-0000-4000-8000-000000000021'),
  ('12120000-0000-4000-8000-000000000010', '12120000-0000-4000-8000-000000000003', 'player', 'P2', '12120000-0000-4000-8000-000000000022')
on conflict (campaign_id, user_id) do update
set role = excluded.role, display_name = excluded.display_name, party_member_id = excluded.party_member_id;

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('request.jwt.claim.sub', p_user::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- ── Asking ──────────────────────────────────────────────────────────────────
select pg_temp.as_user('12120000-0000-4000-8000-000000000002');
select throws_ok($$
  insert into public.table_questions (id, campaign_id, prompt, mode, options)
  values ('12120000-0000-4000-8000-000000000099', '12120000-0000-4000-8000-000000000010', 'Mine?', 'pick',
          '[{"id":"a","label":"A"}]')
$$, '42501', null, 'a player cannot send a question');

select pg_temp.as_user('12120000-0000-4000-8000-000000000001');
select lives_ok($$
  insert into public.table_questions (id, campaign_id, prompt, mode, exclusive, options) values
    ('12120000-0000-4000-8000-000000000100', '12120000-0000-4000-8000-000000000010', 'Choose a pet', 'pick', true,
     '[{"id":"cat","label":"Cat"},{"id":"owl","label":"Owl"}]');
  insert into public.table_questions (id, campaign_id, prompt, mode, hidden, options) values
    ('12120000-0000-4000-8000-000000000101', '12120000-0000-4000-8000-000000000010', 'Which road?', 'vote', true,
     '[{"id":"north","label":"North"},{"id":"south","label":"South"}]');
  insert into public.table_questions (id, campaign_id, prompt, mode, dice, options) values
    ('12120000-0000-4000-8000-000000000102', '12120000-0000-4000-8000-000000000010', 'A rumour', 'roll', '1d4',
     '[{"id":"low","label":"Low","min":1,"max":2},{"id":"high","label":"High","min":3,"max":4}]');
$$, 'the DM sends a pick, a hidden vote and a roll (positive control)');

select throws_ok($$
  insert into public.table_questions (campaign_id, prompt, mode, hidden, options)
  values ('12120000-0000-4000-8000-000000000010', 'Hidden pick', 'pick', true, '[{"id":"a","label":"A"}]')
$$, '23514', null, 'only a vote can be hidden: a hidden pick would hide the taken options from the exclusivity guard');

select throws_ok($$
  insert into public.table_questions (campaign_id, prompt, mode, options)
  values ('12120000-0000-4000-8000-000000000010', 'Dupes', 'vote', '[{"id":"a","label":"A"},{"id":"a","label":"B"}]')
$$, '23514', 'Option ids must be unique', 'two options cannot share an id');

select throws_ok($$
  update public.table_questions set options = '[{"id":"dog","label":"Dog"}]'
   where id = '12120000-0000-4000-8000-000000000100'
$$, '23514', null, 'the options are fixed once sent');

-- ── An outsider ─────────────────────────────────────────────────────────────
select pg_temp.as_user('12120000-0000-4000-8000-000000000004');
select is_empty($$ select id from public.table_questions where campaign_id = '12120000-0000-4000-8000-000000000010' $$,
  'someone outside the campaign reads no question');
select throws_ok($$
  insert into public.table_question_answers (question_id, option_id)
  values ('12120000-0000-4000-8000-000000000101', 'north')
$$, null, null, 'someone outside the campaign cannot answer');

-- ── Each picks their own, exclusive ─────────────────────────────────────────
select pg_temp.as_user('12120000-0000-4000-8000-000000000002');
select lives_ok($$
  insert into public.table_question_answers (question_id, party_member_id, option_id)
  values ('12120000-0000-4000-8000-000000000100', '12120000-0000-4000-8000-000000000021', 'cat')
$$, 'P1 picks the cat for their own character (positive control)');
select throws_ok($$
  insert into public.table_question_answers (question_id, option_id)
  values ('12120000-0000-4000-8000-000000000101', 'west')
$$, '23514', 'Choose one of the options', 'an answer must name one of the options');

select pg_temp.as_user('12120000-0000-4000-8000-000000000003');
select throws_ok($$
  insert into public.table_question_answers (question_id, option_id)
  values ('12120000-0000-4000-8000-000000000100', 'cat')
$$, '23505', 'Someone has already chosen that one', 'an exclusive pick refuses an option someone else took');
select throws_ok($$
  insert into public.table_question_answers (question_id, party_member_id, option_id)
  values ('12120000-0000-4000-8000-000000000100', '12120000-0000-4000-8000-000000000021', 'owl')
$$, '42501', 'That character is not yours', 'a player cannot answer for another player''s character');
select throws_ok($$
  insert into public.table_question_answers (question_id, user_id, option_id)
  values ('12120000-0000-4000-8000-000000000100', '12120000-0000-4000-8000-000000000002', 'owl')
$$, '42501', null, 'a player cannot answer as another member');
select is((select option_id from public.table_question_answers
            where question_id = '12120000-0000-4000-8000-000000000100' and user_id = '12120000-0000-4000-8000-000000000002'),
  'cat', 'a pick is seen by the other players, so they can see what is taken');

-- ── The table votes, hidden ─────────────────────────────────────────────────
select pg_temp.as_user('12120000-0000-4000-8000-000000000002');
insert into public.table_question_answers (question_id, option_id) values ('12120000-0000-4000-8000-000000000101', 'north');
select pg_temp.as_user('12120000-0000-4000-8000-000000000003');
insert into public.table_question_answers (question_id, option_id) values ('12120000-0000-4000-8000-000000000101', 'south');

select is((select array_agg(option_id) from public.table_question_answers where question_id = '12120000-0000-4000-8000-000000000101'),
  array['south'], 'while a hidden vote is open a player reads only their own vote');

select pg_temp.as_user('12120000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.table_question_answers where question_id = '12120000-0000-4000-8000-000000000101'),
  2, 'the DM sees every vote come in');

update public.table_questions set closed_at = now(), outcome_option_id = 'north'
 where id = '12120000-0000-4000-8000-000000000101';

select pg_temp.as_user('12120000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.table_question_answers where question_id = '12120000-0000-4000-8000-000000000101'),
  2, 'once the DM closes the vote, every player sees how the table voted');
select throws_ok($$
  update public.table_question_answers set option_id = 'north'
   where question_id = '12120000-0000-4000-8000-000000000101' and user_id = '12120000-0000-4000-8000-000000000003'
$$, '42501', 'This question is closed', 'a closed vote cannot be changed');
select throws_ok($$
  delete from public.table_question_answers
   where question_id = '12120000-0000-4000-8000-000000000101' and user_id = '12120000-0000-4000-8000-000000000003'
$$, '42501', null, 'a closed vote cannot be withdrawn');

-- An open vote: the DM switched it to open, so the players watch it come in.
select pg_temp.as_user('12120000-0000-4000-8000-000000000001');
insert into public.table_questions (id, campaign_id, prompt, mode, hidden, options) values
  ('12120000-0000-4000-8000-000000000103', '12120000-0000-4000-8000-000000000010', 'Open vote', 'vote', false,
   '[{"id":"y","label":"Yes"},{"id":"n","label":"No"}]');
select pg_temp.as_user('12120000-0000-4000-8000-000000000002');
insert into public.table_question_answers (question_id, option_id) values ('12120000-0000-4000-8000-000000000103', 'y');
select pg_temp.as_user('12120000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.table_question_answers where question_id = '12120000-0000-4000-8000-000000000103'),
  1, 'an open vote shows the others'' votes while it runs');

-- ── Roll for me ─────────────────────────────────────────────────────────────
select pg_temp.as_user('12120000-0000-4000-8000-000000000002');
insert into public.table_question_answers (question_id, option_id, rolled)
values ('12120000-0000-4000-8000-000000000102', 'high', 99);
select ok((select rolled between 1 and 4 from public.table_question_answers
            where question_id = '12120000-0000-4000-8000-000000000102' and user_id = '12120000-0000-4000-8000-000000000002'),
  'the server rolls the die: a client-sent 99 on a d4 is ignored');
select ok((select option_id = case when rolled <= 2 then 'low' else 'high' end from public.table_question_answers
            where question_id = '12120000-0000-4000-8000-000000000102' and user_id = '12120000-0000-4000-8000-000000000002'),
  'the option is the one the roll lands on, not the one the client sent');
-- Flip the die (5 - r is never r on a d4) and name no real option: without the guard
-- the option would read 'forged'.
update public.table_question_answers set rolled = 5 - rolled, option_id = 'forged'
 where question_id = '12120000-0000-4000-8000-000000000102' and user_id = '12120000-0000-4000-8000-000000000002';
select ok((select option_id = case when rolled <= 2 then 'low' else 'high' end from public.table_question_answers
            where question_id = '12120000-0000-4000-8000-000000000102' and user_id = '12120000-0000-4000-8000-000000000002'),
  'a player cannot rewrite their roll');
select throws_ok($$
  delete from public.table_question_answers
   where question_id = '12120000-0000-4000-8000-000000000102' and user_id = '12120000-0000-4000-8000-000000000002'
$$, '42501', null, 'a player cannot throw away a roll to roll again');

select pg_temp.as_user('12120000-0000-4000-8000-000000000001');
select lives_ok($$
  delete from public.table_question_answers
   where question_id = '12120000-0000-4000-8000-000000000102' and user_id = '12120000-0000-4000-8000-000000000002'
$$, 'the DM can take a roll back for a reroll (positive control)');

select * from finish();
rollback;
