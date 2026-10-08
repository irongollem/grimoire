-- Subclass spells (migration s1_subclass_spells): the server writes the spells a
-- subclass grants, and widens a class's list with the subclass's expanded spells.
--
--   grants      arrive at their class level, flagged granted_by_subclass and
--               always prepared; a pick of the same spell is converted, which
--               frees its prepared slot; a de-level, a variant switch, clearing the
--               subclass, deleting the class row and editing the subclass all
--               reconcile; an unknown variant is refused
--   expanded    a Warlock-patron-style list admits a spell the class lacks, for
--               that subclass only
--   browse      p_extra_ids survives the class filter; one signature remains
--   level-up    apply_level_up still works end to end when the subclass grants
--               a spell at the new level
--   surface     the sync is not callable by a client
--
--   e7 Cleric (expanded list that depends on the variant)
--   1 Ann  owns every character at c1 (2024)
--   e1 Cleric (limit 4 prepared at level 1)   e3 Cleric   e4 Cleric (level-up)
--   e5 Cleric (class row deleted)             e6 Wizard (spellbook, 2024 guard)

begin;

create extension if not exists pgtap with schema extensions;
select plan(67);

create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('99500000-0000-4000-8000-0000000000' || p)::uuid;
$$;
create function pg_temp.t(p text) returns text language sql immutable as $$
  select pg_temp.u(p)::text;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  (pg_temp.u('01'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'subclass-spells-1@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, ruleset) values (pg_temp.u('c1'), pg_temp.u('01'), 'Ann''s table', '2024');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values (pg_temp.u('c1'), pg_temp.u('01'), 'dm', 'Ann')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- Spells. G1/G2/G3 are domain grants at class levels 1/3/5; V1/V2 the variant
-- options; E1 an addition made later; X a Wizard spell the Cleric lacks; H2 the
-- level-up grant; W1 a Wizard cantrip-free level-1 spell; F1-F5 ordinary picks.
insert into public.spells (id, user_id, campaign_id, name, level, classes, ruleset)
select pg_temp.u(v.id), pg_temp.u('01'), pg_temp.u('c1'), 'Zzs ' || v.name, v.lvl, v.cls, '2024'
from (values
  ('b1', 'G1', 1, array['Cleric']), ('b2', 'G2', 2, array['Cleric']), ('b3', 'G3', 3, array['Cleric']),
  ('b4', 'V1', 1, array['Cleric']), ('b5', 'V2', 1, array['Cleric']), ('b6', 'E1', 1, array['Cleric']),
  ('b7', 'X', 1, array['Wizard']),  ('b8', 'H2', 2, array['Cleric']), ('b9', 'W1', 1, array['Wizard']),
  ('ba', 'F1', 1, array['Cleric']), ('bb', 'F2', 1, array['Cleric']), ('bc', 'F3', 1, array['Cleric']),
  ('bd', 'F4', 1, array['Cleric']), ('be', 'F5', 1, array['Cleric']), ('bf', 'Y', 1, array['Wizard'])
) as v(id, name, lvl, cls);

-- Subclasses, library-style (no owner). D is the main domain.
insert into public.custom_subclasses (id, user_id, campaign_id, class_name, subclass_name, ruleset, granted_spells) values
  (pg_temp.u('d1'), null, null, 'Cleric', 'Zzs Domain', '2024',
   jsonb_build_object('1', jsonb_build_array(pg_temp.t('b1')), '3', jsonb_build_array(pg_temp.t('b2')),
                      '5', jsonb_build_array(pg_temp.t('b3')))),
  (pg_temp.u('d2'), null, null, 'Cleric', 'Zzs Level-up Domain', '2024',
   jsonb_build_object('3', jsonb_build_array(pg_temp.t('b8')))),
  (pg_temp.u('d4'), null, null, 'Wizard', 'Zzs School', '2024',
   jsonb_build_object('1', jsonb_build_array(pg_temp.t('b9')))),
  (pg_temp.u('d5'), null, null, 'Cleric', 'Zzs Animal Lords', '2024', '{}'::jsonb);
update public.custom_subclasses set spell_variant_label = 'Affinity',
  expanded_spell_variants = jsonb_build_object(
    'Air', jsonb_build_object('1', jsonb_build_array(pg_temp.t('b7'))),
    'Earth', jsonb_build_object('1', jsonb_build_array(pg_temp.t('bf'))))
 where id = pg_temp.u('d5');
insert into public.custom_subclasses (id, user_id, campaign_id, class_name, subclass_name, ruleset, expanded_spells) values
  (pg_temp.u('d3'), null, null, 'Cleric', 'Zzs Patron', '2024', jsonb_build_object('1', jsonb_build_array(pg_temp.t('b7'))));

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, ruleset, max_hp, current_hp)
select pg_temp.u(v.id), pg_temp.u('01'), pg_temp.u('01'), pg_temp.u('c1'), 'Zzs ' || v.id, v.lvl, '2024', 20, 20
from (values ('e1', 1), ('e3', 1), ('e4', 2), ('e5', 1), ('e6', 1), ('e7', 1)) as v(id, lvl);

insert into public.character_classes (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
select pg_temp.u(replace(v.m, 'e', 'a')), pg_temp.u(v.m), v.cls, v.lvl, true, sc.id, 'system'
from (values ('e1', 'Cleric', 1), ('e3', 'Cleric', 1), ('e4', 'Cleric', 2), ('e5', 'Cleric', 1), ('e6', 'Wizard', 1), ('e7', 'Cleric', 1)) as v(m, cls, lvl)
join public.system_classes sc on sc.ruleset = '2024' and sc.class_name = v.cls;

create function pg_temp.granted(p_class text) returns text[] language sql security definer as $$
  select coalesce(array_agg(spell_id order by spell_id), '{}') from public.character_spells
   where source_class_id = pg_temp.u(p_class) and granted_by_subclass;
$$;
create function pg_temp.rows_of(p_member text) returns setof public.character_spells language sql security definer as $$
  select * from public.character_spells where party_member_id = pg_temp.u(p_member);
$$;
create function pg_temp.picks(p_class text) returns bigint language sql security definer as $$
  select count(*) from public.character_spells
   where source_class_id = pg_temp.u(p_class) and source_type = 'class' and not always_prepared;
$$;
create function pg_temp.as_user() returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', pg_temp.u('01')), true);
$$;

-- ── A pick converts, and frees its slot ──────────────────────────────────────

insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id, is_known)
select pg_temp.u('e1'), pg_temp.t(s), 'class', pg_temp.u('a1'), true from unnest(array['ba', 'bb', 'bc', 'b1']) s;

select is(pg_temp.picks('a1'), 4::bigint, 'Ann has picked four spells: the Cleric''s whole level-1 allowance');
select throws_like($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id, is_known)
  values (pg_temp.u('e1'), pg_temp.t('bd'), 'class', pg_temp.u('a1'), true)
$$, '%can prepare at most 4%', 'a fifth pick is refused at the limit');

