-- A subclass can cast (20261013001003): custom_subclasses.spellcasting gives a
-- class row that does not cast (Fighter, Rogue) the tables of its subclass.
--
--   shape     a malformed spellcasting is refused by the table
--   learn     an Eldritch Knight 3 learns level-1 Wizard-list spells, and only those
--   control   the same Fighter without the subclass is still not a caster
--   limits    spells_known / cantrips_known from the subclass are counted
--   level-up  required_level_up_spell_choices and apply_level_up count the
--             subclass chosen at that very level
--   own       a class that casts keeps its own tables
--   cast      a known caster casts without preparing; a prepared one must prepare
--
--   1 Ann  owner of e1 (2014 Fighter 3, Eldritch Knight) and e2 (Fighter 2),
--     e3 (Fighter 3, no subclass), e4 (Wizard 3)

begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('99700000-0000-4000-8000-0000000000' || p)::uuid;
$$;
create function pg_temp.t(p text) returns text language sql immutable as $$
  select pg_temp.u(p)::text;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  (pg_temp.u('01'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'subclass-casting-1@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  (pg_temp.u('02'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'subclass-casting-2@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, ruleset) values (pg_temp.u('c1'), pg_temp.u('01'), 'Ann''s table', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values (pg_temp.u('c1'), pg_temp.u('01'), 'dm', 'Ann')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- W0/W1 wizard cantrips, W2/W3/W4 level-1 wizard spells, W5 a level-2 wizard spell,
-- S1 a level-1 sorcerer-only spell, W7/W8 a spare level-1 spell and cantrip,
-- F1 a level-1 spell on the Fighter list.
insert into public.spells (id, user_id, campaign_id, name, level, classes, ruleset)
select pg_temp.u(v.id), pg_temp.u('01'), pg_temp.u('c1'), 'Zzk ' || v.name, v.lvl, v.cls, '2014'
from (values
  ('b0', 'W0', 0, array['Wizard']), ('b1', 'W1', 0, array['Wizard']),
  ('b2', 'W2', 1, array['Wizard']), ('b3', 'W3', 1, array['Wizard']), ('b4', 'W4', 1, array['Wizard']),
  ('b5', 'W5', 2, array['Wizard']), ('b6', 'S1', 1, array['Sorcerer']),
  ('b7', 'W7', 1, array['Wizard']), ('b8', 'W8', 0, array['Wizard']), ('b9', 'F1', 1, array['Fighter']), ('ba', 'C1', 1, array['Cleric'])
) as v(id, name, lvl, cls);

-- The shape check.
select throws_ok($$
  insert into public.custom_subclasses (id, class_name, subclass_name, ruleset, spellcasting)
  values (pg_temp.u('d9'), 'Fighter', 'Zzk Bad Ability', '2014',
    '{"ability":"str","list":"Wizard","caster_type":"known","spell_slots":[],"spells_known":[],"cantrips_known":[]}'::jsonb)
$$, '23514', null, 'a casting ability outside int/wis/cha is refused');
select throws_ok($$
  insert into public.custom_subclasses (id, class_name, subclass_name, ruleset, spellcasting)
  values (pg_temp.u('d9'), 'Fighter', 'Zzk Missing Key', '2014',
    '{"ability":"int","list":"Wizard","caster_type":"known","spell_slots":[],"spells_known":[]}'::jsonb)
$$, '23514', null, 'a spellcasting without cantrips_known is refused');

-- The tables must hold 20 whole numbers each (a slot row: up to 9).
create function pg_temp.bad_casting(p_path text[], p_value jsonb) returns jsonb language sql as $f$
  select jsonb_set(jsonb_build_object(
    'ability', 'int', 'list', 'Wizard', 'caster_type', 'known',
    'spell_slots', (select jsonb_agg('[]'::jsonb) from generate_series(1, 20)),
    'spells_known', (select jsonb_agg(0) from generate_series(1, 20)),
    'cantrips_known', (select jsonb_agg(0) from generate_series(1, 20))), p_path, p_value)
$f$;
select throws_ok($$
  insert into public.custom_subclasses (class_name, subclass_name, ruleset, spellcasting)
  values ('Fighter', 'Zzk Short', '2014', pg_temp.bad_casting('{spells_known}', (select jsonb_agg(0) from generate_series(1, 19))))
$$, '23514', null, 'a table of 19 rows is refused');
select throws_ok($$
  insert into public.custom_subclasses (class_name, subclass_name, ruleset, spellcasting)
  values ('Fighter', 'Zzk Fraction', '2014', pg_temp.bad_casting('{spells_known,2}', '1.5'))
$$, '23514', null, 'a non-integer is refused');
select throws_ok($$
  insert into public.custom_subclasses (class_name, subclass_name, ruleset, spellcasting)
  values ('Fighter', 'Zzk Negative', '2014', pg_temp.bad_casting('{cantrips_known,2}', '-1'))
$$, '23514', null, 'a negative is refused');
select throws_ok($$
  insert into public.custom_subclasses (class_name, subclass_name, ruleset, spellcasting)
  values ('Fighter', 'Zzk String', '2014', pg_temp.bad_casting('{spell_slots,2}', '["2"]'))
$$, '23514', null, 'a string element is refused');
select lives_ok($$
  insert into public.custom_subclasses (class_name, subclass_name, ruleset, spellcasting)
  values ('Fighter', 'Zzk Well Formed', '2014', pg_temp.bad_casting('{spells_known,2}', '3'))
$$, 'while the same table with whole numbers is accepted');

-- A third caster: slots by class level, 3 known spells and 2 cantrips at 3.
insert into public.custom_subclasses (id, user_id, campaign_id, class_name, subclass_name, ruleset, spellcasting) values
  (pg_temp.u('d1'), null, null, 'Fighter', 'Zzk Eldritch Knight', '2014', jsonb_build_object(
    'ability', 'int', 'list', 'Wizard', 'caster_type', 'known',
    'spell_slots', '[[],[],[2],[3],[3],[3],[4,2],[4,2],[4,2],[4,3],[4,3],[4,3],[4,3,2],[4,3,2],[4,3,2],[4,3,3],[4,3,3],[4,3,3],[4,3,3,1],[4,3,3,1]]'::jsonb,
    'spells_known', '[0,0,3,4,4,4,5,6,6,7,7,8,8,9,10,10,11,11,11,13]'::jsonb,
    'cantrips_known', '[0,0,2,2,2,2,2,2,2,3,3,3,3,3,3,3,3,3,3,3]'::jsonb));


-- Another account's private Fighter subclass with the same table, and a Wizard
-- subclass whose spellcasting names the Cleric list.
insert into public.custom_subclasses (id, user_id, campaign_id, class_name, subclass_name, ruleset, spellcasting)
select pg_temp.u('d2'), pg_temp.u('02'), null, 'Fighter', 'Zzk Foreign Knight', '2014', spellcasting
  from public.custom_subclasses where id = pg_temp.u('d1');
insert into public.custom_subclasses (id, user_id, campaign_id, class_name, subclass_name, ruleset, spellcasting)
select pg_temp.u('d3'), null, null, 'Wizard', 'Zzk Divine Mage', '2014', jsonb_set(spellcasting, '{list}', '"Cleric"')
  from public.custom_subclasses where id = pg_temp.u('d1');

insert into public.party_members (id, user_id, campaign_id, name, class, level, "int", ruleset, spell_slots) values
  (pg_temp.u('e1'), pg_temp.u('01'), pg_temp.u('c1'), 'Zzk Knight', 'Fighter', 3, 16, '2014',
   '[{"level":1,"max":2,"used":0,"pool":"spellcasting","recovery":"long"}]'::jsonb),
  (pg_temp.u('e2'), pg_temp.u('01'), pg_temp.u('c1'), 'Zzk Soldier', 'Fighter', 2, 16, '2014', '[]'::jsonb),
  (pg_temp.u('e3'), pg_temp.u('01'), pg_temp.u('c1'), 'Zzk Plain', 'Fighter', 3, 16, '2014', '[]'::jsonb),
  (pg_temp.u('e4'), pg_temp.u('01'), pg_temp.u('c1'), 'Zzk Mage', 'Wizard', 3, 16, '2014', '[]'::jsonb);

insert into public.character_classes
  (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind, subclass_name, subclass_definition_id) values
  (pg_temp.u('a1'), pg_temp.u('e1'), 'Fighter', 3, true, '0eeb0ca3-76e9-4884-b040-8fcb8af59767', 'system', 'Zzk Eldritch Knight', pg_temp.u('d1')),
  (pg_temp.u('a2'), pg_temp.u('e2'), 'Fighter', 2, true, '0eeb0ca3-76e9-4884-b040-8fcb8af59767', 'system', null, null),
  (pg_temp.u('a3'), pg_temp.u('e3'), 'Fighter', 3, true, '0eeb0ca3-76e9-4884-b040-8fcb8af59767', 'system', null, null),
  (pg_temp.u('a4'), pg_temp.u('e4'), 'Wizard', 3, true, '3e048ef4-e8b9-4dc0-bd3c-e909d8b69d10', 'system', null, null);

set local request.jwt.claim.sub = '99700000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

-- ── Learning ────────────────────────────────────────────────────────────────

select lives_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e1'), pg_temp.t('b2'), 'class', pg_temp.u('a1'))
$$, 'an Eldritch Knight 3 learns a level-1 Wizard-list spell');
select throws_matching($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e1'), pg_temp.t('b5'), 'class', pg_temp.u('a1'))
$$, '.*cannot acquire a level-2 spell.*', 'but not a level-2 spell, the slot table has no second row');
select throws_matching($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e1'), pg_temp.t('b6'), 'class', pg_temp.u('a1'))
$$, '.*is not on the Fighter spell list.*', 'nor a spell off the Wizard list');
select throws_matching($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e3'), pg_temp.t('b9'), 'class', pg_temp.u('a3'))
$$, '.*not configured as a spellcasting class.*', 'the same Fighter without the subclass is still not a caster');

-- ── Limits ──────────────────────────────────────────────────────────────────

select lives_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e1'), pg_temp.t('b3'), 'class', pg_temp.u('a1')),
         (pg_temp.u('e1'), pg_temp.t('b4'), 'class', pg_temp.u('a1'))
$$, 'it fills the three spells known');
select throws_matching($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e1'), pg_temp.t('b7'), 'class', pg_temp.u('a1'))
$$, '.*Fighter spell limit of 3 reached.*', 'a fourth known spell is refused by spells_known');
select lives_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e1'), pg_temp.t('b0'), 'class', pg_temp.u('a1')),
         (pg_temp.u('e1'), pg_temp.t('b1'), 'class', pg_temp.u('a1'))
