begin;

create extension if not exists pgtap with schema extensions;
select plan(64);

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

insert into public.character_classes
  (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
values ('00000000-0000-4000-8000-000000000546', '00000000-0000-4000-8000-000000000544',
  'Sorcerer', 7, true,
  (select id from public.system_classes where ruleset = '2024' and class_name = 'Sorcerer'), 'system');

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
   '[{"dice":"1d6","type":"force"}]'::jsonb, '1 creature', null),
  ('00000000-0000-4000-8000-000000000553', '00000000-0000-4000-8000-000000000549', '00000000-0000-4000-8000-000000000543',
   'False Ritual', 1, 'Action', '60 ft.', 'Instantaneous', 'Not a ritual.', array['Sorcerer'], 'automatic', null, '1 creature', null),
  ('00000000-0000-4000-8000-000000000554', '00000000-0000-4000-8000-000000000549', '00000000-0000-4000-8000-000000000543',
   'True Ritual', 1, 'Action', '60 ft.', 'Instantaneous', 'A ritual.', array['Sorcerer'], 'automatic', null, '1 creature', null),
  ('00000000-0000-4000-8000-000000000557', '00000000-0000-4000-8000-000000000549', '00000000-0000-4000-8000-000000000543',
   'Level Eight Choice', 1, 'Action', '60 ft.', 'Instantaneous', 'A level-up choice.', array['Sorcerer'], 'automatic', null, '1 creature', null),
  ('00000000-0000-4000-8000-000000000562', '00000000-0000-4000-8000-000000000549', '00000000-0000-4000-8000-000000000543',
   'Granted Choice', 1, 'Action', '60 ft.', 'Instantaneous', 'An always prepared grant.', array[]::text[], 'automatic', null, '1 creature', null),
  ('00000000-0000-4000-8000-000000000565', '00000000-0000-4000-8000-000000000549', '00000000-0000-4000-8000-000000000543',
   'Bonus Flame', 1, 'Bonus Action', '60 ft.', 'Instantaneous', 'A bonus action spell.', array['Sorcerer'], 'automatic', null, '1 creature', null);

update public.spells set ritual = true where id = '00000000-0000-4000-8000-000000000554';

insert into public.srd_spells (
  id, name, level, school, casting_time, range, duration, description, classes,
  conceptual_key, ruleset, source_document_key, source_record_key, source_revision
) values
  ('test-edition-flame-2024', 'Edition Flame', 1, 'evocation', 'Action', '60 ft.', 'Instantaneous',
    'Revised version.', array['Sorcerer'], 'edition_flame', '2024', 'spell-test-2024', 'edition-flame', 'test'),
  ('test-edition-flame-2014', 'Edition Flame', 1, 'evocation', 'Action', '60 ft.', 'Instantaneous',
    'Original version.', array['Sorcerer'], 'edition_flame', '2014', 'spell-test-2014', 'edition-flame', 'test');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000549';
set local request.jwt.claim.role = 'authenticated';

select is((select ruleset from public.campaigns where id = '00000000-0000-4000-8000-000000000543'), '2024', 'campaign owns the selected ruleset');

select lives_ok($$
  insert into public.character_spells (id, party_member_id, spell_id, source_type, source_class_id, is_prepared)
  values ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000544',
    '00000000-0000-4000-8000-000000000547', 'class', '00000000-0000-4000-8000-000000000546', false)
$$, 'eligible revised class spell can be acquired');

select ok((select is_prepared from public.character_spells where id = '00000000-0000-4000-8000-000000000551'), '2024 prepared classes store acquired spells as prepared');

insert into public.custom_classes
  (id, user_id, campaign_id, class_name, caster_type, spells_known, cantrips_known)
values
  ('00000000-0000-4000-8000-000000000570', '00000000-0000-4000-8000-000000000549',
   '00000000-0000-4000-8000-000000000543', 'Sorcerer', 'known', '[1,3]'::jsonb,
   array[1,1]);
