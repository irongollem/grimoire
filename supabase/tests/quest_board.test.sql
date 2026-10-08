begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- get_quest_board (#972, migration 20261005004823): the quest board's inputs
-- in one read, with beat text reduced to "is it written", attachment targets
-- resolved to "does it still exist", and the history reduced to its facts.

set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('97290000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('97290000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('97290000-0000-4000-8000-000000000010', '97290000-0000-4000-8000-000000000001', 'Board');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('97290000-0000-4000-8000-000000000010', '97290000-0000-4000-8000-000000000002', 'player', 'Player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.quests (id, user_id, campaign_id, title) values
  ('97290000-0000-4000-8000-000000000020', '97290000-0000-4000-8000-000000000001', '97290000-0000-4000-8000-000000000010', 'Board quest'),
  ('97290000-0000-4000-8000-000000000021', '97290000-0000-4000-8000-000000000001', '97290000-0000-4000-8000-000000000010', 'Board sequel');

insert into public.quest_beats (id, quest_id, campaign_id, title, dm_content, rumor_text, visibility) values
  ('97290000-0000-4000-8000-000000000030', '97290000-0000-4000-8000-000000000020', '97290000-0000-4000-8000-000000000010', 'Written', '{"type":"doc"}', null, 'rumored'),
  ('97290000-0000-4000-8000-000000000031', '97290000-0000-4000-8000-000000000020', '97290000-0000-4000-8000-000000000010', 'Blank', '', null, 'hidden');
insert into public.quest_beats (id, quest_id, campaign_id, title, converge_mode) values
  ('97290000-0000-4000-8000-000000000032', '97290000-0000-4000-8000-000000000021', '97290000-0000-4000-8000-000000000010', 'Meeting point', 'all');

-- One target of each kind survives and one is deleted after being attached,
-- which is the only way an attachment loses its target.
insert into public.npcs (id, user_id, campaign_id, name) values
  ('97290000-0000-4000-8000-000000000040', '97290000-0000-4000-8000-000000000001', '97290000-0000-4000-8000-000000000010', 'Present NPC'),
  ('97290000-0000-4000-8000-000000000049', '97290000-0000-4000-8000-000000000001', '97290000-0000-4000-8000-000000000010', 'Departed NPC');
insert into public.library_monsters (id, name, monster_type, ruleset, conceptual_key, source, source_document_key, source_record_key, stat_block) values
  ('board_test_wolf', 'Zz Board Wolf', 'beast', '2014', 'zz_board_wolf', 'srd-2014', 'srd-2014', 'board-test-wolf', '{}'::jsonb),
  ('board_test_gone', 'Zz Board Ghost', 'undead', '2014', 'zz_board_ghost', 'srd-2014', 'srd-2014', 'board-test-gone', '{}'::jsonb);

insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id, is_required) values
  ('97290000-0000-4000-8000-000000000030', '97290000-0000-4000-8000-000000000020', '97290000-0000-4000-8000-000000000010', 'npc', '97290000-0000-4000-8000-000000000040', true),
  ('97290000-0000-4000-8000-000000000030', '97290000-0000-4000-8000-000000000020', '97290000-0000-4000-8000-000000000010', 'npc', '97290000-0000-4000-8000-000000000049', true),
  ('97290000-0000-4000-8000-000000000030', '97290000-0000-4000-8000-000000000020', '97290000-0000-4000-8000-000000000010', 'monster', 'board_test_wolf', true),
  ('97290000-0000-4000-8000-000000000030', '97290000-0000-4000-8000-000000000020', '97290000-0000-4000-8000-000000000010', 'monster', 'board_test_gone', true);
delete from public.npcs where id = '97290000-0000-4000-8000-000000000049';
delete from public.library_monsters where id = 'board_test_gone';

-- History: the same arrival twice, a cross-quest arrival on a converge-all
-- beat, and two ends of the first quest, the later one naming a session.
insert into public.quest_beat_transitions (campaign_id, transition_kind, from_quest_id, from_beat_id, to_quest_id, to_beat_id, to_quest_title, reason, created_at) values
  ('97290000-0000-4000-8000-000000000010', 'enter', null, null, '97290000-0000-4000-8000-000000000020', '97290000-0000-4000-8000-000000000030', 'Board quest', null, now() - interval '4 hours'),
  ('97290000-0000-4000-8000-000000000010', 'enter', null, null, '97290000-0000-4000-8000-000000000020', '97290000-0000-4000-8000-000000000030', 'Board quest', null, now() - interval '3 hours'),
  ('97290000-0000-4000-8000-000000000010', 'jump', '97290000-0000-4000-8000-000000000020', '97290000-0000-4000-8000-000000000030', '97290000-0000-4000-8000-000000000021', '97290000-0000-4000-8000-000000000032', 'Board sequel', null, now() - interval '2 hours'),
  ('97290000-0000-4000-8000-000000000010', 'end', '97290000-0000-4000-8000-000000000020', '97290000-0000-4000-8000-000000000030', null, null, null, 'first stop', now() - interval '90 minutes'),
  ('97290000-0000-4000-8000-000000000010', 'end', '97290000-0000-4000-8000-000000000020', '97290000-0000-4000-8000-000000000030', null, null, null, 'session 12 wrap', now() - interval '1 hour');

set local role authenticated;
select set_config('request.jwt.claim.sub', '97290000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"97290000-0000-4000-8000-000000000001","role":"authenticated"}', true);

create temporary table board(payload jsonb) on commit drop;
insert into board select public.get_quest_board('97290000-0000-4000-8000-000000000010');

select is(
  (select jsonb_agg(jsonb_build_array(b ->> 'title', b -> 'has_guidance', b -> 'has_rumor_text') order by b ->> 'title')
     from board, jsonb_array_elements(payload -> 'beats') b
    where b ->> 'quest_id' = '97290000-0000-4000-8000-000000000020'),
  '[["Blank", false, false], ["Written", true, false]]'::jsonb,
  'beat text arrives as written-or-not; an empty string is not written'
);
select ok(
  not exists (select 1 from board, jsonb_array_elements(payload -> 'beats') b where b ? 'dm_content' or b ? 'rumor_text'),
  'and the words themselves never leave the database'
);
select is(
  (select jsonb_agg(jsonb_build_array(a ->> 'attachment_type', a -> 'target_exists') order by a ->> 'attachment_type', a -> 'target_exists')
     from board, jsonb_array_elements(payload -> 'attachments') a),
  '[["monster", false], ["monster", true], ["npc", false], ["npc", true]]'::jsonb,
  'each attachment says whether its target exists, own rows by uuid and library rows by text id'
);
select is(
  (select jsonb_array_length(payload -> 'visits') from board),
  2,
  'the same arrival twice is one visit'
);
select is(
  (select payload -> 'converges' from board),
  '[{"quest_id": "97290000-0000-4000-8000-000000000020", "title": "Board sequel"}]'::jsonb,
  'a jump onto another quest''s converge-all beat is a convergence of the quest it left'
);
select is(
  (select payload -> 'endings' from board),
  '[{"quest_id": "97290000-0000-4000-8000-000000000020", "reason": "session 12 wrap"}]'::jsonb,
  'only the latest end of a quest is sent'
);
select is(
  (select array_agg(k order by k) from board, jsonb_object_keys(payload) k),
  array['attachments', 'beats', 'consequences', 'converges', 'edges', 'endings', 'loot', 'objectives', 'runtime', 'threads', 'visits'],
  'the board is answered in one payload'
);
select is(
  (select count(*)::int from board, jsonb_array_elements(payload -> 'threads') t
    where t ->> 'quest_id' in ('97290000-0000-4000-8000-000000000020', '97290000-0000-4000-8000-000000000021')),
  2,
  'each quest''s Main thread is listed'
);

-- A player is refused outright, not handed the parts their policies allow.
select set_config('request.jwt.claim.sub', '97290000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"97290000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.get_quest_board('97290000-0000-4000-8000-000000000010') $$,
  'Not authorized',
  'a player cannot read the quest board'
);
-- Positive control for the refusal: the same call as the DM succeeds.
select set_config('request.jwt.claim.sub', '97290000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"97290000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.get_quest_board('97290000-0000-4000-8000-000000000010') $$,
  'the DM can'
);

reset role;
select ok(not has_function_privilege('anon', 'public.get_quest_board(uuid)', 'EXECUTE'), 'anon cannot call it');

select * from finish();
rollback;
