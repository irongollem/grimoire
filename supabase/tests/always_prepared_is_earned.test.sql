-- #1027 (20261008225424): an always-prepared spell is earned, and the subclass
-- bookkeeping columns are the server's.
--
--   feature pick  a client may write an always-prepared row only when one of
--                 the class's features picks a spell of that level from a list
--                 the spell is on, and no more of them than the features grant
--   level-up      apply_level_up cannot smuggle one in through p_spell_rows
--   server cols   granted_by_subclass and pick_was_* are refused from a client,
--                 as is changing what a granted row is (always_prepared, its
--                 spell, its source); the sync still writes them
--   non-class     no spell but a class's is ever always prepared
--   copy          a clone keeps the subclass variant and each grant once
--
--   1 Ann  DM of c1     2 Bea  player at c1, owner of e1 (2024 Cleric 1, Zzq Domain, variant A)

begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

create function pg_temp.u(p text) returns uuid language sql immutable as $$
  select ('99600000-0000-4000-8000-0000000000' || p)::uuid;
$$;
create function pg_temp.t(p text) returns text language sql immutable as $$
  select pg_temp.u(p)::text;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  (pg_temp.u('01'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'always-prepared-1@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  (pg_temp.u('02'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'always-prepared-2@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, ruleset) values (pg_temp.u('c1'), pg_temp.u('01'), 'Ann''s table', '2024');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values (pg_temp.u('c1'), pg_temp.u('01'), 'dm', 'Ann')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- W0/W1 wizard cantrips, W2 a 1st-level wizard spell, S0 a sorcerer cantrip,
-- G1 the domain's grant, V1 its variant grant, C1-C3 ordinary cleric picks.
insert into public.spells (id, user_id, campaign_id, name, level, classes, ruleset)
select pg_temp.u(v.id), pg_temp.u('01'), pg_temp.u('c1'), 'Zzq ' || v.name, v.lvl, v.cls, '2024'
from (values
  ('b0', 'W0', 0, array['Wizard']), ('b1', 'W1', 0, array['Wizard']), ('b2', 'W2', 1, array['Wizard']),
  ('b3', 'S0', 0, array['Sorcerer']), ('b4', 'G1', 1, array['Cleric']), ('b5', 'V1', 1, array['Cleric']),
  ('b6', 'C1', 1, array['Cleric']), ('b7', 'C2', 1, array['Cleric']), ('b8', 'C3', 1, array['Cleric'])
) as v(id, name, lvl, cls);

-- A level-1 domain feature that picks one wizard cantrip (Arcane Initiate's shape).
insert into public.class_features (id, user_id, campaign_id, name, kind, ruleset, mechanics) values
  (pg_temp.u('f1'), null, null, 'Zzq Initiate', 'feature', '2024',
   '{"choices": [{"key": "zzq_cantrips", "label": "Zzq cantrips", "replace_on_level_up": false,
                  "pick": {"kind": "spell", "lists": ["Wizard"], "level": 0, "free_cast": false},
                  "count": {"kind": "per_grant", "amount": 1}}]}'::jsonb);
insert into public.custom_subclasses
  (id, user_id, campaign_id, class_name, subclass_name, ruleset, features, granted_spells, spell_variants, spell_variant_label) values
  (pg_temp.u('d1'), null, null, 'Cleric', 'Zzq Domain', '2024',
   jsonb_build_object('1', jsonb_build_array(pg_temp.t('f1'))),
   jsonb_build_object('1', jsonb_build_array(pg_temp.t('b4'))),
   jsonb_build_object('A', jsonb_build_object('1', jsonb_build_array(pg_temp.t('b5')))),
   'Terrain');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, ruleset, max_hp, current_hp)
values (pg_temp.u('e1'), pg_temp.u('02'), pg_temp.u('02'), pg_temp.u('c1'), 'Zzq Cleric', 1, '2024', 20, 20);
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id)
values (pg_temp.u('c1'), pg_temp.u('02'), 'player', 'Bea', pg_temp.u('e1'));
insert into public.character_classes
  (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind,
   subclass_name, subclass_definition_id, subclass_variant)
select pg_temp.u('a1'), pg_temp.u('e1'), 'Cleric', 1, true, sc.id, 'system', 'Zzq Domain', pg_temp.u('d1'), 'A'
  from public.system_classes sc where sc.ruleset = '2024' and sc.class_name = 'Cleric';

create function pg_temp.rows_of(p_member uuid, p_spell text) returns setof public.character_spells
language sql security definer as $$
  select * from public.character_spells where party_member_id = p_member and spell_id = pg_temp.t(p_spell);
$$;

set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', pg_temp.u('02')), true);

-- ── A feature's pick ─────────────────────────────────────────────────────────

select throws_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id, is_prepared, always_prepared)
  values (pg_temp.u('e1'), pg_temp.t('b3'), 'class', pg_temp.u('a1'), true, true)
$$, '42501', null, 'a cantrip on no list the feature picks from cannot be always prepared');
select throws_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id, is_prepared, always_prepared)
  values (pg_temp.u('e1'), pg_temp.t('b2'), 'class', pg_temp.u('a1'), true, true)
