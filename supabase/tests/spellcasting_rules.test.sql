begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000549', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'spell-tests@example.invalid', '', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.campaigns (id, user_id, name, ruleset)
values ('00000000-0000-4000-8000-000000000543', '00000000-0000-4000-8000-000000000549', 'Spell test 2024', '2024');

insert into public.party_members (
  id, user_id, campaign_id, name, class, level, cha, proficiency_bonus,
  spell_slots, class_resources, class_choices
) values (
  '00000000-0000-4000-8000-000000000544', '00000000-0000-4000-8000-000000000549',
  '00000000-0000-4000-8000-000000000543', 'Test Sorcerer', 'Sorcerer', 7, 18, 3,
  '[{"level":1,"max":1,"used":0,"pool":"spellcasting","recovery":"long"}]'::jsonb,
  '{"sorcery_points":{"current":7,"max":7,"rest":"long"},"innate_sorcery":{"current":2,"max":2,"rest":"long"}}'::jsonb,
  '{"metamagic_options":["Quickened Spell","Transmuted Spell","Empowered Spell"]}'::jsonb
);

insert into public.character_classes (id, party_member_id, class_name, levels, is_primary)
values ('00000000-0000-4000-8000-000000000546', '00000000-0000-4000-8000-000000000544', 'Sorcerer', 7, true);

insert into public.spells (
  id, user_id, campaign_id, name, level, casting_time, range, duration, description,
  classes, attack_type, damage_rolls, target_description, higher_levels
) values
  ('00000000-0000-4000-8000-000000000547', '00000000-0000-4000-8000-000000000549', '00000000-0000-4000-8000-000000000543',
   'Test Flame', 1, 'Action', '60 ft.', 'Instantaneous', 'Test damage.', array['Sorcerer'], 'automatic',
   '[{"dice":"2d6","type":"fire"}]'::jsonb, '1 creature', 'target one additional creature'),
  ('00000000-0000-4000-8000-000000000548', '00000000-0000-4000-8000-000000000549', '00000000-0000-4000-8000-000000000543',
   'Wrong List', 1, 'Action', '60 ft.', 'Instantaneous', 'Not a Sorcerer spell.', array['Wizard'], 'automatic', null, '1 creature', null),
  ('00000000-0000-4000-8000-000000000550', '00000000-0000-4000-8000-000000000549', '00000000-0000-4000-8000-000000000543',
   'Innate Spark', 1, 'Action', '60 ft.', 'Instantaneous', 'A limited grant.', array[]::text[], 'automatic',
   '[{"dice":"1d6","type":"force"}]'::jsonb, '1 creature', null);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000549';
set local request.jwt.claim.role = 'authenticated';

select is((select ruleset from public.campaigns where id = '00000000-0000-4000-8000-000000000543'), '2024', 'campaign owns the selected ruleset');

select lives_ok($$
  insert into public.character_spells (id, party_member_id, spell_id, source_type, source_class_id, is_prepared)
  values ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000544',
    '00000000-0000-4000-8000-000000000547', 'class', '00000000-0000-4000-8000-000000000546', false)
$$, 'eligible revised class spell can be acquired');

select ok((select is_prepared from public.character_spells where id = '00000000-0000-4000-8000-000000000551'), '2024 prepared classes store acquired spells as prepared');

select throws_matching($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values ('00000000-0000-4000-8000-000000000544', '00000000-0000-4000-8000-000000000548',
    'class', '00000000-0000-4000-8000-000000000546')
$$, '.*not on the Sorcerer spell list.*', 'direct API rejects a spell from the wrong class list');

select throws_matching($$
  select public.cast_character_spell_v3(
    '00000000-0000-4000-8000-000000000544', 1, 'spellcasting',
    '[{"level":1,"max":1,"used":0,"pool":"spellcasting","recovery":"long"}]'::jsonb,
    null, array['Transmuted Spell'], '00000000-0000-4000-8000-000000000551', '{}'::jsonb)
$$, '.*Choose a valid Transmuted Spell damage type.*', 'server requires the Transmuted damage choice');

select lives_ok($$
  select public.cast_character_spell_v3(
    '00000000-0000-4000-8000-000000000544', 1, 'spellcasting',
    '[{"level":1,"max":1,"used":0,"pool":"spellcasting","recovery":"long"}]'::jsonb,
    '{"spellName":"Test Flame","castAtLevel":1}'::jsonb,
    array['Quickened Spell'], '00000000-0000-4000-8000-000000000551', '{}'::jsonb)
$$, 'valid Metamagic, slot, SP, and concentration commit together');

select is((select (spell_slots #>> '{0,used}')::integer from public.party_members where id = '00000000-0000-4000-8000-000000000544'), 1, 'exactly one selected slot is spent');
select is((select (class_resources #>> '{sorcery_points,current}')::integer from public.party_members where id = '00000000-0000-4000-8000-000000000544'), 5, 'Quickened Spell spends exactly 2 SP');
select is((select concentration ->> 'spellName' from public.party_members where id = '00000000-0000-4000-8000-000000000544'), 'Test Flame', 'concentration is committed in the cast transaction');

select throws_matching($$
  select public.cast_character_spell_v3(
    '00000000-0000-4000-8000-000000000544', 1, 'spellcasting',
    '[{"level":1,"max":1,"used":1,"pool":"spellcasting","recovery":"long"}]'::jsonb,
    null, '{}'::text[], '00000000-0000-4000-8000-000000000551', '{}'::jsonb)
$$, '.*No level-1 spell slots remaining.*', 'an exhausted pool cannot cast again');

update public.party_members set class_resources = jsonb_set(class_resources, '{sorcery_points,current}', '0'::jsonb, false),
  class_choices = jsonb_set(class_choices, '{sorcerous_restoration_available}', 'true'::jsonb, true)
where id = '00000000-0000-4000-8000-000000000544';
select lives_ok($$ select public.restore_sorcery_points('00000000-0000-4000-8000-000000000544') $$, 'Sorcerous Restoration succeeds after a Short Rest');
select is((select (class_resources #>> '{sorcery_points,current}')::integer from public.party_members where id = '00000000-0000-4000-8000-000000000544'), 3, 'Restoration regains half Sorcerer level rounded down');
select throws_matching($$ select public.restore_sorcery_points('00000000-0000-4000-8000-000000000544') $$,
  '.*once per Long Rest.*', 'Restoration cannot be repeated before a Long Rest');

insert into public.character_spells (id, party_member_id, spell_id, source_type, uses_per_day, uses_remaining, resets_on, source_label)
values ('00000000-0000-4000-8000-000000000552', '00000000-0000-4000-8000-000000000544',
  '00000000-0000-4000-8000-000000000550', 'feat', 1, 1, 'long_rest', 'Test Feat');
select lives_ok($$
  select public.cast_character_spell_v3('00000000-0000-4000-8000-000000000544', 0, 'feature', '[]'::jsonb,
    null, '{}'::text[], '00000000-0000-4000-8000-000000000552', '{}'::jsonb)
$$, 'limited-use innate spell uses the shared cast transaction');
select is((select uses_remaining from public.character_spells where id = '00000000-0000-4000-8000-000000000552'), 0, 'innate cast spends exactly one use');

select * from finish();
rollback;
