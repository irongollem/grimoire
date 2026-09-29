-- #936: the spellcasting and character-progression definer RPCs refuse a caller
-- who has no right to the character they name.
--
-- The attack in every case is the one that matters: a legitimate user (Sam runs
-- his own table, Oz plays at Dana's) naming SOMEONE ELSE'S character. Each
-- refusal sits beside a positive control as the rightful caller, so it proves
-- the authorization branch fired rather than that the fixture was broken.
--
--   1 Dana  DM of c1            3 Sam  DM of c2 (a stranger to c1)
--   2 Pia   plays m1 at c1      4 Oz   another player at c1, not linked to m1
-- m1 is Pia's level 7 2024 Sorcerer.

begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93610000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'refusal-spell-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name, ruleset) values
  ('93610000-0000-4000-8000-0000000000c1', '93610000-0000-4000-8000-000000000001', 'Dana''s table', '2024'),
  ('93610000-0000-4000-8000-0000000000c2', '93610000-0000-4000-8000-000000000003', 'Sam''s table', '2024');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('93610000-0000-4000-8000-0000000000c1', '93610000-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('93610000-0000-4000-8000-0000000000c2', '93610000-0000-4000-8000-000000000003', 'dm', 'Sam'),
  ('93610000-0000-4000-8000-0000000000c1', '93610000-0000-4000-8000-000000000002', 'player', 'Pia'),
  ('93610000-0000-4000-8000-0000000000c1', '93610000-0000-4000-8000-000000000004', 'player', 'Oz')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (
  id, user_id, owner_user_id, campaign_id, name, class, level, cha, proficiency_bonus,
  spell_slots, class_resources, class_choices
) values (
  '93610000-0000-4000-8000-0000000000e1', '93610000-0000-4000-8000-000000000002',
  '93610000-0000-4000-8000-000000000002', '93610000-0000-4000-8000-0000000000c1',
  'Pia''s sorcerer', 'Sorcerer', 7, 18, 3,
  '[{"level":1,"max":2,"used":1,"pool":"spellcasting","recovery":"long"}]'::jsonb,
  '{"sorcery_points":{"current":3,"max":7,"rest":"long"},"innate_sorcery":{"current":2,"max":2,"rest":"long"}}'::jsonb,
  '{"metamagic_options":["Quickened Spell"]}'::jsonb
);

-- Linking goes through the admission path, as a join does.
select set_config('grimoire.pm_campaign_transition', 'on', true);
update public.campaign_members
   set party_member_id = '93610000-0000-4000-8000-0000000000e1'
 where campaign_id = '93610000-0000-4000-8000-0000000000c1'
   and user_id = '93610000-0000-4000-8000-000000000002';
select set_config('grimoire.pm_campaign_transition', 'off', true);

insert into public.character_classes
  (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
values ('93610000-0000-4000-8000-0000000000f1', '93610000-0000-4000-8000-0000000000e1',
  'Sorcerer', 7, true,
  (select id from public.system_classes where ruleset = '2024' and class_name = 'Sorcerer'), 'system');

insert into public.spells (
  id, user_id, campaign_id, name, level, casting_time, range, duration, description,
  classes, attack_type, damage_rolls, target_description
) values
  ('93610000-0000-4000-8000-000000000051', '93610000-0000-4000-8000-000000000001',
   '93610000-0000-4000-8000-0000000000c1', 'Refusal Flame', 1, 'Action', '60 ft.', 'Instantaneous',
   'Test damage.', array['Sorcerer'], 'automatic', '[{"dice":"2d6","type":"fire"}]'::jsonb, '1 creature'),
  ('93610000-0000-4000-8000-000000000052', '93610000-0000-4000-8000-000000000001',
   '93610000-0000-4000-8000-0000000000c1', 'Refusal Spark', 1, 'Action', '60 ft.', 'Instantaneous',
   'More test damage.', array['Sorcerer'], 'automatic', '[{"dice":"1d6","type":"force"}]'::jsonb, '1 creature');

insert into public.character_spells (id, party_member_id, spell_id, source_type, source_class_id, is_prepared, source_label) values
  ('93610000-0000-4000-8000-0000000000b1', '93610000-0000-4000-8000-0000000000e1',
   '93610000-0000-4000-8000-000000000051', 'class', '93610000-0000-4000-8000-0000000000f1', true, null),
  ('93610000-0000-4000-8000-0000000000b2', '93610000-0000-4000-8000-0000000000e1',
   '93610000-0000-4000-8000-000000000053', 'feat', null, true, 'Fixture feat');

insert into public.species (id, user_id, name, is_shapeshifter)
values ('93610000-0000-4000-8000-0000000000d1', '93610000-0000-4000-8000-000000000001', 'Refusal Changeling', true);

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"93610000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

-- Definer, so a check reads the row whoever is signed in: the refused caller
-- cannot see it through RLS, and a check made as them would pass vacuously.
create function pg_temp.disguise() returns text language sql security definer as $$
  select disguise_race from public.party_members where id = '93610000-0000-4000-8000-0000000000e1';
$$;

set local role authenticated;

-- ── Refusals: Sam (stranger) and Oz (a player, not this character's) ─────────

select pg_temp.as_user(3);

select throws_ok($$ select public.activate_innate_sorcery('93610000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Access denied', 'a stranger cannot activate another table''s Innate Sorcery');
select throws_ok($$ select public.end_innate_sorcery('93610000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Access denied', 'a stranger cannot end another table''s Innate Sorcery');
select throws_ok($$ select public.convert_sorcery_points('93610000-0000-4000-8000-0000000000e1', 'points_to_slot', 1, 'spellcasting') $$,
  'P0001', 'Access denied', 'a stranger cannot convert another character''s sorcery points');
select throws_ok($$ select public.restore_sorcery_points('93610000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Access denied', 'a stranger cannot restore another character''s sorcery points');
select throws_ok($$ select public.take_spellcasting_rest('93610000-0000-4000-8000-0000000000e1', 'long') $$,
  'P0001', 'Access denied', 'a stranger cannot rest another character');
select throws_ok($$ select public.cast_character_spell_v4('93610000-0000-4000-8000-0000000000e1', 1, 'spellcasting', null, null, '{}'::text[], '93610000-0000-4000-8000-0000000000b1', '{}'::jsonb) $$,
  'P0001', 'Access denied', 'a stranger cannot cast another character''s spell');
select throws_ok($$ select public.change_prepared_spell('93610000-0000-4000-8000-0000000000e1', '93610000-0000-4000-8000-0000000000f1', '93610000-0000-4000-8000-000000000052', '93610000-0000-4000-8000-0000000000b1') $$,
  '42501', 'Not authorized', 'a stranger cannot swap another character''s prepared spell');
select throws_ok($$ select public.delete_character_spells('93610000-0000-4000-8000-0000000000e1', '93610000-0000-4000-8000-0000000000b2') $$,
  '42501', 'Not authorized', 'a stranger cannot delete another character''s spells');
select throws_ok($$ select public.open_spell_change_windows('93610000-0000-4000-8000-0000000000e1', 'long_rest') $$,
  '42501', 'Not authorized', 'a stranger cannot open another character''s spell-change windows');
select throws_ok($$ select public.set_character_spell_prepared('93610000-0000-4000-8000-0000000000b1', false) $$,
  '42501', 'Not authorized', 'a stranger cannot unprepare another character''s spell');
select throws_ok($$ select public.apply_de_level('93610000-0000-4000-8000-0000000000e1', '{"level":1,"max_hp":1}'::jsonb) $$,
  '42501', 'apply_de_level: not authorized for member 93610000-0000-4000-8000-0000000000e1',
  'a stranger cannot de-level another character');
select throws_ok($$ select public.apply_level_up('93610000-0000-4000-8000-0000000000e1', '{"level":8}'::jsonb) $$,
  '42501', 'apply_level_up: not authorized for member 93610000-0000-4000-8000-0000000000e1',
  'a stranger cannot level up another character');

-- The shapeshifter pair used to answer a refused caller with a silent no-op;
-- since 20260929220011 it raises like its siblings. The row is still read
-- back, so a refusal that raised but wrote anyway would be caught.
select throws_ok($$ select public.set_shapeshifter_appearance('93610000-0000-4000-8000-0000000000e1', '93610000-0000-4000-8000-0000000000d1') $$,
  'P0001', 'Access denied', 'set_shapeshifter_appearance by a stranger is refused');
select is(pg_temp.disguise(), null,
  'a stranger cannot disguise another player''s character');

-- Oz plays at the same table but not this character.
select pg_temp.as_user(4);

select throws_ok($$ select public.activate_innate_sorcery('93610000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Access denied', 'another player at the table cannot activate Innate Sorcery');
select throws_ok($$ select public.take_spellcasting_rest('93610000-0000-4000-8000-0000000000e1', 'short') $$,
  'P0001', 'Access denied', 'another player at the table cannot rest the character');
select throws_ok($$ select public.cast_character_spell_v4('93610000-0000-4000-8000-0000000000e1', 1, 'spellcasting', null, null, '{}'::text[], '93610000-0000-4000-8000-0000000000b1', '{}'::jsonb) $$,
  'P0001', 'Access denied', 'another player at the table cannot cast the character''s spell');
select throws_ok($$ select public.open_spell_change_windows('93610000-0000-4000-8000-0000000000e1', 'level_up') $$,
  '42501', 'Not authorized', 'another player at the table cannot open the character''s windows');
select throws_ok($$ select public.delete_character_spells('93610000-0000-4000-8000-0000000000e1', '93610000-0000-4000-8000-0000000000b2') $$,
  '42501', 'Not authorized', 'another player at the table cannot delete the character''s spells');
select throws_ok($$ select public.set_character_spell_prepared('93610000-0000-4000-8000-0000000000b1', false) $$,
  '42501', 'Not authorized', 'another player at the table cannot unprepare the character''s spell');
select throws_ok($$ select public.apply_level_up('93610000-0000-4000-8000-0000000000e1', '{"level":8}'::jsonb) $$,
  '42501', 'apply_level_up: not authorized for member 93610000-0000-4000-8000-0000000000e1',
  'another player at the table cannot level the character up');
select throws_ok($$ select public.clear_shapeshifter_appearance('93610000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Access denied', 'clear_shapeshifter_appearance by another player is refused');

-- ── Positive controls: Pia, whose character it is ────────────────────────────

select pg_temp.as_user(2);

select lives_ok($$ select public.set_shapeshifter_appearance('93610000-0000-4000-8000-0000000000e1', '93610000-0000-4000-8000-0000000000d1') $$,
  'the owner sets the disguise');
select is(pg_temp.disguise(), 'Refusal Changeling',
  'the owner''s disguise took effect, so the stranger''s refusal was about who they are');
select pg_temp.as_user(3);
select throws_ok($$ select public.clear_shapeshifter_appearance('93610000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Access denied', 'clear_shapeshifter_appearance by a stranger is refused');
select is(pg_temp.disguise(), 'Refusal Changeling',
  'a stranger cannot clear another player''s disguise');
select pg_temp.as_user(2);
select lives_ok($$ select public.clear_shapeshifter_appearance('93610000-0000-4000-8000-0000000000e1') $$,
  'the owner clears the disguise');

select lives_ok($$ select public.activate_innate_sorcery('93610000-0000-4000-8000-0000000000e1') $$,
  'the owner activates Innate Sorcery');
select lives_ok($$ select public.end_innate_sorcery('93610000-0000-4000-8000-0000000000e1') $$,
  'the owner ends Innate Sorcery');
select lives_ok($$ select public.convert_sorcery_points('93610000-0000-4000-8000-0000000000e1', 'points_to_slot', 1, 'spellcasting') $$,
  'the owner converts sorcery points');
select throws_ok($$ select public.restore_sorcery_points('93610000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Sorcerous Restoration requires a Short Rest and is once per Long Rest',
  'the owner gets past authorization (the refusal is the rule, not "Access denied")');
select lives_ok($$ select public.take_spellcasting_rest('93610000-0000-4000-8000-0000000000e1', 'short') $$,
  'the owner takes a short rest');
select lives_ok($$ select public.cast_character_spell_v4('93610000-0000-4000-8000-0000000000e1', 1, 'spellcasting', null, null, '{}'::text[], '93610000-0000-4000-8000-0000000000b1', '{}'::jsonb) $$,
  'the owner casts their own spell');
select lives_ok($$ select public.open_spell_change_windows('93610000-0000-4000-8000-0000000000e1', 'level_up') $$,
  'the owner opens spell-change windows');
select throws_ok($$ select public.set_character_spell_prepared('93610000-0000-4000-8000-0000000000b1', false) $$,
  'P0001', 'This class changes prepared spells by replacement',
  'the owner gets past authorization (the refusal is the class rule)');
select lives_ok($$ select public.change_prepared_spell('93610000-0000-4000-8000-0000000000e1', '93610000-0000-4000-8000-0000000000f1', '93610000-0000-4000-8000-000000000052', '93610000-0000-4000-8000-0000000000b1') $$,
  'the owner swaps a prepared spell inside the open window');
select is(public.delete_character_spells('93610000-0000-4000-8000-0000000000e1', '93610000-0000-4000-8000-0000000000b2'), 1,
  'the owner deletes their own spell grant');
select throws_ok($$ select public.apply_level_up('93610000-0000-4000-8000-0000000000e1', '{"level":12}'::jsonb) $$,
  'P0001', 'apply_level_up: member level must increase by exactly one',
  'the owner gets past authorization (the refusal is the level rule)');
select lives_ok($$ select public.apply_de_level('93610000-0000-4000-8000-0000000000e1', '{"max_hp":9}'::jsonb) $$,
  'the owner de-levels their own character');
select is((select max_hp from public.party_members where id = '93610000-0000-4000-8000-0000000000e1'), 9,
  'and the change landed');

select * from finish();
rollback;