update public.custom_classes
set spell_slots = '[[2],[3]]'::jsonb
where id = '00000000-0000-4000-8000-000000000570';
insert into public.party_members (id, user_id, campaign_id, name, class, level)
values ('00000000-0000-4000-8000-000000000563', '00000000-0000-4000-8000-000000000549',
  '00000000-0000-4000-8000-000000000543', 'Custom Sorcerer', 'Sorcerer', 1);
insert into public.character_classes
  (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
values ('00000000-0000-4000-8000-000000000564', '00000000-0000-4000-8000-000000000563',
  'Sorcerer', 1, true, '00000000-0000-4000-8000-000000000570', 'custom');
select is((select spell_count from public.required_level_up_spell_choices(
  '00000000-0000-4000-8000-000000000563', 'Sorcerer', 2, 'custom',
  '00000000-0000-4000-8000-000000000570')), 2,
  'same-named custom classes use their pinned acquisition progression, not official rules');
select throws_matching($$
  select public.apply_level_up(
    '00000000-0000-4000-8000-000000000563', '{"level":2}'::jsonb,
    '{"op":"update","id":"00000000-0000-4000-8000-000000000564","levels":2}'::jsonb,
    '[{"spell_id":"00000000-0000-4000-8000-000000000557"},{"spell_id":"00000000-0000-4000-8000-000000000557"}]'::jsonb)
$$, '.*requires 2 spell and 0 cantrip choices.*',
  'duplicate level-up spell ids cannot satisfy multiple required choices');
select lives_ok($$
  insert into public.character_spells
    (party_member_id, spell_id, source_type, source_class_id, is_prepared)
  values ('00000000-0000-4000-8000-000000000563', '00000000-0000-4000-8000-000000000547',
    'class', '00000000-0000-4000-8000-000000000564', false);
  select public.set_character_spell_prepared(
    (select id from public.character_spells
     where party_member_id = '00000000-0000-4000-8000-000000000563'
       and spell_id = '00000000-0000-4000-8000-000000000547'), true)
$$, 'same-named custom classes do not inherit official preparation timing');
select throws_matching($$
  select public.activate_innate_sorcery('00000000-0000-4000-8000-000000000563')
$$, '.*requires a 2024 Sorcerer.*',
  'same-named custom classes do not inherit official revised Sorcerer features');
update public.party_members set
  spell_slots = '[{"level":1,"max":1,"used":0,"pool":"spellcasting","recovery":"long"}]'::jsonb,
  class_resources = '{"sorcery_points":{"current":2,"max":2,"rest":"long"}}'::jsonb,
  class_choices = '{"metamagic_options":["Quickened Spell"]}'::jsonb
where id = '00000000-0000-4000-8000-000000000563';
select throws_matching($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000563', 1, 'spellcasting', '[]'::jsonb,
    null, array['Quickened Spell'],
    (select id from public.character_spells
      where party_member_id = '00000000-0000-4000-8000-000000000563'
        and spell_id = '00000000-0000-4000-8000-000000000547'), '{}'::jsonb)
$$, '.*Metamagic requires an eligible Sorcerer.*',
  'same-named custom classes cannot invoke Metamagic by fabricating resource state');
select throws_matching($$
  select public.convert_sorcery_points(
    '00000000-0000-4000-8000-000000000563', 'points_to_slot', 1, 'spellcasting')
$$, '.*Flexible Casting requires an eligible Sorcerer.*',
  'same-named custom classes cannot invoke Flexible Casting by fabricating resource state');

insert into public.character_spells (id, party_member_id, spell_id, source_type, source_class_id, is_prepared)
values
  ('00000000-0000-4000-8000-000000000555', '00000000-0000-4000-8000-000000000544',
    '00000000-0000-4000-8000-000000000553', 'class', '00000000-0000-4000-8000-000000000546', true),
  ('00000000-0000-4000-8000-000000000556', '00000000-0000-4000-8000-000000000544',
    '00000000-0000-4000-8000-000000000554', 'class', '00000000-0000-4000-8000-000000000546', true);

select throws_matching($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000544', 0, 'spellcasting', '[]'::jsonb,
    null, '{}'::text[], '00000000-0000-4000-8000-000000000555', '{}'::jsonb)
