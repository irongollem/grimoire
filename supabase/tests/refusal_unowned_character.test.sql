-- #936: a spellcasting definer RPC refuses a stranger who names a character
-- nobody has claimed.
--
-- The guard in these functions is a negated disjunction over the character's
-- user_id, owner_user_id, the campaign DM and a linked member. owner_user_id is
-- NULL for a DM-managed character no player has taken, so for a stranger the
-- disjunction was false OR NULL OR false = NULL, "not NULL" is NULL, and the
-- "if" never fired: the stranger walked into the body. refusal_spellcasting
-- never saw it because its character always has an owner. This file's
-- character has none, which is the only case that exposes the bug.
--
--   1 Dana  DM of c1            3 Sam  DM of c2 (a stranger to c1)
--   4 Oz    a player at c1, not linked to m1
-- m1 is a DM-managed level 7 2024 Sorcerer with owner_user_id NULL.

begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93620000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'refusal-unowned-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name, ruleset) values
  ('93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000001', 'Dana''s table', '2024'),
  ('93620000-0000-4000-8000-0000000000c2', '93620000-0000-4000-8000-000000000003', 'Sam''s table', '2024');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('93620000-0000-4000-8000-0000000000c2', '93620000-0000-4000-8000-000000000003', 'dm', 'Sam'),
  ('93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000004', 'player', 'Oz')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (
  id, user_id, owner_user_id, is_dm_managed, campaign_id, name, class, level, cha, proficiency_bonus,
  spell_slots, class_resources, class_choices
) values (
  '93620000-0000-4000-8000-0000000000e1', '93620000-0000-4000-8000-000000000001',
  null, true, '93620000-0000-4000-8000-0000000000c1',
  'Unclaimed sorcerer', 'Sorcerer', 7, 18, 3,
  '[{"level":1,"max":4,"used":1,"pool":"spellcasting","recovery":"long"}]'::jsonb,
  '{"sorcery_points":{"current":3,"max":7,"rest":"long"},"innate_sorcery":{"current":2,"max":2,"rest":"long"}}'::jsonb,
  '{"metamagic_options":["Quickened Spell"]}'::jsonb
);

