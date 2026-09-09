-- A rule's identity is its condition, its action and *every* target it can
-- name (20260909192146). The #794 uniques keyed only on target_objective_id,
-- so a beat could unlock one quest and move one NPC at most, and two pieces
-- of knowledge from one beat collided. Ledger verbs still dedupe on the
-- objective; targeted world actions dedupe on their target; payload-only
-- actions do not dedupe at all — the payload is not an identity.
begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('79500000-0000-4000-8000-000000a00001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dedupe-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('79500000-0000-4000-8000-000000a00010', '79500000-0000-4000-8000-000000a00001', 'Dedupe');

insert into public.quests (id, user_id, campaign_id, title, status) values
  ('79500000-0000-4000-8000-000000a00030', '79500000-0000-4000-8000-000000a00001', '79500000-0000-4000-8000-000000a00010', 'Town hall', 'active'),
  ('79500000-0000-4000-8000-000000a00031', '79500000-0000-4000-8000-000000a00001', '79500000-0000-4000-8000-000000a00010', 'Sequel one', 'undiscovered'),
  ('79500000-0000-4000-8000-000000a00032', '79500000-0000-4000-8000-000000a00001', '79500000-0000-4000-8000-000000a00010', 'Sequel two', 'undiscovered');

insert into public.quest_objectives (id, quest_id, description, status, sort_order)
values ('79500000-0000-4000-8000-000000a00051', '79500000-0000-4000-8000-000000a00030', 'Deal with the White Lady', 'pending', 1);

insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('79500000-0000-4000-8000-000000a00041', '79500000-0000-4000-8000-000000a00030', '79500000-0000-4000-8000-000000a00010', 'Opening');

insert into public.npcs (id, user_id, campaign_id, name) values
  ('79500000-0000-4000-8000-000000a00091', '79500000-0000-4000-8000-000000a00001', '79500000-0000-4000-8000-000000a00010', 'Speaker'),
  ('79500000-0000-4000-8000-000000a00092', '79500000-0000-4000-8000-000000a00001', '79500000-0000-4000-8000-000000a00010', 'Sheriff');

-- Ledger verbs: the same verb on the same objective from the same beat is one rule.
select lives_ok(
  $$insert into public.quest_consequences (quest_id, on_beat_id, action, target_objective_id)
    values ('79500000-0000-4000-8000-000000a00030', '79500000-0000-4000-8000-000000a00041', 'raise', '79500000-0000-4000-8000-000000a00051')$$,
  'a beat raises an objective');
select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_beat_id, action, target_objective_id)
    values ('79500000-0000-4000-8000-000000a00030', '79500000-0000-4000-8000-000000a00041', 'raise', '79500000-0000-4000-8000-000000a00051')$$,
  '23505',
  null,
  'the same beat raising the same objective twice is a duplicate, not two rules');

-- unlock_quest: one beat may open two different sequels.
select lives_ok(
  $$insert into public.quest_consequences (quest_id, on_beat_id, action, target_quest_id)
    values ('79500000-0000-4000-8000-000000a00030', '79500000-0000-4000-8000-000000a00041', 'unlock_quest', '79500000-0000-4000-8000-000000a00031')$$,
  'a beat unlocks a sequel');
select lives_ok(
  $$insert into public.quest_consequences (quest_id, on_beat_id, action, target_quest_id)
    values ('79500000-0000-4000-8000-000000a00030', '79500000-0000-4000-8000-000000a00041', 'unlock_quest', '79500000-0000-4000-8000-000000a00032')$$,
  'the same beat unlocks a second, different sequel');
select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_beat_id, action, target_quest_id)
    values ('79500000-0000-4000-8000-000000a00030', '79500000-0000-4000-8000-000000a00041', 'unlock_quest', '79500000-0000-4000-8000-000000a00032')$$,
  '23505',
  null,
  'unlocking the same sequel twice from one beat is a duplicate');

-- NPC actions: two NPCs may shift from one beat.
select lives_ok(
  $$insert into public.quest_consequences (quest_id, on_beat_id, action, target_npc_id, action_payload) values
    ('79500000-0000-4000-8000-000000a00030', '79500000-0000-4000-8000-000000a00041', 'shift_npc_relationship', '79500000-0000-4000-8000-000000a00091', '{"to": "friendly"}'),
    ('79500000-0000-4000-8000-000000a00030', '79500000-0000-4000-8000-000000a00041', 'shift_npc_relationship', '79500000-0000-4000-8000-000000a00092', '{"step": -1}')$$,
  'one beat moves two different NPCs');

-- Payload-only actions never dedupe: two pieces of knowledge are two rules.
select lives_ok(
  $$insert into public.quest_consequences (quest_id, on_beat_id, action, action_payload) values
    ('79500000-0000-4000-8000-000000a00030', '79500000-0000-4000-8000-000000a00041', 'grant_knowledge', '{"text": "The speaker owes the Zhentarim"}'),
    ('79500000-0000-4000-8000-000000a00030', '79500000-0000-4000-8000-000000a00041', 'grant_knowledge', '{"text": "The White Lady drowned here"}')$$,
  'one beat grants two pieces of knowledge');

select is(
  (select count(*)::integer from public.quest_consequences where on_beat_id = '79500000-0000-4000-8000-000000a00041'),
  7,
  'seven rules stand on the beat: one raise, two unlocks, two shifts, two knowledge grants');

select * from finish();
rollback;