update public.character_classes set subclass_name = 'Zzs Domain', subclass_definition_id = pg_temp.u('d1') where id = pg_temp.u('a1');

select is(pg_temp.granted('a1'), array[pg_temp.t('b1')], 'taking the subclass grants its level-1 spell');
select is((select count(*) from public.character_spells where party_member_id = pg_temp.u('e1') and spell_id = pg_temp.t('b1')),
  1::bigint, 'the earlier pick of that spell was converted, not duplicated');
select ok((select always_prepared and is_prepared and granted_by_subclass and is_known from public.character_spells
  where party_member_id = pg_temp.u('e1') and spell_id = pg_temp.t('b1')), 'and is now an always-prepared granted spell');
select is(pg_temp.picks('a1'), 3::bigint, 'it no longer counts as a pick');
select lives_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id, is_known)
  values (pg_temp.u('e1'), pg_temp.t('bd'), 'class', pg_temp.u('a1'), true)
$$, 'so the slot it ate takes another pick');

-- ── Levels ───────────────────────────────────────────────────────────────────

update public.character_classes set levels = 3 where id = pg_temp.u('a1');
select is(pg_temp.granted('a1'), array[pg_temp.t('b1'), pg_temp.t('b2')]::text[] , 'level 3 adds the level-3 grant');
update public.character_classes set levels = 5 where id = pg_temp.u('a1');
select is(array_length(pg_temp.granted('a1'), 1), 3, 'level 5 adds the level-5 grant');
update public.character_classes set levels = 2 where id = pg_temp.u('a1');
select is(pg_temp.granted('a1'), array[pg_temp.t('b1')], 'a de-level removes the grants above the level');
select is(pg_temp.picks('a1'), 4::bigint, 'and leaves the player''s own picks alone');
update public.character_classes set levels = 2 where id = pg_temp.u('a1');
select is(array_length(pg_temp.granted('a1'), 1), 1, 'syncing again changes nothing (idempotent)');