insert into public.character_classes
  (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
values ('93620000-0000-4000-8000-0000000000f1', '93620000-0000-4000-8000-0000000000e1',
  'Sorcerer', 7, true,
  (select id from public.system_classes where ruleset = '2024' and class_name = 'Sorcerer'), 'system');

insert into public.spells (
  id, user_id, campaign_id, name, level, casting_time, range, duration, description,
  classes, attack_type, damage_rolls, target_description
) values
  ('93620000-0000-4000-8000-000000000051', '93620000-0000-4000-8000-000000000001',
   '93620000-0000-4000-8000-0000000000c1', 'Unowned Flame', 1, 'Action', '60 ft.', 'Instantaneous',
   'Test damage.', array['Sorcerer'], 'automatic', '[{"dice":"2d6","type":"fire"}]'::jsonb, '1 creature'),
  ('93620000-0000-4000-8000-000000000052', '93620000-0000-4000-8000-000000000001',
   '93620000-0000-4000-8000-0000000000c1', 'Unowned Spark', 1, 'Action', '60 ft.', 'Instantaneous',
   'More test damage.', array['Sorcerer'], 'automatic', '[{"dice":"1d6","type":"force"}]'::jsonb, '1 creature');

insert into public.character_spells (id, party_member_id, spell_id, source_type, source_class_id, is_prepared, source_label) values
  ('93620000-0000-4000-8000-0000000000b1', '93620000-0000-4000-8000-0000000000e1',
   '93620000-0000-4000-8000-000000000051', 'class', '93620000-0000-4000-8000-0000000000f1', true, null),
  ('93620000-0000-4000-8000-0000000000b2', '93620000-0000-4000-8000-0000000000e1',
   '93620000-0000-4000-8000-000000000053', 'feat', null, true, 'Fixture feat');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"93620000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

-- Definer, so a check reads the row whoever is signed in.
create function pg_temp.slots_used() returns int language sql security definer as $$
  select coalesce((spell_slots -> 0 ->> 'used')::int, 0) from public.party_members
  where id = '93620000-0000-4000-8000-0000000000e1';
$$;

set local role authenticated;

-- ── Refusals: Sam, a stranger to the table ──────────────────────────────────

select pg_temp.as_user(3);

select throws_ok($$ select public.activate_innate_sorcery('93620000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Access denied', 'a stranger cannot activate Innate Sorcery on an unclaimed character');
-- end_innate_sorcery runs as the caller since #936, so RLS hides the row from a
-- stranger before the function's own guard is reached.
select throws_ok($$ select public.end_innate_sorcery('93620000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Party member not found', 'a stranger cannot end Innate Sorcery on an unclaimed character');
select throws_ok($$ select public.convert_sorcery_points('93620000-0000-4000-8000-0000000000e1', 'points_to_slot', 1, 'spellcasting') $$,
  'P0001', 'Access denied', 'a stranger cannot convert sorcery points on an unclaimed character');
select throws_ok($$ select public.restore_sorcery_points('93620000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Access denied', 'a stranger cannot restore sorcery points on an unclaimed character');
select throws_ok($$ select public.take_spellcasting_rest('93620000-0000-4000-8000-0000000000e1', 'long') $$,
  'P0001', 'Access denied', 'a stranger cannot rest an unclaimed character');
select throws_ok($$ select public.cast_character_spell_v4('93620000-0000-4000-8000-0000000000e1', 1, 'spellcasting', null, null, '{}'::text[], '93620000-0000-4000-8000-0000000000b1', '{}'::jsonb) $$,
  'P0001', 'Access denied', 'a stranger cannot cast an unclaimed character''s spell');
select throws_ok($$ select public.change_prepared_spell('93620000-0000-4000-8000-0000000000e1', '93620000-0000-4000-8000-0000000000f1', '93620000-0000-4000-8000-000000000052', '93620000-0000-4000-8000-0000000000b1') $$,
  '42501', 'Not authorized', 'a stranger cannot swap an unclaimed character''s prepared spell');
select throws_ok($$ select public.delete_character_spells('93620000-0000-4000-8000-0000000000e1', '93620000-0000-4000-8000-0000000000b2') $$,
  '42501', 'Not authorized', 'a stranger cannot delete an unclaimed character''s spells');
select throws_ok($$ select public.set_character_spell_prepared('93620000-0000-4000-8000-0000000000b1', false) $$,
  '42501', 'Not authorized', 'a stranger cannot unprepare an unclaimed character''s spell');

-- Oz plays at the same table but not this character.
select pg_temp.as_user(4);

select throws_ok($$ select public.activate_innate_sorcery('93620000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Access denied', 'another player cannot activate Innate Sorcery on an unclaimed character');
select throws_ok($$ select public.take_spellcasting_rest('93620000-0000-4000-8000-0000000000e1', 'short') $$,
  'P0001', 'Access denied', 'another player cannot rest an unclaimed character');
select throws_ok($$ select public.cast_character_spell_v4('93620000-0000-4000-8000-0000000000e1', 1, 'spellcasting', null, null, '{}'::text[], '93620000-0000-4000-8000-0000000000b1', '{}'::jsonb) $$,
  'P0001', 'Access denied', 'another player cannot cast an unclaimed character''s spell');

-- spend_spell_slot and convert_sorcery_points_before_class_guard are not
-- granted to clients, but carry the same guard, so they are called as the
-- table owner with the stranger's identity in the claims.
reset role;
select pg_temp.as_user(3);

select throws_ok($$ select public.spend_spell_slot('93620000-0000-4000-8000-0000000000e1', 1, 'spellcasting', null) $$,
  'P0001', 'Access denied', 'a stranger cannot spend an unclaimed character''s slot');
select throws_ok($$ select public.convert_sorcery_points_before_class_guard('93620000-0000-4000-8000-0000000000e1', 'points_to_slot', 1, 'spellcasting') $$,
  'P0001', 'Access denied', 'the pre-class-guard conversion refuses a stranger too');
select is(pg_temp.slots_used(), 1, 'and no slot was spent by any refused call');

-- ── Positive controls: Dana, the DM of the campaign ─────────────────────────

select pg_temp.as_user(1);

select throws_ok($$ select public.spend_spell_slot('93620000-0000-4000-8000-0000000000e1', 9, 'spellcasting', null) $$,
  'P0001', null, 'the DM gets past the guard of spend_spell_slot (the later refusal is not "Access denied")');
select lives_ok($$ select public.convert_sorcery_points_before_class_guard('93620000-0000-4000-8000-0000000000e1', 'points_to_slot', 1, 'spellcasting') $$,
  'the DM converts through the pre-class-guard function');

set local role authenticated;

select lives_ok($$ select public.activate_innate_sorcery('93620000-0000-4000-8000-0000000000e1') $$,
  'the DM activates Innate Sorcery');
select lives_ok($$ select public.end_innate_sorcery('93620000-0000-4000-8000-0000000000e1') $$,
  'the DM ends Innate Sorcery');
select lives_ok($$ select public.convert_sorcery_points('93620000-0000-4000-8000-0000000000e1', 'slot_to_points', 1, 'spellcasting') $$,
  'the DM converts sorcery points');
select throws_ok($$ select public.restore_sorcery_points('93620000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Sorcerous Restoration requires a Short Rest and is once per Long Rest',
  'the DM gets past authorization (the refusal is the rule, not "Access denied")');
select lives_ok($$ select public.take_spellcasting_rest('93620000-0000-4000-8000-0000000000e1', 'short') $$,
  'the DM takes a short rest');
select lives_ok($$ select public.cast_character_spell_v4('93620000-0000-4000-8000-0000000000e1', 1, 'spellcasting', null, null, '{}'::text[], '93620000-0000-4000-8000-0000000000b1', '{}'::jsonb) $$,
  'the DM casts the character''s spell');
select lives_ok($$ select public.open_spell_change_windows('93620000-0000-4000-8000-0000000000e1', 'level_up') $$,
  'the DM opens spell-change windows');
select throws_ok($$ select public.set_character_spell_prepared('93620000-0000-4000-8000-0000000000b1', false) $$,
  'P0001', 'This class changes prepared spells by replacement',
  'the DM gets past authorization (the refusal is the class rule)');
select lives_ok($$ select public.change_prepared_spell('93620000-0000-4000-8000-0000000000e1', '93620000-0000-4000-8000-0000000000f1', '93620000-0000-4000-8000-000000000052', '93620000-0000-4000-8000-0000000000b1') $$,
  'the DM swaps a prepared spell inside the open window');
select is(public.delete_character_spells('93620000-0000-4000-8000-0000000000e1', '93620000-0000-4000-8000-0000000000b2'), 1,
  'the DM deletes a spell grant');

select * from finish();
rollback;