$$, '.*does not have the Ritual tag.*', 'direct API cannot turn a leveled non-ritual spell into a free cast');

select lives_ok($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000544', 0, 'spellcasting', '[]'::jsonb,
    null, '{}'::text[], '00000000-0000-4000-8000-000000000556', '{}'::jsonb)
$$, 'eligible revised ritual cast spends no slot');
select is((select cast_method from public.spell_cast_records where character_spell_id = '00000000-0000-4000-8000-000000000556'),
  'ritual', 'ritual method is recorded atomically');
select is((select cast_level from public.spell_cast_records where character_spell_id = '00000000-0000-4000-8000-000000000556'),
  1, 'a slot-free ritual records the spell base level rather than level zero');

select throws_matching($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values ('00000000-0000-4000-8000-000000000544', '00000000-0000-4000-8000-000000000548',
    'class', '00000000-0000-4000-8000-000000000546')
$$, '.*not on the Sorcerer spell list.*', 'direct API rejects a spell from the wrong class list');

select throws_matching($$
  update public.character_spells set is_prepared = false
  where id = '00000000-0000-4000-8000-000000000551'
$$, '.*active class change window.*', 'direct API cannot bypass revised preparation timing');
select throws_matching($$
  select public.delete_character_spells(
    '00000000-0000-4000-8000-000000000544',
    '00000000-0000-4000-8000-000000000551')
$$, '.*active replacement window.*', 'direct API cannot delete then re-add a revised class spell');

insert into public.spells (
  id, user_id, campaign_id, name, level, casting_time, range, duration, description,
  classes, attack_type, damage_rolls, target_description, higher_levels
) values (
  '00000000-0000-4000-8000-000000000582', '00000000-0000-4000-8000-000000000549', '00000000-0000-4000-8000-000000000543',
  'Test Cantrip', 0, 'Action', '60 ft.', 'Instantaneous', 'A cantrip.', array['Sorcerer'], 'automatic', null, '1 creature', null
);
insert into public.character_spells (id, party_member_id, spell_id, source_type, source_class_id, is_prepared)
values ('00000000-0000-4000-8000-000000000583', '00000000-0000-4000-8000-000000000544',
  '00000000-0000-4000-8000-000000000582', 'class', '00000000-0000-4000-8000-000000000546', true);
select lives_ok($$
  select public.delete_character_spells(
    '00000000-0000-4000-8000-000000000544', '00000000-0000-4000-8000-000000000583')
$$, 'a class cantrip can be deleted even without an active replacement window');

select lives_ok($$
  insert into public.character_spells
    (id, party_member_id, spell_id, source_type, source_class_id, is_prepared, always_prepared)
  values ('00000000-0000-4000-8000-000000000558', '00000000-0000-4000-8000-000000000544',
    '00000000-0000-4000-8000-000000000562', 'class', '00000000-0000-4000-8000-000000000546', true, true)
$$, 'always-prepared grants bypass class list and preparation limits');
insert into public.character_spells
  (id, party_member_id, spell_id, source_type, source_class_id, is_prepared, always_prepared)
values ('00000000-0000-4000-8000-000000000572', '00000000-0000-4000-8000-000000000544',
  'test-edition-flame-2024', 'class', '00000000-0000-4000-8000-000000000546', true, true);

select throws_matching($$
  select public.apply_level_up(
    '00000000-0000-4000-8000-000000000544', '{"level":8}'::jsonb,
    '{"op":"update","id":"00000000-0000-4000-8000-000000000546","levels":8}'::jsonb,
    '[]'::jsonb)
$$, '.*requires 1 spell and 0 cantrip choices.*', 'direct level-up API rejects missing required spell choices');

select throws_matching($$
  select public.apply_level_up(
    '00000000-0000-4000-8000-000000000544', '{"level":8}'::jsonb,
    '{"op":"update","id":"00000000-0000-4000-8000-000000000546","levels":8}'::jsonb,
    '[{"spell_id":"00000000-0000-4000-8000-000000000557","source_class_id":"00000000-0000-4000-8000-000000000564"}]'::jsonb)
$$, '.*must use the class being leveled.*',
  'level-up spell choices cannot be assigned to a different source class');