-- ── Variants ─────────────────────────────────────────────────────────────────

update public.custom_subclasses set spell_variant_label = 'Terrain',
  spell_variants = jsonb_build_object('A', jsonb_build_object('1', jsonb_build_array(pg_temp.t('b4'))),
                                      'B', jsonb_build_object('1', jsonb_build_array(pg_temp.t('b5'))))
 where id = pg_temp.u('d1');
select is(pg_temp.granted('a1'), array[pg_temp.t('b1')], 'defining variants grants nothing until one is chosen');

update public.character_classes set subclass_variant = 'A' where id = pg_temp.u('a1');
select is(pg_temp.granted('a1'), array[pg_temp.t('b1'), pg_temp.t('b4')]::text[], 'choosing variant A adds its spells to the base grants');
update public.character_classes set subclass_variant = 'B' where id = pg_temp.u('a1');
select is(pg_temp.granted('a1'), array[pg_temp.t('b1'), pg_temp.t('b5')]::text[], 'switching to variant B swaps them');
select throws_like($$update public.character_classes set subclass_variant = 'Z' where id = pg_temp.u('a1')$$,
  '%not an option%', 'a variant the subclass does not offer is refused');
update public.character_classes set subclass_variant = 'A' where id = pg_temp.u('a3');
select is((select subclass_variant from public.character_classes where id = pg_temp.u('a3')), null,
  'a variant on a row with no subclass is dropped');

-- ── Editing the subclass resyncs characters ──────────────────────────────────

update public.custom_subclasses set granted_spells = granted_spells
  || jsonb_build_object('1', jsonb_build_array(pg_temp.t('b1'), pg_temp.t('b6'))) where id = pg_temp.u('d1');
select is(pg_temp.granted('a1'), array[pg_temp.t('b1'), pg_temp.t('b5'), pg_temp.t('b6')]::text[],
  'a spell added to the subclass reaches the characters who have it');
update public.custom_subclasses set granted_spells = granted_spells
  || jsonb_build_object('1', jsonb_build_array(pg_temp.t('b1'))) where id = pg_temp.u('d1');
select is(pg_temp.granted('a1'), array[pg_temp.t('b1'), pg_temp.t('b5')]::text[], 'and one removed leaves them');
update public.custom_subclasses set granted_spells = granted_spells
  || jsonb_build_object('1', jsonb_build_array(pg_temp.t('b1'), 'not-a-spell')) where id = pg_temp.u('d1');
select is(pg_temp.granted('a1'), array[pg_temp.t('b1'), pg_temp.t('b5')]::text[], 'an id in neither catalogue is skipped rather than blocking the character');

-- ── Clearing the subclass ────────────────────────────────────────────────────

