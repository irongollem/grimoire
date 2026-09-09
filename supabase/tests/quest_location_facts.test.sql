begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

-- #869, split out of epic #868 (frame 15 of `atlas/Sites & Cartographer.html`):
-- a quest rule can watch a place. A durable Cleared assertion on a room is a
-- world fact with provenance; an objective may watch for it, which is the
-- honest version of "the DM ticks the box twice". See
-- 20260909140236_a_quest_rule_can_watch_a_place.sql for the decisions this
-- covers: only a true assertion fires, only a location fact (not a door)
-- fires, and only the campaign's ACTIVE quests are watched.

set local grimoire.bypass_quota = 'on';

-- ════════════════════════════════════════════════════════════════════════════
-- Fixture: one campaign, one active quest with two objectives, a dungeon site
-- with two rooms and a door between them.
-- ════════════════════════════════════════════════════════════════════════════
reset role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('86900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'locfact-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('86900000-0000-4000-8000-000000000010', '86900000-0000-4000-8000-000000000001', 'Watching Places');

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('86900000-0000-4000-8000-000000000020', '86900000-0000-4000-8000-000000000001', '86900000-0000-4000-8000-000000000010', 'The Sunken Crypt', 'dungeon');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('86900000-0000-4000-8000-000000000021', '86900000-0000-4000-8000-000000000001', '86900000-0000-4000-8000-000000000010', '86900000-0000-4000-8000-000000000020', 'Antechamber', 'room'),
  ('86900000-0000-4000-8000-000000000022', '86900000-0000-4000-8000-000000000001', '86900000-0000-4000-8000-000000000010', '86900000-0000-4000-8000-000000000020', 'Ossuary', 'room');

insert into public.location_doors (id, user_id, from_location_id, to_location_id, label)
values ('86900000-0000-4000-8000-000000000025', '86900000-0000-4000-8000-000000000001',
        '86900000-0000-4000-8000-000000000021', '86900000-0000-4000-8000-000000000022', 'Bone Door');

insert into public.quests (id, user_id, campaign_id, title, status)
values ('86900000-0000-4000-8000-000000000030', '86900000-0000-4000-8000-000000000001', '86900000-0000-4000-8000-000000000010', 'The Crypt Below', 'active');

insert into public.quest_objectives (id, quest_id, description, status, is_player_visible, sort_order) values
  ('86900000-0000-4000-8000-000000000051', '86900000-0000-4000-8000-000000000030', 'Clear the Antechamber', 'pending', false, 1),
  ('86900000-0000-4000-8000-000000000052', '86900000-0000-4000-8000-000000000030', 'Follow-on', 'dormant', false, 2);

insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('86900000-0000-4000-8000-000000000041', '86900000-0000-4000-8000-000000000030', '86900000-0000-4000-8000-000000000010', 'Into the crypt');

-- Rule: when the Antechamber gains `cleared` -> complete objective 51.
insert into public.quest_consequences (id, quest_id, on_location_id, on_location_fact, action, target_objective_id)
values ('86900000-0000-4000-8000-000000000071', '86900000-0000-4000-8000-000000000030',
        '86900000-0000-4000-8000-000000000021', 'cleared', 'complete', '86900000-0000-4000-8000-000000000051');

-- Cascade rule: when objective 51 becomes complete -> raise objective 52.
insert into public.quest_consequences (id, quest_id, on_objective_id, on_objective_status, action, target_objective_id)
values ('86900000-0000-4000-8000-000000000072', '86900000-0000-4000-8000-000000000030',
        '86900000-0000-4000-8000-000000000051', 'complete', 'raise', '86900000-0000-4000-8000-000000000052');

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Constraints
-- ════════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_location_id, action, target_objective_id)
    values ('86900000-0000-4000-8000-000000000030', '86900000-0000-4000-8000-000000000021', 'complete', '86900000-0000-4000-8000-000000000051')$$,
  '23514', null,
  'on_location_id without on_location_fact is rejected'
);