$$, 'it takes its two cantrips');
select throws_matching($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e1'), pg_temp.t('b8'), 'class', pg_temp.u('a1'))
$$, '.*Fighter spell limit of 2 reached.*', 'and a third cantrip is refused by cantrips_known');

-- ── Level-up ────────────────────────────────────────────────────────────────

select results_eq($$
  select spell_count, cantrip_count from public.required_level_up_spell_choices(
    pg_temp.u('e2'), 'Fighter', 3, 'system', '0eeb0ca3-76e9-4884-b040-8fcb8af59767', pg_temp.u('d1'))
$$, $$ values (3, 2) $$, 'level 3 with the subclass asks for 3 spells and 2 cantrips');
select results_eq($$
  select spell_count, cantrip_count from public.required_level_up_spell_choices(
    pg_temp.u('e2'), 'Fighter', 3, 'system', '0eeb0ca3-76e9-4884-b040-8fcb8af59767', null)
$$, $$ values (0, 0) $$, 'and nothing without it');
select results_eq($$
  select spell_count, cantrip_count from public.required_level_up_spell_choices(
    pg_temp.u('e2'), 'Fighter', 4, 'system', '0eeb0ca3-76e9-4884-b040-8fcb8af59767', pg_temp.u('d1'))
$$, $$ values (1, 0) $$, 'level 4 asks for the one spell the table adds');