select lives_ok($$
  select public.apply_level_up(
    '00000000-0000-4000-8000-000000000544', '{"level":8}'::jsonb,
    '{"op":"update","id":"00000000-0000-4000-8000-000000000546","levels":8}'::jsonb,
    '[{"spell_id":"00000000-0000-4000-8000-000000000557"}]'::jsonb)
$$, 'level-up atomically accepts the exact required spell choices');
select is((select levels from public.character_classes where id = '00000000-0000-4000-8000-000000000546'),
  8, 'level-up advances the selected source class');
select lives_ok($$
  select public.apply_de_level(
    '00000000-0000-4000-8000-000000000544', '{"level":7}'::jsonb,
    '{"op":"update","id":"00000000-0000-4000-8000-000000000546","levels":7}'::jsonb,
    array['00000000-0000-4000-8000-000000000557']::text[])
$$, 'de-level reverses the class and learned-spell changes atomically');
select is((select count(*)::integer from public.character_spells
  where party_member_id = '00000000-0000-4000-8000-000000000544'
    and spell_id = '00000000-0000-4000-8000-000000000557'), 0,
  'de-level removes the spell learned at that level');

select throws_matching($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000544', 1, 'spellcasting',
    '[{"level":1,"max":1,"used":0,"pool":"spellcasting","recovery":"long"}]'::jsonb,
    null, array['Transmuted Spell'], '00000000-0000-4000-8000-000000000551', '{}'::jsonb)
$$, '.*Choose a valid Transmuted Spell damage type.*', 'server requires the Transmuted damage choice');

select lives_ok($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000544', 1, 'spellcasting',
    '[{"level":1,"max":1,"used":0,"pool":"spellcasting","recovery":"long"}]'::jsonb,
    '{"spellName":"Test Flame","castAtLevel":1}'::jsonb,
    array['Quickened Spell'], '00000000-0000-4000-8000-000000000551', '{}'::jsonb)
$$, 'valid Metamagic, slot, SP, and concentration commit together');