$$, '42501', null, 'nor a spell from the right list at a level the feature does not pick');
select lives_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id, is_prepared, always_prepared)
  values (pg_temp.u('e1'), pg_temp.t('b0'), 'class', pg_temp.u('a1'), true, true)
$$, 'the feature''s own pick is written as creation writes it');
select throws_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id, is_prepared, always_prepared)
  values (pg_temp.u('e1'), pg_temp.t('b1'), 'class', pg_temp.u('a1'), true, true)
$$, '42501', null, 'and a second one is refused: the feature grants one pick');

insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id, is_known)
values (pg_temp.u('e1'), pg_temp.t('b6'), 'class', pg_temp.u('a1'), true);
select throws_ok($$
  update public.character_spells set is_prepared = true, always_prepared = true
   where party_member_id = pg_temp.u('e1') and spell_id = pg_temp.t('b6')
$$, '42501', null, 'an ordinary pick cannot be turned always prepared to free its slot');

-- ── The server's columns ────────────────────────────────────────────────────

select is((select count(*) from pg_temp.rows_of(pg_temp.u('e1'), 'b4') where granted_by_subclass and always_prepared),
  1::bigint, 'the sync still writes the subclass grant');
select throws_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id, is_prepared, always_prepared, granted_by_subclass)
  values (pg_temp.u('e1'), pg_temp.t('b7'), 'class', pg_temp.u('a1'), true, true, true)
$$, '42501', 'Subclass grants are written by the server', 'a client cannot write a row as a subclass grant');
select throws_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id, is_known, pick_was_prepared, pick_was_always_prepared)
  values (pg_temp.u('e1'), pg_temp.t('b8'), 'class', pg_temp.u('a1'), true, true, true)
$$, '42501', 'Subclass grants are written by the server', 'nor write what a grant remembers of a pick');
select throws_ok($$
  update public.character_spells set granted_by_subclass = false
   where party_member_id = pg_temp.u('e1') and spell_id = pg_temp.t('b4')
$$, '42501', 'Subclass grants are written by the server', 'nor unflag a grant');
select throws_ok($$
  update public.character_spells set always_prepared = false
   where party_member_id = pg_temp.u('e1') and spell_id = pg_temp.t('b4')
$$, '42501', 'Subclass grants are written by the server', 'nor take always-prepared off a grant');
select throws_ok($$
  update public.character_spells set spell_id = pg_temp.t('b2')
   where party_member_id = pg_temp.u('e1') and spell_id = pg_temp.t('b4')
$$, '42501', 'Subclass grants are written by the server', 'nor point a grant at another spell');
select throws_ok($$
  update public.character_spells set source_type = 'other', source_class_id = null, source_label = 'Mine now'
   where party_member_id = pg_temp.u('e1') and spell_id = pg_temp.t('b4')
$$, '42501', 'Subclass grants are written by the server', 'nor move a grant off its class, out of the sync''s reach');
select lives_ok($$
  update public.character_spells set uses_remaining = null
   where party_member_id = pg_temp.u('e1') and spell_id = pg_temp.t('b4')
$$, 'a grant''s other columns are still the player''s to update');

-- ── Not a class spell ───────────────────────────────────────────────────────

select throws_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_label, is_prepared, always_prepared)
  values (pg_temp.u('e1'), pg_temp.t('b2'), 'other', 'Mine', true, true)
$$, '23514', null, 'a spell of no class cannot be always prepared');
select lives_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, source_label, is_prepared)
  values (pg_temp.u('e1'), pg_temp.t('b2'), 'other', 'Mine', false)
$$, 'it is still written as the player''s own record');

-- ── Level-up ────────────────────────────────────────────────────────────────

select throws_ok($$
  select public.apply_level_up(pg_temp.u('e1'), '{"level": 2}'::jsonb,
    jsonb_build_object('op', 'update', 'id', pg_temp.u('a1'), 'levels', 2),
    jsonb_build_array(
      jsonb_build_object('spell_id', pg_temp.t('b7'), 'is_prepared', true),
      jsonb_build_object('spell_id', pg_temp.t('b2'), 'is_prepared', true, 'always_prepared', true)))
$$, '42501', null, 'apply_level_up refuses an always-prepared row no feature grants');
select is((select level from public.party_members where id = pg_temp.u('e1')), 1, 'and the level-up rolled back whole');
select lives_ok($$
  select public.apply_level_up(pg_temp.u('e1'), '{"level": 2}'::jsonb,
    jsonb_build_object('op', 'update', 'id', pg_temp.u('a1'), 'levels', 2),
    jsonb_build_array(jsonb_build_object('spell_id', pg_temp.t('b7'), 'is_prepared', true)))
$$, 'the same level-up without it goes through');

-- ── The copy ────────────────────────────────────────────────────────────────

create temp table clone_id on commit drop as select public.clone_party_member(pg_temp.u('e1')) as id;

select is((select count(*) from pg_temp.rows_of((select id from clone_id), 'b4')), 1::bigint,
  'a clone holds the domain grant once, not once from the sync and again from the copy');
select ok((select bool_and(granted_by_subclass) from pg_temp.rows_of((select id from clone_id), 'b5')),
  'and keeps the variant''s grant, flagged as a grant');
select is((select cc.subclass_variant from public.character_classes cc where cc.party_member_id = (select id from clone_id)),
  'A', 'and the variant itself');

select * from finish();
rollback;