select throws_matching($$
  select public.apply_level_up(pg_temp.u('e2'), '{"level":3}'::jsonb,
    jsonb_build_object('op', 'update', 'id', pg_temp.u('a2'), 'levels', 3,
      'subclass_name', 'Zzk Eldritch Knight', 'subclass_definition_id', pg_temp.t('d1')),
    '[]'::jsonb)
$$, '.*requires 3 spell and 2 cantrip choices \(received 0 and 0\).*',
  'choosing the subclass at level 3 without picking spells is refused');
select lives_ok($$
  select public.apply_level_up(pg_temp.u('e2'), '{"level":3}'::jsonb,
    jsonb_build_object('op', 'update', 'id', pg_temp.u('a2'), 'levels', 3,
      'subclass_name', 'Zzk Eldritch Knight', 'subclass_definition_id', pg_temp.t('d1')),
    jsonb_build_array(
      jsonb_build_object('spell_id', pg_temp.t('b2')), jsonb_build_object('spell_id', pg_temp.t('b3')),
      jsonb_build_object('spell_id', pg_temp.t('b4')),
      jsonb_build_object('spell_id', pg_temp.t('b0')), jsonb_build_object('spell_id', pg_temp.t('b1'))))
$$, 'and with exactly the required picks it goes through');
select is((select count(*)::int from public.character_spells where source_class_id = pg_temp.u('a2')), 5,
  'which writes all five');