select is((select (spell_slots #>> '{0,used}')::integer from public.party_members where id = '00000000-0000-4000-8000-000000000544'), 1, 'exactly one selected slot is spent');
select is((select (class_resources #>> '{sorcery_points,current}')::integer from public.party_members where id = '00000000-0000-4000-8000-000000000544'), 5, 'Quickened Spell spends exactly 2 SP');
select is((select concentration ->> 'spellName' from public.party_members where id = '00000000-0000-4000-8000-000000000544'), 'Test Flame', 'concentration is committed in the cast transaction');
select is((select cast_method from public.spell_cast_records where character_spell_id = '00000000-0000-4000-8000-000000000551'),
  'slot', 'slot cast record commits with the resource spend');

select lives_ok(format($sql$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000544', 0, 'spellcasting', '[]'::jsonb,
    null, array['Empowered Spell'], '00000000-0000-4000-8000-000000000551', '{}'::jsonb, %L::uuid)
$sql$, (select id from public.spell_cast_records where character_spell_id = '00000000-0000-4000-8000-000000000551')),
  'Empowered Spell binds to the exact completed cast');
select throws_matching(format($sql$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000544', 0, 'spellcasting', '[]'::jsonb,
    null, array['Empowered Spell'], '00000000-0000-4000-8000-000000000551', '{}'::jsonb, %L::uuid)
$sql$, (select id from public.spell_cast_records where character_spell_id = '00000000-0000-4000-8000-000000000551')),
  '.*already used on this cast.*', 'the same reactive option cannot be applied twice');

select throws_matching($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000544', 1, 'spellcasting',
    '[{"level":1,"max":99,"used":0,"pool":"spellcasting","recovery":"long"}]'::jsonb,
    null, '{}'::text[], '00000000-0000-4000-8000-000000000551', '{}'::jsonb)
$$, '.*No level-1 spell slots remaining.*', 'an exhausted pool cannot be enlarged by a forged client template');

-- A legacy character with a genuinely empty spell_slots array (never
-- populated) cannot spend a slot without a template, but a trusted template
-- can fill in the missing pool for a one-time reconciliation.
insert into public.party_members (
  id, user_id, campaign_id, name, class, level, cha, proficiency_bonus, spell_slots
) values (
  '00000000-0000-4000-8000-000000000575', '00000000-0000-4000-8000-000000000549',
  '00000000-0000-4000-8000-000000000543', 'Legacy Sorcerer', 'Sorcerer', 5, 16, 3, '[]'::jsonb
);
insert into public.character_classes
  (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
values ('00000000-0000-4000-8000-000000000576', '00000000-0000-4000-8000-000000000575',
  'Sorcerer', 5, true,
  (select id from public.system_classes where ruleset = '2024' and class_name = 'Sorcerer'), 'system');
insert into public.character_spells (id, party_member_id, spell_id, source_type, source_class_id, is_prepared)
values ('00000000-0000-4000-8000-000000000577', '00000000-0000-4000-8000-000000000575',
  '00000000-0000-4000-8000-000000000547', 'class', '00000000-0000-4000-8000-000000000576', true);
select throws_matching($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000575', 1, 'spellcasting', null, null, '{}'::text[],
    '00000000-0000-4000-8000-000000000577', '{}'::jsonb)
$$, '.*No level-1 spell slot pool exists.*',
  'a legacy empty pool with no client template cannot be spent');
select lives_ok($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000575', 1, 'spellcasting',
    '[{"level":1,"max":2,"pool":"spellcasting","recovery":"long"}]'::jsonb, null, '{}'::text[],
    '00000000-0000-4000-8000-000000000577', '{}'::jsonb)
$$, 'a legacy empty spell slot pool is filled in from a trusted client template');
select is((select spell_slots from public.party_members where id = '00000000-0000-4000-8000-000000000575'),
  '[{"level": 1, "max": 2, "pool": "spellcasting", "used": 1, "recovery": "long"}]'::jsonb,
  'the reconciled pool starts from the template maximum with exactly one slot spent');

-- A Wizard's long-rest-timing preparation window must exist from the moment
-- the class is created (not only after the character's first long rest), and
-- an unprepared spellbook ritual must remain castable.
insert into public.spells (
  id, user_id, campaign_id, name, level, casting_time, range, duration, description,
  classes, attack_type, damage_rolls, target_description, higher_levels
) values (
  '00000000-0000-4000-8000-000000000578', '00000000-0000-4000-8000-000000000549', '00000000-0000-4000-8000-000000000543',
  'Test Wizard Ritual', 1, 'Action', '60 ft.', 'Instantaneous', 'A ritual only Wizards know.', array['Wizard'], 'automatic',
  null, '1 creature', null
);
update public.spells set ritual = true where id = '00000000-0000-4000-8000-000000000578';
insert into public.spells (
  id, user_id, campaign_id, name, level, casting_time, range, duration, description,
  classes, attack_type, damage_rolls, target_description, higher_levels
) values (
  '00000000-0000-4000-8000-000000000584', '00000000-0000-4000-8000-000000000549', '00000000-0000-4000-8000-000000000543',
  'Test Wizard Bolt', 1, 'Action', '60 ft.', 'Instantaneous', 'A leveled spell.', array['Wizard'], 'automatic',
  '[{"dice":"2d6","type":"force"}]'::jsonb, '1 creature', null
);
insert into public.party_members (id, user_id, campaign_id, name, class, level, "int", proficiency_bonus, spell_slots)
values ('00000000-0000-4000-8000-000000000579', '00000000-0000-4000-8000-000000000549',
  '00000000-0000-4000-8000-000000000543', 'Test Wizard', 'Wizard', 3, 16, 2,
  '[{"level":1,"max":1,"used":0,"pool":"spellcasting","recovery":"long"}]'::jsonb);
insert into public.character_classes
  (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
values ('00000000-0000-4000-8000-000000000580', '00000000-0000-4000-8000-000000000579',
  'Wizard', 3, true,
  (select id from public.system_classes where ruleset = '2024' and class_name = 'Wizard'), 'system');
select ok(exists(
  select 1 from public.spell_change_windows
  where party_member_id = '00000000-0000-4000-8000-000000000579'
    and source_class_id = '00000000-0000-4000-8000-000000000580'
    and change_timing = 'long_rest'
), 'a long-rest-timing preparation window opens at class creation, not only after a long rest');

insert into public.character_spells
  (id, party_member_id, spell_id, source_type, source_class_id, is_known, is_prepared)
values ('00000000-0000-4000-8000-000000000581', '00000000-0000-4000-8000-000000000579',
  '00000000-0000-4000-8000-000000000578', 'class', '00000000-0000-4000-8000-000000000580', true, false);
select lives_ok($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000579', 0, 'spellcasting', '[]'::jsonb,
    null, '{}'::text[], '00000000-0000-4000-8000-000000000581', '{}'::jsonb)
$$, 'an unprepared Wizard spellbook ritual can still be cast');
select is((select cast_method from public.spell_cast_records where character_spell_id = '00000000-0000-4000-8000-000000000581'),
  'ritual', 'the unprepared spellbook ritual records as a ritual cast');

insert into public.character_spells
  (id, party_member_id, spell_id, source_type, source_class_id, is_known, is_prepared)
values ('00000000-0000-4000-8000-000000000585', '00000000-0000-4000-8000-000000000579',
  '00000000-0000-4000-8000-000000000584', 'class', '00000000-0000-4000-8000-000000000580', true, true);
select lives_ok($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000579', 1, 'spellcasting', '[]'::jsonb,
    null, '{}'::text[], '00000000-0000-4000-8000-000000000585', '{}'::jsonb)
$$, 'a prepared Wizard spell can be cast from a slot');
select ok(not exists(
  select 1 from public.spell_change_windows
  where party_member_id = '00000000-0000-4000-8000-000000000579'
    and source_class_id = '00000000-0000-4000-8000-000000000580'
    and change_timing = 'long_rest'
), 'casting a non-cantrip spell from a slot closes the open long-rest preparation window');

update public.party_members set spell_slots = '[
  {"level":2,"max":3,"used":2,"pool":"spellcasting","recovery":"long"},
  {"level":2,"max":2,"used":1,"pool":"pact","recovery":"short"},
  {"level":3,"max":1,"used":0,"pool":"temporary","recovery":"none"}
]'::jsonb where id = '00000000-0000-4000-8000-000000000544';
select public.take_spellcasting_rest('00000000-0000-4000-8000-000000000544', 'short');
select ok((select (spell_slots #>> '{0,used}')::integer = 2
    and (spell_slots #>> '{1,used}')::integer = 0 and jsonb_array_length(spell_slots) = 3
  from public.party_members where id = '00000000-0000-4000-8000-000000000544'),
  'short rest restores Pact Magic without restoring ordinary slots');
select public.take_spellcasting_rest('00000000-0000-4000-8000-000000000544', 'long');
select ok((select (spell_slots #>> '{0,used}')::integer = 0
    and (spell_slots #>> '{1,used}')::integer = 0 and jsonb_array_length(spell_slots) = 2
  from public.party_members where id = '00000000-0000-4000-8000-000000000544'),
  'long rest restores durable pools and removes temporary slots');
select ok(exists(select 1 from public.spell_change_windows
  where party_member_id = '00000000-0000-4000-8000-000000000544'
    and source_class_id = '00000000-0000-4000-8000-000000000546'
    and change_timing = 'level_up'), 'level-up opens the revised replacement window');

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
  select public.cast_character_spell_v4('00000000-0000-4000-8000-000000000544', 0, 'feature', '[]'::jsonb,
    null, '{}'::text[], '00000000-0000-4000-8000-000000000552', '{}'::jsonb)
$$, 'limited-use innate spell uses the shared cast transaction');
select is((select uses_remaining from public.character_spells where id = '00000000-0000-4000-8000-000000000552'), 0, 'innate cast spends exactly one use');
select is((select cast_level from public.spell_cast_records
  where character_spell_id = '00000000-0000-4000-8000-000000000552'), 1,
  'a slot-free innate cast records the spell base level rather than level zero');

insert into public.character_spells
  (id, party_member_id, spell_id, source_type, uses_per_day, uses_remaining, resets_on, source_label)
values
  ('00000000-0000-4000-8000-000000000559', '00000000-0000-4000-8000-000000000544',
    '00000000-0000-4000-8000-000000000550', 'racial', null, null, null, 'Species grant'),
  ('00000000-0000-4000-8000-000000000560', '00000000-0000-4000-8000-000000000544',
    '00000000-0000-4000-8000-000000000550', 'item', 1, 1, 'long_rest', 'Magic item'),
  ('00000000-0000-4000-8000-000000000561', '00000000-0000-4000-8000-000000000544',
    '00000000-0000-4000-8000-000000000550', 'other', null, null, null, 'Other grant');
select lives_ok($$
  select public.cast_character_spell_v4('00000000-0000-4000-8000-000000000544', 0, 'feature', '[]'::jsonb,
    null, '{}'::text[], '00000000-0000-4000-8000-000000000559', '{}'::jsonb);
  select public.cast_character_spell_v4('00000000-0000-4000-8000-000000000544', 0, 'feature', '[]'::jsonb,
    null, '{}'::text[], '00000000-0000-4000-8000-000000000560', '{}'::jsonb);
  select public.cast_character_spell_v4('00000000-0000-4000-8000-000000000544', 0, 'feature', '[]'::jsonb,
    null, '{}'::text[], '00000000-0000-4000-8000-000000000561', '{}'::jsonb)
$$, 'racial, item, and other grants all use the shared casting transaction');
select is((select uses_remaining from public.character_spells
  where id = '00000000-0000-4000-8000-000000000560'), 0,
  'item casting spends its own limited use');
select is((select count(*)::integer from public.spell_cast_records
  where character_spell_id in (
    '00000000-0000-4000-8000-000000000559',
    '00000000-0000-4000-8000-000000000560',
    '00000000-0000-4000-8000-000000000561')), 3,
  'every non-class source records its cast atomically');

update public.party_members set level = 20,
  class_resources = jsonb_set(class_resources, '{sorcery_points,current}', '1'::jsonb, false),
  class_choices = jsonb_set(
    jsonb_set(class_choices, '{metamagic_options}', '["Subtle Spell"]'::jsonb, true),
    '{innate_sorcery_active}', 'true'::jsonb, true
  ) || jsonb_build_object('innate_sorcery_expires_at', (now() + interval '1 minute')::text)
where id = '00000000-0000-4000-8000-000000000544';
update public.character_classes set levels = 20
where id = '00000000-0000-4000-8000-000000000546';
select lives_ok($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000544', 0, 'spellcasting', '[]'::jsonb,
    null, array['Subtle Spell'], '00000000-0000-4000-8000-000000000556', '{}'::jsonb)
$$, 'level-20 Metamagic remains usable outside a tracked encounter');
select is((select (class_resources #>> '{sorcery_points,current}')::integer
  from public.party_members where id = '00000000-0000-4000-8000-000000000544'), 0,
  'Arcane Apotheosis does not grant repeated free options without a trusted turn boundary');

-- Arcane Apotheosis is a 2024 level-18 feature (not level 20); verify the
-- free option triggers as soon as an active encounter turn exists.
insert into public.encounters (id, user_id, campaign_id, name)
values ('00000000-0000-4000-8000-000000000586', '00000000-0000-4000-8000-000000000549',
  '00000000-0000-4000-8000-000000000543', 'Apotheosis threshold test');
insert into public.encounter_state (id, encounter_id, campaign_id, user_id, is_running)
values ('00000000-0000-4000-8000-000000000587', '00000000-0000-4000-8000-000000000586',
  '00000000-0000-4000-8000-000000000543', '00000000-0000-4000-8000-000000000549', true);
update public.party_members set level = 18,
  class_resources = jsonb_set(class_resources, '{sorcery_points,current}', '1'::jsonb, false),
  class_choices = (jsonb_set(
    jsonb_set(class_choices, '{metamagic_options}', '["Subtle Spell"]'::jsonb, true),
    '{innate_sorcery_active}', 'true'::jsonb, true
  ) || jsonb_build_object('innate_sorcery_expires_at', (now() + interval '1 minute')::text)) - 'arcane_apotheosis_turn'
where id = '00000000-0000-4000-8000-000000000544';
update public.character_classes set levels = 18
where id = '00000000-0000-4000-8000-000000000546';
select lives_ok($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000544', 0, 'spellcasting', '[]'::jsonb,
    null, array['Subtle Spell'], '00000000-0000-4000-8000-000000000556', '{}'::jsonb)
$$, 'level-18 Metamagic triggers Arcane Apotheosis during an active encounter turn');
select is((select (class_resources #>> '{sorcery_points,current}')::integer
  from public.party_members where id = '00000000-0000-4000-8000-000000000544'), 1,
  'Arcane Apotheosis grants one free Metamagic option per turn starting at level 18, not only level 20');

update public.campaigns set ruleset = '2014'
where id = '00000000-0000-4000-8000-000000000543';
select ok(exists(
  select 1 from public.character_classes cc
  join public.system_classes definition on definition.id = cc.class_definition_id
  where cc.id = '00000000-0000-4000-8000-000000000546'
    and cc.class_definition_kind = 'system' and definition.ruleset = '2014'
), 'ruleset switches remap official classes to the matching edition definition');
select ok(not exists(select 1 from public.ruleset_reviews
  where character_class_id = '00000000-0000-4000-8000-000000000546' and flag_type = 'class'),
  'an automatically remapped official class does not require manual review');
select is((select class_definition_id from public.character_classes
  where id = '00000000-0000-4000-8000-000000000564'),
  '00000000-0000-4000-8000-000000000570'::uuid,
  'edition-neutral custom class choices remain pinned across a ruleset switch');
select is((select spell_id from public.character_spells
  where id = '00000000-0000-4000-8000-000000000572'), 'test-edition-flame-2014',
  'ruleset switches preserve an official spell choice through its exact target-edition record');
select ok(not exists(
  select 1 from public.class_spellcasting_policies policy
  where policy.ruleset = '2024' and not exists (
    select 1 from public.system_classes definition
    where definition.ruleset = policy.ruleset and definition.class_name = policy.class_name
  )
), 'every revised spellcasting policy has a selectable system class definition');

insert into public.character_spells
  (id, party_member_id, spell_id, source_type, source_class_id, is_prepared)
values ('00000000-0000-4000-8000-000000000566', '00000000-0000-4000-8000-000000000544',
  '00000000-0000-4000-8000-000000000565', 'class', '00000000-0000-4000-8000-000000000546', false);
insert into public.encounters (id, user_id, campaign_id, name)
values ('00000000-0000-4000-8000-000000000567', '00000000-0000-4000-8000-000000000549',
  '00000000-0000-4000-8000-000000000543', 'Action economy test');
insert into public.encounter_state (id, encounter_id, campaign_id, user_id, is_running)
values ('00000000-0000-4000-8000-000000000568', '00000000-0000-4000-8000-000000000567',
  '00000000-0000-4000-8000-000000000543', '00000000-0000-4000-8000-000000000549', true);
update public.party_members set
  spell_slots = '[{"level":1,"max":2,"used":0,"pool":"spellcasting","recovery":"long"}]'::jsonb,
  class_choices = class_choices - 'spell_slot_cast_turn' - 'noncantrip_spell_turn' - 'bonus_action_spell_turn'
where id = '00000000-0000-4000-8000-000000000544';
select lives_ok($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000544', 1, 'spellcasting', '[]'::jsonb,
    null, '{}'::text[], '00000000-0000-4000-8000-000000000566', '{}'::jsonb)
$$, '2014 inherent Bonus Action spell casts normally');
select throws_matching($$
  select public.cast_character_spell_v4(
    '00000000-0000-4000-8000-000000000544', 1, 'spellcasting', '[]'::jsonb,
    null, '{}'::text[], '00000000-0000-4000-8000-000000000551', '{}'::jsonb)
$$, '.*Only an Action cantrip can follow a Bonus Action spell.*',
  '2014 inherent Bonus Action spells enforce the same-turn leveled-spell restriction');

select * from finish();
rollback;