select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_location_id, on_location_fact, action, target_objective_id)
    values ('86900000-0000-4000-8000-000000000030', '86900000-0000-4000-8000-000000000021', 'burninated', 'complete', '86900000-0000-4000-8000-000000000051')$$,
  '23514', null,
  'an invalid location fact is rejected'
);

select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_location_id, on_location_fact, on_beat_id, action, target_objective_id)
    values ('86900000-0000-4000-8000-000000000030', '86900000-0000-4000-8000-000000000021', 'cleared',
            '86900000-0000-4000-8000-000000000041', 'complete', '86900000-0000-4000-8000-000000000051')$$,
  '23514', null,
  'a rule with both on_location_id and on_beat_id is rejected by the one-condition check'
);

select throws_ok(
  $$insert into public.quest_consequences (quest_id, on_location_id, on_location_fact, action, target_objective_id)
    values ('86900000-0000-4000-8000-000000000030', '86900000-0000-4000-8000-000000000021', 'cleared', 'complete', '86900000-0000-4000-8000-000000000051')$$,
  '23505', null,
  'the partial unique index rejects a duplicate (location, fact, action, target)'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Firing: an active quest's rule fires when the room is asserted cleared
-- ════════════════════════════════════════════════════════════════════════════

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '86900000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$insert into public.location_state_events (user_id, location_id, fact, value)
    values ('86900000-0000-4000-8000-000000000001', '86900000-0000-4000-8000-000000000021', 'cleared', true)$$,
  'the DM can assert the Antechamber cleared'
);

select is(
  (select status from public.quest_objectives where id = '86900000-0000-4000-8000-000000000051'),
  'complete',
  'the location-watching rule fires and completes its objective'
);

select is(
  (select count(*)::integer from public.quest_beat_transitions
    where transition_kind = 'assert'
      and to_quest_id = '86900000-0000-4000-8000-000000000030'
      and provenance->>'location_id' = '86900000-0000-4000-8000-000000000021'
      and provenance->>'fact' = 'cleared'),
  1,
  'exactly one assert transition carries the location and fact as provenance'
);