update public.character_classes set subclass_name = null where id = pg_temp.u('a1');
select is(pg_temp.granted('a1'), '{}'::text[], 'clearing the subclass removes every grant');
select is((select subclass_variant from public.character_classes where id = pg_temp.u('a1')), null, 'and its variant');
select is(pg_temp.picks('a1'), 4::bigint, 'the player''s own picks stay');

-- ── Deleting the class row ───────────────────────────────────────────────────

update public.character_classes set subclass_name = 'Zzs Domain', subclass_definition_id = pg_temp.u('d1') where id = pg_temp.u('a5');
select is(pg_temp.granted('a5'), array[pg_temp.t('b1')], 'a character created with the subclass has its grant');
delete from public.character_classes where id = pg_temp.u('a5');
select is((select count(*) from public.character_spells where party_member_id = pg_temp.u('e5')), 0::bigint,
  'deleting the class row takes its grants with it, instead of orphaning them');

-- ── Ruleset 2024: an unprepared spellbook entry converts ─────────────────────

insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id, is_known, is_prepared)
values (pg_temp.u('e6'), pg_temp.t('b9'), 'class', pg_temp.u('a6'), true, false);
select lives_ok($$update public.character_classes set subclass_name = 'Zzs School', subclass_definition_id = pg_temp.u('d4')
  where id = pg_temp.u('a6')$$, 'a spell sitting unprepared in a 2024 spellbook can become a grant');
select ok((select is_prepared and always_prepared from public.character_spells where source_class_id = pg_temp.u('a6')),
  'and is prepared');

-- ── The expanded list ────────────────────────────────────────────────────────

select throws_like($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e3'), pg_temp.t('b7'), 'class', pg_temp.u('a3'))
$$, '%is not on the Cleric spell list%', 'a Wizard spell is refused for a Cleric without the subclass');
update public.character_classes set subclass_name = 'Zzs Patron', subclass_definition_id = pg_temp.u('d3') where id = pg_temp.u('a3');
select lives_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e3'), pg_temp.t('b7'), 'class', pg_temp.u('a3'))
$$, 'and admitted once the subclass lists it');
select is(pg_temp.granted('a3'), '{}'::text[], 'an expanded list grants nothing');
select is(pg_temp.picks('a3'), 1::bigint, 'the expanded pick counts as a pick');

-- ── A variant that only widens the pick-from list ────────────────────────────

update public.character_classes set subclass_name = 'Zzs Animal Lords', subclass_definition_id = pg_temp.u('d5') where id = pg_temp.u('a7');
select lives_ok($$update public.character_classes set subclass_variant = 'Air' where id = pg_temp.u('a7')$$,
  'a variant that is only a key of expanded_spell_variants is accepted');
select lives_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e7'), pg_temp.t('b7'), 'class', pg_temp.u('a7'))
$$, 'its spell is admitted under that variant');
select throws_like($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e7'), pg_temp.t('bf'), 'class', pg_temp.u('a7'))
$$, '%is not on the Cleric spell list%', 'another variant''s spell is refused');
update public.character_classes set subclass_variant = 'Earth' where id = pg_temp.u('a7');
select lives_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id)
  values (pg_temp.u('e7'), pg_temp.t('bf'), 'class', pg_temp.u('a7'))
$$, 'and admitted once that variant is chosen');

-- ── apply_level_up with a subclass that grants at the new level ──────────────

update public.character_classes set subclass_name = 'Zzs Level-up Domain', subclass_definition_id = pg_temp.u('d2') where id = pg_temp.u('a4');
select is(pg_temp.granted('a4'), '{}'::text[], 'the level-3 grant is not owed at level 2');

