begin;

create extension if not exists pgtap with schema extensions;
select plan(37);

-- Table questions (20261116200111, #1212): a DM sends a roll table to the table, and
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

-- What a gift can be (#1212 story 7): a library item (text id), a campaign item
-- (uuid), a library creature and a campaign NPC.
insert into public.library_items (id, name, source_document_key, source_record_key)
values ('tq_test_whistle', 'Silver whistle', 'tq-test', 'whistle');
insert into public.items (id, user_id, campaign_id, name) values
  ('12120000-0000-4000-8000-000000000031', '12120000-0000-4000-8000-000000000001', '12120000-0000-4000-8000-000000000010', 'Lantern'),
  ('12120000-0000-4000-8000-000000000033', '12120000-0000-4000-8000-000000000001', '12120000-0000-4000-8000-000000000010', 'The usurper''s crown');
insert into public.npcs (id, user_id, campaign_id, name) values
  ('12120000-0000-4000-8000-000000000032', '12120000-0000-4000-8000-000000000001', '12120000-0000-4000-8000-000000000010', 'Bram');

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

-- ── Gifts (story 7) ─────────────────────────────────────────────────────────
select throws_ok($$
  insert into public.table_questions (campaign_id, prompt, mode, gift, options)
  values ('12120000-0000-4000-8000-000000000010', 'Gift vote', 'vote', true, '[{"id":"a","label":"A"}]')
$$, '23514', null, 'only a pick can be a gift: a vote has no one thing each player takes');

insert into public.table_questions (id, campaign_id, prompt, mode, gift, options) values
  ('12120000-0000-4000-8000-000000000104', '12120000-0000-4000-8000-000000000010', 'The giant''s trinkets', 'pick', true,
   '[{"id":"whistle","label":"A silver whistle","ref":{"kind":"item","id":"tq_test_whistle"}},
     {"id":"cat","label":"Cat","image_url":"https://example.invalid/cat.webp","ref":{"kind":"monster","id":"srd_srd_2024_cat"}},
     {"id":"rock","label":"A smooth rock","ref":null}]'),
  ('12120000-0000-4000-8000-000000000105', '12120000-0000-4000-8000-000000000010', 'Who comes along?', 'pick', true,
   '[{"id":"bram","label":"Bram","ref":{"kind":"npc","id":"12120000-0000-4000-8000-000000000032"}},
     {"id":"lantern","label":"Lantern","ref":{"kind":"item","id":"12120000-0000-4000-8000-000000000031"}}]'),
  ('12120000-0000-4000-8000-000000000106', '12120000-0000-4000-8000-000000000010', 'Which do we sell?', 'pick', false,
   '[{"id":"lantern","label":"Lantern","ref":{"kind":"item","id":"12120000-0000-4000-8000-000000000031"}},
     {"id":"crown","label":"A crown","ref":{"kind":"item","id":"12120000-0000-4000-8000-000000000033"}}]');

select pg_temp.as_user('12120000-0000-4000-8000-000000000002');
insert into public.table_question_answers (question_id, party_member_id, option_id)
values ('12120000-0000-4000-8000-000000000104', '12120000-0000-4000-8000-000000000021', 'whistle');
select ok(exists (
  select 1 from public.table_question_answers a
    join public.party_inventory i on i.id = a.inventory_item_id
   where a.question_id = '12120000-0000-4000-8000-000000000104' and a.user_id = '12120000-0000-4000-8000-000000000002'
     and i.carried_by = '12120000-0000-4000-8000-000000000021' and i.library_item_id = 'tq_test_whistle' and i.quantity = 1
), 'a picked library item lands in the picker''s pack, linked to the answer');

select throws_ok($$
  update public.table_question_answers set option_id = 'rock'
   where question_id = '12120000-0000-4000-8000-000000000104' and user_id = '12120000-0000-4000-8000-000000000002'
$$, '42501', 'A gift is yours to keep', 'a gift is final: no trading the whistle for something else');
select throws_ok($$
  delete from public.table_question_answers
   where question_id = '12120000-0000-4000-8000-000000000104' and user_id = '12120000-0000-4000-8000-000000000002'
$$, '42501', null, 'a player cannot hand a gift back to pick again');

select pg_temp.as_user('12120000-0000-4000-8000-000000000003');
insert into public.table_question_answers (question_id, party_member_id, option_id)
values ('12120000-0000-4000-8000-000000000104', '12120000-0000-4000-8000-000000000022', 'cat');
select ok(exists (
  select 1 from public.table_question_answers a
    join public.companions c on c.id = a.companion_id
   where a.question_id = '12120000-0000-4000-8000-000000000104' and a.user_id = '12120000-0000-4000-8000-000000000003'
     and c.owner_party_member_id = '12120000-0000-4000-8000-000000000022' and c.companion_type = 'pet'
     and c.source_monster_id = 'srd_srd_2024_cat' and not c.combat_ready and c.portrait_url = 'https://example.invalid/cat.webp'
), 'a picked creature becomes the picker''s pet, with its picture, not ready to fight');

-- Point the answer at the whistle P1 was given: the guard keeps what a gift gave.
update public.table_question_answers
   set inventory_item_id = (select inventory_item_id from public.table_question_answers
                             where question_id = '12120000-0000-4000-8000-000000000104' and user_id = '12120000-0000-4000-8000-000000000002')
 where question_id = '12120000-0000-4000-8000-000000000104' and user_id = '12120000-0000-4000-8000-000000000003';
select is((select inventory_item_id from public.table_question_answers
            where question_id = '12120000-0000-4000-8000-000000000104' and user_id = '12120000-0000-4000-8000-000000000003'),
  null, 'a player cannot claim another reward by writing it onto their answer');

select pg_temp.as_user('12120000-0000-4000-8000-000000000002');
select throws_ok($$
  insert into public.table_question_answers (question_id, option_id)
  values ('12120000-0000-4000-8000-000000000105', 'bram')
$$, '23514', 'A gift goes to a character', 'a gift needs a character to go to');
insert into public.table_question_answers (question_id, party_member_id, option_id)
values ('12120000-0000-4000-8000-000000000105', '12120000-0000-4000-8000-000000000021', 'bram');
select ok(exists (
  select 1 from public.table_question_answers a
    join public.companions c on c.id = a.companion_id
   where a.question_id = '12120000-0000-4000-8000-000000000105' and a.user_id = '12120000-0000-4000-8000-000000000002'
     and c.companion_type = 'ally' and c.source_type = 'npc' and c.source_npc_id = '12120000-0000-4000-8000-000000000032'
), 'a picked NPC joins the picker''s companions as an ally');

select pg_temp.as_user('12120000-0000-4000-8000-000000000003');
insert into public.table_question_answers (question_id, party_member_id, option_id)
values ('12120000-0000-4000-8000-000000000105', '12120000-0000-4000-8000-000000000022', 'lantern');
select ok(exists (
  select 1 from public.table_question_answers a
    join public.party_inventory i on i.id = a.inventory_item_id
   where a.question_id = '12120000-0000-4000-8000-000000000105' and a.user_id = '12120000-0000-4000-8000-000000000003'
     and i.item_id = '12120000-0000-4000-8000-000000000031' and i.library_item_id is null
), 'a picked campaign item lands in the pack by its uuid');

insert into public.table_question_answers (question_id, party_member_id, option_id)
values ('12120000-0000-4000-8000-000000000106', '12120000-0000-4000-8000-000000000022', 'lantern');
select is((select count(*)::int from public.party_inventory
            where carried_by = '12120000-0000-4000-8000-000000000022' and item_id = '12120000-0000-4000-8000-000000000031'),
  1, 'a pick that is not a gift gives nothing: choosing what to sell is not being handed it');

select throws_ok($$
  insert into public.party_inventory (campaign_id, user_id, name, carried_by, item_id)
  values ('12120000-0000-4000-8000-000000000010', '12120000-0000-4000-8000-000000000003', 'Crown',
          '12120000-0000-4000-8000-000000000022', '12120000-0000-4000-8000-000000000033')
$$, '42501', null, 'only a gift shows the campaign an item: the DM''s crown named in a plain question stays out of a player''s pack');

select pg_temp.as_user('12120000-0000-4000-8000-000000000001');
delete from public.table_question_answers
 where question_id = '12120000-0000-4000-8000-000000000104' and user_id = '12120000-0000-4000-8000-000000000003';
select is_empty($$ select id from public.companions where owner_party_member_id = '12120000-0000-4000-8000-000000000022'
                     and source_monster_id = 'srd_srd_2024_cat' $$,
  'the DM taking a gift''s answer back takes the pet back, so the player can choose again');

delete from public.table_questions where id = '12120000-0000-4000-8000-000000000104';
select ok(exists (select 1 from public.party_inventory
                   where carried_by = '12120000-0000-4000-8000-000000000021' and library_item_id = 'tq_test_whistle'),
  'deleting the question takes nothing back: the party keeps what it was given');

select * from finish();
rollback;