select is(
  (select count(*)::integer from public.quest_consequence_events e
    join public.quest_beat_transitions t on t.id = e.transition_id
   where e.consequence_id = '86900000-0000-4000-8000-000000000071'
     and t.transition_kind = 'assert'
     and t.provenance->>'location_id' = '86900000-0000-4000-8000-000000000021'
     and t.provenance->>'fact' = 'cleared'),
  1,
  'exactly one consequence event is logged against that transition'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. A second identical assertion is a new event with a new transition — the
-- rule watches, it does not dedupe across state events (header: "the honest
-- version of the DM ticking the box twice").
-- ════════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$insert into public.location_state_events (user_id, location_id, fact, value)
    values ('86900000-0000-4000-8000-000000000001', '86900000-0000-4000-8000-000000000021', 'cleared', true)$$,
  'the DM asserts cleared a second time'
);

select is(
  (select count(*)::integer from public.quest_beat_transitions
    where transition_kind = 'assert'
      and to_quest_id = '86900000-0000-4000-8000-000000000030'
      and provenance->>'location_id' = '86900000-0000-4000-8000-000000000021'
      and provenance->>'fact' = 'cleared'),
  2,
  'a second identical assertion is a new transition, once per state event'
);

select is(
  (select status from public.quest_objectives where id = '86900000-0000-4000-8000-000000000051'),
  'complete',
  'the objective is unaffected by firing twice -- already complete stays complete'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. value = false does not fire
-- ════════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$insert into public.location_state_events (user_id, location_id, fact, value)
    values ('86900000-0000-4000-8000-000000000001', '86900000-0000-4000-8000-000000000022', 'cleared', false)$$,
  'asserting the OTHER room not-cleared is allowed (no rule watches it anyway)'
);

select is(
  (select count(*)::integer from public.quest_beat_transitions where transition_kind = 'assert' and to_quest_id = '86900000-0000-4000-8000-000000000030'),
  2,
  'a false assertion never creates a transition, only true assertions do'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. A door fact does not fire, even asserted true, against the site
-- ════════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$insert into public.location_state_events (user_id, location_id, door_id, fact, value)
    values ('86900000-0000-4000-8000-000000000001', '86900000-0000-4000-8000-000000000020', '86900000-0000-4000-8000-000000000025', 'unlocked', true)$$,
  'a door fact is logged against the site'
);

select is(
  (select count(*)::integer from public.quest_beat_transitions where transition_kind = 'assert' and to_quest_id = '86900000-0000-4000-8000-000000000030'),
  2,
  'a door fact never fires a location-watching rule, even asserted true'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. A rule on a rumor-status quest does not fire
-- ════════════════════════════════════════════════════════════════════════════

reset role;

insert into public.quests (id, user_id, campaign_id, title, status)
values ('86900000-0000-4000-8000-000000000035', '86900000-0000-4000-8000-000000000001', '86900000-0000-4000-8000-000000000010', 'Rumored Below', 'rumor');

insert into public.quest_objectives (id, quest_id, description, status, sort_order) values
  ('86900000-0000-4000-8000-000000000056', '86900000-0000-4000-8000-000000000035', 'Rumor objective', 'pending', 1);

insert into public.quest_consequences (id, quest_id, on_location_id, on_location_fact, action, target_objective_id)
values ('86900000-0000-4000-8000-000000000076', '86900000-0000-4000-8000-000000000035',
        '86900000-0000-4000-8000-000000000021', 'looted', 'complete', '86900000-0000-4000-8000-000000000056');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '86900000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$insert into public.location_state_events (user_id, location_id, fact, value)
    values ('86900000-0000-4000-8000-000000000001', '86900000-0000-4000-8000-000000000021', 'looted', true)$$,
  'the Antechamber is asserted looted while the watching quest is only a rumor'
);

select is(
  (select status from public.quest_objectives where id = '86900000-0000-4000-8000-000000000056'),
  'pending',
  'a rumor-status quest''s rule does not fire -- it waits for the next assertion once active'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Cascade: completing objective 51 already raised objective 52 in the same
-- engine run (asserted back in section 2) -- confirmed here for the record.
-- ════════════════════════════════════════════════════════════════════════════

select is(
  (select status from public.quest_objectives where id = '86900000-0000-4000-8000-000000000052'),
  'pending',
  'the objective-became rule cascaded in the same run: dormant -> pending'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. The same fact on a location in ANOTHER campaign does not touch this quest
-- ════════════════════════════════════════════════════════════════════════════

reset role;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('86900000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'locfact-otherdm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('86900000-0000-4000-8000-000000000011', '86900000-0000-4000-8000-000000000002', 'Another Table');

insert into public.locations (id, user_id, campaign_id, name, location_type)
values ('86900000-0000-4000-8000-000000000023', '86900000-0000-4000-8000-000000000002', '86900000-0000-4000-8000-000000000011', 'Foreign Antechamber', 'dungeon');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '86900000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$insert into public.location_state_events (user_id, location_id, fact, value)
    values ('86900000-0000-4000-8000-000000000002', '86900000-0000-4000-8000-000000000023', 'cleared', true)$$,
  'a DM in another campaign asserts an unrelated room cleared'
);

reset role;

select is(
  (select count(*)::integer from public.quest_beat_transitions where transition_kind = 'assert' and to_quest_id = '86900000-0000-4000-8000-000000000030'),
  2,
  'a fact in a different campaign never reaches this campaign''s quest'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 9. The trigger and its function's privileges
-- ════════════════════════════════════════════════════════════════════════════

select has_trigger('public', 'location_state_events', 'location_state_events_fire_consequences',
  'the fire-consequences trigger exists on location_state_events');

select is(
  (select nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'fire_location_fact_consequences'),
  'private',
  'the trigger function lives in the private schema'
);

select is(
  (select prosecdef from pg_proc where proname = 'fire_location_fact_consequences'),
  true,
  'the trigger function is security definer'
);

select is(
  (select has_function_privilege('anon', 'private.fire_location_fact_consequences()', 'execute')
   or has_function_privilege('authenticated', 'private.fire_location_fact_consequences()', 'execute')),
  false,
  'the trigger function is not directly executable by anon or authenticated'
);

select * from finish();
rollback;