-- Two Land-style characters at Cleric 2 for the variant-carrying level-up.
insert into public.custom_subclasses (id, user_id, campaign_id, class_name, subclass_name, ruleset, spell_variant_label, spell_variants) values
  (pg_temp.u('d6'), null, null, 'Cleric', 'Zzs Land', '2024', 'Terrain',
   jsonb_build_object('Coast', jsonb_build_object('3', jsonb_build_array(pg_temp.t('b2'))),
                      'Arctic', jsonb_build_object('3', jsonb_build_array(pg_temp.t('b3')))));
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, ruleset, max_hp, current_hp)
select pg_temp.u(v), pg_temp.u('01'), pg_temp.u('01'), pg_temp.u('c1'), 'Zzs ' || v, 2, '2024', 20, 20 from unnest(array['e8', 'e9']) v;
insert into public.character_classes (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind,
  subclass_name, subclass_definition_id)
select pg_temp.u(replace(m, 'e', 'a')), pg_temp.u(m), 'Cleric', 2, true, sc.id, 'system', 'Zzs Land', pg_temp.u('d6')
from unnest(array['e8', 'e9']) m join public.system_classes sc on sc.ruleset = '2024' and sc.class_name = 'Cleric';

-- A character with no class row yet takes Cleric (its whole level 2) with its subclass and affinity in one call.
insert into public.custom_subclasses (id, user_id, campaign_id, class_name, subclass_name, ruleset, spell_variants, expanded_spell_variants) values
  (pg_temp.u('d7'), null, null, 'Cleric', 'Zzs Lords', '2024',
   jsonb_build_object('Air', jsonb_build_object('1', jsonb_build_array(pg_temp.t('b4')))),
   jsonb_build_object('Air', jsonb_build_object('1', jsonb_build_array(pg_temp.t('b7')))));
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, ruleset, max_hp, current_hp)
values (pg_temp.u('ea'), pg_temp.u('01'), pg_temp.u('01'), pg_temp.u('c1'), 'Zzs ea', 1, '2024', 20, 20);

-- A grant the class cannot hold yet (a level-9 spell on a Wizard subclass tier 3).
insert into public.spells (id, user_id, campaign_id, name, level, classes, ruleset)
values (pg_temp.u('c5'), pg_temp.u('01'), pg_temp.u('c1'), 'Zzs Nine', 9, array['Wizard'], '2024');
insert into public.custom_subclasses (id, user_id, campaign_id, class_name, subclass_name, ruleset, granted_spells) values
  (pg_temp.u('d8'), null, null, 'Wizard', 'Zzs Deep School', '2024',
   jsonb_build_object('3', jsonb_build_array(pg_temp.t('b9'), pg_temp.t('c5')))),
  (pg_temp.u('d9'), null, null, 'Wizard', 'Zzs Shared School', '2024', '{}'::jsonb);
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, ruleset, max_hp, current_hp)
select pg_temp.u(v.id), pg_temp.u('01'), pg_temp.u('01'), pg_temp.u('c1'), 'Zzs ' || v.id, v.lvl, '2024', 20, 20
from (values ('eb', 2), ('ec', 1), ('ed', 17)) as v(id, lvl);
insert into public.character_classes (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind,
  subclass_name, subclass_definition_id)
select pg_temp.u(replace(v.m, 'e', 'a')), pg_temp.u(v.m), 'Wizard', v.lvl, true, sc.id, 'system', 'Zzs ' || v.sub, pg_temp.u(v.d)
from (values ('eb', 2, 'Deep School', 'd8'), ('ec', 1, 'Shared School', 'd9'), ('ed', 17, 'Shared School', 'd9')) as v(m, lvl, sub, d)
join public.system_classes sc on sc.ruleset = '2024' and sc.class_name = 'Wizard';

set local role authenticated;
select pg_temp.as_user();

select lives_ok(format($$
  select public.apply_level_up(%L, '{"level": 3}'::jsonb,
    jsonb_build_object('op', 'update', 'id', %L, 'levels', 3),
    jsonb_build_array(jsonb_build_object('spell_id', %L, 'is_prepared', true)))
$$, pg_temp.t('e4'), pg_temp.t('a4'), pg_temp.t('be')), 'a level-up that owes one pick succeeds without the client sending the grant');
select is(pg_temp.granted('a4'), array[pg_temp.t('b8')], 'the subclass spell arrived with the level');
select is(pg_temp.picks('a4'), 1::bigint, 'and the one required pick is the only pick');