-- ── A class that casts keeps its own tables ─────────────────────────────────

select lives_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id, is_prepared)
  values (pg_temp.u('e4'), pg_temp.t('b5'), 'class', pg_temp.u('a4'), false)
$$, 'a Wizard 3 still learns a level-2 spell from its own slot table');
select results_eq($$
  select spell_count, cantrip_count from public.required_level_up_spell_choices(
    pg_temp.u('e4'), 'Wizard', 4, 'system', '3e048ef4-e8b9-4dc0-bd3c-e909d8b69d10', pg_temp.u('d1'))
$$, $$ values (2, 1) $$, 'and a subclass id handed to it does not override the Wizard''s own progression');

-- ── Whose subclass, whose list ──────────────────────────────────────────────

select results_eq($$
  select spell_count, cantrip_count from public.required_level_up_spell_choices(
    pg_temp.u('e2'), 'Fighter', 3, 'system', '0eeb0ca3-76e9-4884-b040-8fcb8af59767', pg_temp.u('d2'))
$$, $$ values (0, 0) $$, 'another account''s private subclass leaks no counts (its twin d1 gives 3 and 2)');
select throws_matching($$
  select public.apply_level_up(pg_temp.u('e3'), '{"level":4}'::jsonb,
    jsonb_build_object('op', 'update', 'id', pg_temp.u('a3'), 'levels', 4,
      'subclass_name', 'Zzk Foreign Knight', 'subclass_definition_id', pg_temp.t('d2')),
    '[]'::jsonb)
$$, '.*Subclass definition.*', 'a level-up that chooses another account''s subclass is refused');
select is((select levels from public.character_classes where id = pg_temp.u('a3')), 3, 'and the Fighter stays at level 3');
select throws_matching($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e4'), pg_temp.t('ba'), 'class', pg_temp.u('a4'))
$$, '.*is not on the Wizard spell list.*', 'before any subclass, a Wizard cannot learn a Cleric-only spell');
update public.character_classes set subclass_definition_id = pg_temp.u('d3'), subclass_name = 'Zzk Divine Mage' where id = pg_temp.u('a4');
select throws_matching($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e4'), pg_temp.t('ba'), 'class', pg_temp.u('a4'))
$$, '.*is not on the Wizard spell list.*', 'nor with a subclass that names the Cleric list: a casting class keeps its own');
select is(private.subclass_casting(pg_temp.u('e4'), 'Wizard', 'system', '3e048ef4-e8b9-4dc0-bd3c-e909d8b69d10', pg_temp.u('d3')), null::jsonb,
  'the reader returns nothing for a class that casts');
select ok(private.subclass_casting(pg_temp.u('e1'), 'Fighter', 'system', '0eeb0ca3-76e9-4884-b040-8fcb8af59767', pg_temp.u('d1')) is not null,
  'and the Eldritch Knight''s casting for a Fighter');

-- ── Casting ─────────────────────────────────────────────────────────────────

select lives_ok($$
  select public.cast_character_spell_v4(pg_temp.u('e1'), 1, 'spellcasting', '[]'::jsonb, null, '{}'::text[],
    (select id from public.character_spells where party_member_id = pg_temp.u('e1') and spell_id = pg_temp.t('b2')),
    '{}'::jsonb)
$$, 'a known caster casts a spell it never prepared');
update public.custom_subclasses set spellcasting = jsonb_set(spellcasting, '{caster_type}', '"prepared"') where id = pg_temp.u('d1');
update public.character_spells set is_prepared = false where party_member_id = pg_temp.u('e1');
select throws_matching($$
  select public.cast_character_spell_v4(pg_temp.u('e1'), 1, 'spellcasting', '[]'::jsonb, null, '{}'::text[],
    (select id from public.character_spells where party_member_id = pg_temp.u('e1') and spell_id = pg_temp.t('b3')),
    '{}'::jsonb)
$$, '.*must be prepared before it can be cast.*', 'a prepared caster must prepare it first');

select * from finish();
rollback;
