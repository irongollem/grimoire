begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

-- Level milestones (#1021 row 27, `20261119184525`). The maintainer: a level often comes "when 3 large quests are
-- completed", in whatever order the players choose. What would go wrong silently: a milestone that fires on the
-- wrong count or only in one order, a party level that drops, a player reading which quests a level waits on (the
-- quests may not be found yet), or a step that names another campaign's quest.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10280000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lm-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10280000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lm-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10280000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lm-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('10280000-0000-4000-8000-000000000010', '10280000-0000-4000-8000-000000000001', 'Levels', 'dnd5e-2014'),
  ('10280000-0000-4000-8000-000000000011', '10280000-0000-4000-8000-000000000003', 'Elsewhere', 'dnd5e-2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('10280000-0000-4000-8000-000000000010', '10280000-0000-4000-8000-000000000001', 'dm', 'The DM'),
  ('10280000-0000-4000-8000-000000000010', '10280000-0000-4000-8000-000000000002', 'player', 'A player'),
  ('10280000-0000-4000-8000-000000000011', '10280000-0000-4000-8000-000000000003', 'dm', 'Other DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- Three large quests and one objective of a fourth; another campaign's quest.
insert into public.quests (id, user_id, campaign_id, title, status) values
  ('10280000-0000-4000-8000-000000000020', '10280000-0000-4000-8000-000000000001', '10280000-0000-4000-8000-000000000010', 'The Sunken Library', 'active'),
  ('10280000-0000-4000-8000-000000000021', '10280000-0000-4000-8000-000000000001', '10280000-0000-4000-8000-000000000010', 'The Three Houses', 'active'),
  ('10280000-0000-4000-8000-000000000022', '10280000-0000-4000-8000-000000000001', '10280000-0000-4000-8000-000000000010', 'The Salt Road', 'active'),
  ('10280000-0000-4000-8000-000000000023', '10280000-0000-4000-8000-000000000001', '10280000-0000-4000-8000-000000000010', 'The Old Map', 'active'),
  ('10280000-0000-4000-8000-000000000024', '10280000-0000-4000-8000-000000000001', '10280000-0000-4000-8000-000000000010', 'The Glass Crown', 'completed'),
  ('10280000-0000-4000-8000-000000000025', '10280000-0000-4000-8000-000000000001', '10280000-0000-4000-8000-000000000010', 'The Last Ferry', 'active'),
  ('10280000-0000-4000-8000-000000000029', '10280000-0000-4000-8000-000000000003', '10280000-0000-4000-8000-000000000011', 'Not this campaign', 'active');
insert into public.quest_objectives (id, quest_id, description, status, sort_order) values
  ('10280000-0000-4000-8000-000000000030', '10280000-0000-4000-8000-000000000023', 'Find the drowned tower', 'pending', 0);

-- ── The DM sets "level 3 when any 2 of these 4 are done" ─────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10280000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.level_milestones (id, campaign_id, user_id, level, needs)
values ('10280000-0000-4000-8000-000000000040', '10280000-0000-4000-8000-000000000010', '10280000-0000-4000-8000-000000000001', 3, 2);
insert into public.level_milestone_steps (milestone_id, campaign_id, user_id, quest_id, objective_id) values
  ('10280000-0000-4000-8000-000000000040', '10280000-0000-4000-8000-000000000010', '10280000-0000-4000-8000-000000000001', '10280000-0000-4000-8000-000000000020', null),
  ('10280000-0000-4000-8000-000000000040', '10280000-0000-4000-8000-000000000010', '10280000-0000-4000-8000-000000000001', '10280000-0000-4000-8000-000000000021', null),
  ('10280000-0000-4000-8000-000000000040', '10280000-0000-4000-8000-000000000010', '10280000-0000-4000-8000-000000000001', '10280000-0000-4000-8000-000000000022', null),
  ('10280000-0000-4000-8000-000000000040', '10280000-0000-4000-8000-000000000010', '10280000-0000-4000-8000-000000000001', null, '10280000-0000-4000-8000-000000000030');
select throws_ok(
  $$ insert into public.level_milestone_steps (milestone_id, campaign_id, user_id, quest_id)
     values ('10280000-0000-4000-8000-000000000040', '10280000-0000-4000-8000-000000000010', '10280000-0000-4000-8000-000000000001', '10280000-0000-4000-8000-000000000029') $$,
  null, null, 'a milestone cannot wait on another campaign''s quest'
);

-- One done: not yet.
update public.quests set status = 'completed' where id = '10280000-0000-4000-8000-000000000022';
select is((select party_level from public.campaigns where id = '10280000-0000-4000-8000-000000000010'), null::smallint, 'one of two done reaches nothing');

-- The second is an objective, done out of the listed order: reached.
-- Through the call the DM's run screen and the AI table use: an objective is not written directly.
select public.assert_quest_objective_status('10280000-0000-4000-8000-000000000030', 'complete');
select is((select party_level from public.campaigns where id = '10280000-0000-4000-8000-000000000010'), 3::smallint, 'any two of the four, in any order and an objective among them, reach level 3');
select isnt((select reached_at from public.level_milestones where id = '10280000-0000-4000-8000-000000000040'), null, 'the milestone is marked reached');
reset role;
select is(
  (select count(*)::integer from public.campaign_messages where campaign_id = '10280000-0000-4000-8000-000000000010' and message like '%reaches level 3%'),
  1, 'the table hears it once in chat'
);

-- Another quest done afterwards does not announce it again.
update public.quests set status = 'completed' where id = '10280000-0000-4000-8000-000000000020';
select is(
  (select count(*)::integer from public.campaign_messages where campaign_id = '10280000-0000-4000-8000-000000000010' and message like '%reaches level 3%'),
  1, 'a milestone is reached once'
);

-- ── The party level never goes down ─────────────────────────────────────────
update public.campaigns set party_level = 5 where id = '10280000-0000-4000-8000-000000000010';
insert into public.level_milestones (campaign_id, user_id, level, needs)
values ('10280000-0000-4000-8000-000000000010', '10280000-0000-4000-8000-000000000001', 4, 1);
insert into public.level_milestone_steps (milestone_id, campaign_id, user_id, quest_id)
select id, campaign_id, user_id, '10280000-0000-4000-8000-000000000021' from public.level_milestones where level = 4 and campaign_id = '10280000-0000-4000-8000-000000000010';
update public.quests set status = 'completed' where id = '10280000-0000-4000-8000-000000000021';
select is((select party_level from public.campaigns where id = '10280000-0000-4000-8000-000000000010'), 5::smallint, 'reaching a lower milestone leaves a higher party level as it was');

-- A milestone whose items are already done is reached the moment it is made.
insert into public.level_milestones (campaign_id, user_id, level, needs)
values ('10280000-0000-4000-8000-000000000010', '10280000-0000-4000-8000-000000000001', 6, 1);
insert into public.level_milestone_steps (milestone_id, campaign_id, user_id, quest_id)
select id, campaign_id, user_id, '10280000-0000-4000-8000-000000000020' from public.level_milestones where level = 6 and campaign_id = '10280000-0000-4000-8000-000000000010';
select is((select party_level from public.campaigns where id = '10280000-0000-4000-8000-000000000010'), 6::smallint, 'a milestone made after its quests are done is reached at once');

-- ── Saving through the editor ───────────────────────────────────────────────
-- "Level 8 when both of these" (one done), edited to "level 8 when the undone one is". A save that wrote the lower
-- count before dropping the done item would count it on the way and reach a milestone the DM never set.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10280000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('lm.id', public.save_level_milestone(
  '10280000-0000-4000-8000-000000000010', null, 8::smallint, 2::smallint, ' ',
  array['10280000-0000-4000-8000-000000000024', '10280000-0000-4000-8000-000000000025']::uuid[], null)::text, true);
select public.save_level_milestone(
  '10280000-0000-4000-8000-000000000010', current_setting('lm.id')::uuid, 8::smallint, 1::smallint, null,
  array['10280000-0000-4000-8000-000000000025']::uuid[], null);
select is(
  (select reached_at from public.level_milestones where id = current_setting('lm.id')::uuid), null,
  'an edit that drops a done item while lowering the count reaches nothing on the way'
);
select is(
  (select count(*)::integer from public.level_milestone_steps where milestone_id = current_setting('lm.id')::uuid), 1,
  'the dropped item is gone and the kept one stays'
);
select throws_ok(
  $$ select public.save_level_milestone('10280000-0000-4000-8000-000000000010', null, 9::smallint, 3::smallint, null,
       array['10280000-0000-4000-8000-000000000025']::uuid[], null) $$,
  '22023', null, 'a milestone cannot need more items than it lists'
);
reset role;

-- ── Who sees what ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10280000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.level_milestones) + (select count(*)::integer from public.level_milestone_steps), 0,
  'a player reads no milestone and none of the quests it waits on');
select is((select party_level from public.campaigns where id = '10280000-0000-4000-8000-000000000010'), 6::smallint, 'but reads the party level, so their sheet knows they may level up');
select throws_ok(
  $$ insert into public.level_milestones (campaign_id, user_id, level, needs)
     values ('10280000-0000-4000-8000-000000000010', '10280000-0000-4000-8000-000000000002', 7, 1) $$,
  '42501', null, 'a player cannot make a milestone'
);
reset role;

select * from finish();
rollback;