-- ── apply_level_up carries the variant ───────────────────────────────────────

select lives_ok(format($$
  select public.apply_level_up(%L, '{"level": 3}'::jsonb,
    jsonb_build_object('op', 'update', 'id', %L, 'levels', 3, 'subclass_variant', 'Coast'),
    jsonb_build_array(jsonb_build_object('spell_id', %L, 'is_prepared', true)))
$$, pg_temp.t('e8'), pg_temp.t('a8'), pg_temp.t('ba')), 'a level-up that names the terrain succeeds');
select is((select subclass_variant from public.character_classes where id = pg_temp.u('a8')), 'Coast', 'the variant is on the class row');
select is(pg_temp.granted('a8'), array[pg_temp.t('b2')], 'and that option''s spells arrived in the same call');

-- An author removes the option a character holds. The character must still be
-- able to level: apply_level_up names subclass_variant in every class update, so
-- the validation runs, and it may only refuse an option being CHOSEN, never one
-- merely kept. The stale option grants nothing; the client asks again.
reset role;
update public.custom_subclasses set spell_variants = spell_variants - 'Coast'
 where id = (select subclass_definition_id from public.character_classes where id = pg_temp.u('a8'));
set local role authenticated;
select pg_temp.as_user();
select lives_ok(format($$
  update public.character_classes set levels = levels, subclass_variant = subclass_variant where id = %L
$$, pg_temp.t('a8')), 'a class update that keeps an option the author removed still succeeds');
select is(pg_temp.granted('a8'), '{}'::text[], 'and the stale option grants nothing');
select throws_like(format($$
  update public.character_classes set subclass_variant = 'Arctic-gone' where id = %L
$$, pg_temp.t('a8')), '%not an option%', 'choosing an option the subclass does not offer is still refused');

select throws_like(format($$
  select public.apply_level_up(%L, '{"level": 3}'::jsonb,
    jsonb_build_object('op', 'update', 'id', %L, 'levels', 3, 'subclass_variant', 'Nope'),
    jsonb_build_array(jsonb_build_object('spell_id', %L, 'is_prepared', true)))
$$, pg_temp.t('e9'), pg_temp.t('a9'), pg_temp.t('bb')), '%not an option%', 'an invalid variant through the RPC is refused');
select is((select level from public.party_members where id = pg_temp.u('e9')), 2, 'and the character is still level 2');
select is((select count(*) from public.character_spells where party_member_id = pg_temp.u('e9')), 0::bigint, 'with no spell written');

-- ── A grant the class cannot hold yet ────────────────────────────────────────

select lives_ok(format($$
  select public.apply_level_up(%L, '{"level": 3}'::jsonb,
    jsonb_build_object('op', 'update', 'id', %L, 'levels', 3),
    jsonb_build_array(jsonb_build_object('spell_id', %L, 'is_prepared', true),
                      jsonb_build_object('spell_id', %L, 'is_prepared', true)))
$$, pg_temp.t('eb'), pg_temp.t('ab'), pg_temp.t('b7'), pg_temp.t('bf')),
  'a level-up succeeds though its subclass grants a level-9 spell at tier 3');
select is(pg_temp.granted('ab'), array[pg_temp.t('b9')], 'the legal grant arrived and the level-9 spell is absent');
reset role;
update public.character_classes set levels = 17 where id = pg_temp.u('ab');
select is(pg_temp.granted('ab'), array[pg_temp.t('b9'), pg_temp.t('c5')]::text[], 'at level 17 the spell arrives');

-- ── One character cannot abort the author's edit ─────────────────────────────

select lives_ok($$update public.custom_subclasses
  set granted_spells = jsonb_build_object('1', jsonb_build_array(pg_temp.t('c5'), pg_temp.t('b9'))) where id = pg_temp.u('d9')$$,
  'a subclass edit that is illegal for one attached character still succeeds');
select is(pg_temp.granted('ac'), array[pg_temp.t('b9')], 'the level-1 character gets what it can hold');
select is(pg_temp.granted('ad'), array[pg_temp.t('b9'), pg_temp.t('c5')]::text[], 'and the level-17 character gets both');

-- ── Deleting the subclass ────────────────────────────────────────────────────

select lives_ok($$delete from public.custom_subclasses where id = pg_temp.u('d9')$$, 'a subclass can be deleted');
select is(pg_temp.granted('ac'), '{}'::text[], 'its grants leave the level-1 character');
select is(pg_temp.granted('ad'), '{}'::text[], 'and the level-17 character');

set local role authenticated;
select pg_temp.as_user();

-- ── apply_level_up 'add' carries the variant ─────────────────────────────────

select lives_ok(format($$
  select public.apply_level_up(%L, '{"level": 2}'::jsonb,
    jsonb_build_object('op', 'add', 'class_name', 'Cleric', 'class_definition_id',
      (select id from public.system_classes where ruleset = '2024' and class_name = 'Cleric'),
      'class_definition_kind', 'system', 'levels', 2, 'is_primary', true,
      'subclass_name', 'Zzs Lords', 'subclass_definition_id', %L, 'subclass_variant', 'Air'),
    jsonb_build_array(jsonb_build_object('spell_id', %L, 'is_prepared', true)))
$$, pg_temp.t('ea'), pg_temp.t('d7'), pg_temp.t('b7')),
  'a first class taken with a subclass and a variant succeeds, its pick from the variant''s expanded list included');
select is((select subclass_variant from public.character_classes where party_member_id = pg_temp.u('ea')), 'Air',
  'the variant landed on the inserted row');
select is((select array_agg(spell_id) from pg_temp.rows_of('ea') where granted_by_subclass),
  array[pg_temp.t('b4')], 'that option''s level-1 grant is in effect');
select ok((select not always_prepared from pg_temp.rows_of('ea') where spell_id = pg_temp.t('b7')),
  'and the expanded-list pick was admitted as an ordinary pick');

-- ── browse_spells ────────────────────────────────────────────────────────────

select ok(not exists (select 1 from jsonb_array_elements(
  public.browse_spells(array[]::text[], '2024', pg_temp.u('c1'), 'Zzs X', null, null, 'Cleric', 'custom') -> 'rows') r),
  'a Wizard spell is filtered out of a Cleric browse');
select ok(exists (select 1 from jsonb_array_elements(
  public.browse_spells(array[]::text[], '2024', pg_temp.u('c1'), 'Zzs X', null, null, 'Cleric', 'custom', 48, 0,
    array[pg_temp.t('b7')]) -> 'rows') r where r ->> 'id' = pg_temp.t('b7')),
  'p_extra_ids lets it through the class filter');
select ok(not exists (select 1 from jsonb_array_elements(
  public.browse_spells(array[]::text[], '2024', pg_temp.u('c1'), 'Zzs G1', null, null, 'Wizard', 'custom', 48, 0,
    array[pg_temp.t('b7')]) -> 'rows') r),
  'and only those ids');

reset role;
select is((select count(*) from pg_proc where proname = 'browse_spells' and pronamespace = 'public'::regnamespace), 1::bigint,
  'browse_spells has one signature');
select ok(not has_function_privilege('authenticated', 'private.sync_subclass_spells(uuid)', 'EXECUTE'),
  'a client cannot call the sync');
select ok(not has_function_privilege('anon', 'public.browse_spells(text[], text, uuid, text, integer, text, text, text, integer, integer, text[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.browse_spells(text[], text, uuid, text, integer, text, text, text, integer, integer, text[])', 'EXECUTE'),
  'browse_spells is for signed-in users only');

select * from finish();
rollback;
