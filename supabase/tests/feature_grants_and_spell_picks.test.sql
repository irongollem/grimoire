-- #994: a feature grants a proficiency outright and lets the player learn
-- spells from a class's spell list (20261006160034).
--
--   apply_level_up   writes `languages` (a fixed grant may give one), and takes
--                    a feature's picked spells: an always-prepared row of the
--                    class being levelled, and a feat's labelled row with its
--                    free cast; neither counts as a required class spell
--   apply_de_level   writes `languages` back
--   a stranger       does neither
--
--   1 Ann  owns e1 (2024 Cleric, level 13; 14 owes no class spell or cantrip) at c1     2 Dan  DM of c1     3 Sam  stranger

begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('99400000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'feature-grants-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 3) as n;

insert into public.campaigns (id, user_id, name, ruleset) values
  ('99400000-0000-4000-8000-0000000000c1', '99400000-0000-4000-8000-000000000002', 'Dan''s table', '2024');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('99400000-0000-4000-8000-0000000000c1', '99400000-0000-4000-8000-000000000002', 'dm', 'Dan'),
  ('99400000-0000-4000-8000-0000000000c1', '99400000-0000-4000-8000-000000000001', 'player', 'Ann')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- Two of Dan's spells: a wizard cantrip and a 1st-level wizard spell.
insert into public.spells (id, user_id, campaign_id, name, level, classes, ruleset) values
  ('99400000-0000-4000-8000-0000000000b0', '99400000-0000-4000-8000-000000000002', '99400000-0000-4000-8000-0000000000c1', 'Spark', 0, array['Wizard'], '2024'),
  ('99400000-0000-4000-8000-0000000000b1', '99400000-0000-4000-8000-000000000002', '99400000-0000-4000-8000-0000000000c1', 'Glimmer', 1, array['Wizard'], '2024');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, ruleset, max_hp, current_hp, languages) values
  ('99400000-0000-4000-8000-0000000000e1', '99400000-0000-4000-8000-000000000001', '99400000-0000-4000-8000-000000000001',
   '99400000-0000-4000-8000-0000000000c1', 'Ann''s Cleric', 13, '2024', 20, 20, array['Common']);
-- A domain whose level-14 feature picks one wizard cantrip (Arcane Initiate's
-- shape): the pick the level-up below writes, and the only one it may (#1027).
insert into public.class_features (id, user_id, campaign_id, name, kind, ruleset, mechanics) values
  ('99400000-0000-4000-8000-0000000000f1', null, null, 'Zzf Initiate', 'feature', '2024',
   '{"choices": [{"key": "zzf_cantrips", "label": "Zzf cantrips", "replace_on_level_up": false,
                  "pick": {"kind": "spell", "lists": ["Wizard"], "level": 0, "free_cast": false},
                  "count": {"kind": "per_grant", "amount": 1}}]}'::jsonb);
insert into public.custom_subclasses (id, user_id, campaign_id, class_name, subclass_name, ruleset, features) values
  ('99400000-0000-4000-8000-0000000000d1', null, null, 'Cleric', 'Zzf Domain', '2024',
   '{"14": ["99400000-0000-4000-8000-0000000000f1"]}'::jsonb);
insert into public.character_classes
  (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind,
   subclass_name, subclass_definition_id)
select '99400000-0000-4000-8000-0000000000a1', m.id, 'Cleric', 13, true, sc.id, 'system',
       'Zzf Domain', '99400000-0000-4000-8000-0000000000d1'
  from public.party_members m join public.system_classes sc on sc.ruleset = '2024' and sc.class_name = 'Cleric'
 where m.id = '99400000-0000-4000-8000-0000000000e1';

create function pg_temp.pm() returns public.party_members language sql security definer as $$
  select * from public.party_members where id = '99400000-0000-4000-8000-0000000000e1';
$$;
create function pg_temp.spell_row(p_spell text) returns public.character_spells language sql security definer as $$
  select * from public.character_spells
   where party_member_id = '99400000-0000-4000-8000-0000000000e1' and spell_id = p_spell;
$$;
create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"99400000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

set local role authenticated;

-- ── A stranger does nothing ──────────────────────────────────────────────────

select pg_temp.as_user(3);
select throws_ok($$
  select public.apply_level_up('99400000-0000-4000-8000-0000000000e1', '{"level": 14, "languages": ["Common", "Draconic"]}'::jsonb,
    '{"op": "update", "id": "99400000-0000-4000-8000-0000000000a1", "levels": 14}'::jsonb, '[]'::jsonb)
$$, '42501', null, 'a stranger cannot level the character up to give it a language');

-- ── The owner levels up ──────────────────────────────────────────────────────

select pg_temp.as_user(1);
select lives_ok($$
  select public.apply_level_up('99400000-0000-4000-8000-0000000000e1',
    '{"level": 14, "languages": ["Common", "Draconic"]}'::jsonb,
    '{"op": "update", "id": "99400000-0000-4000-8000-0000000000a1", "levels": 14}'::jsonb,
    '[{"spell_id": "99400000-0000-4000-8000-0000000000b0", "is_prepared": true, "always_prepared": true},
      {"spell_id": "99400000-0000-4000-8000-0000000000b1", "source_type": "feat", "source_label": "Magic Initiate",
       "uses_per_day": 1, "uses_remaining": 1, "resets_on": "long_rest"}]'::jsonb)
$$, 'the owner levels up with a granted language and two picked spells, and no required class spell is asked for them');

select is((pg_temp.pm()).languages, array['Common', 'Draconic'], 'the granted language is written');
select is((pg_temp.spell_row('99400000-0000-4000-8000-0000000000b0')).source_class_id, '99400000-0000-4000-8000-0000000000a1'::uuid,
  'a class feature''s cantrip is a spell of the class being levelled, though it is not on that class''s list');
select is((pg_temp.spell_row('99400000-0000-4000-8000-0000000000b0')).always_prepared, true, 'and always prepared');
select is((pg_temp.spell_row('99400000-0000-4000-8000-0000000000b1')).source_label, 'Magic Initiate',
  'a feat''s pick is the feat''s spell');
select is((pg_temp.spell_row('99400000-0000-4000-8000-0000000000b1')).uses_per_day, 1, 'with its one free cast');

-- ── And back down ────────────────────────────────────────────────────────────

select lives_ok($$
  select public.apply_de_level('99400000-0000-4000-8000-0000000000e1', '{"level": 13, "languages": ["Common"]}'::jsonb,
    '{"op": "update", "id": "99400000-0000-4000-8000-0000000000a1", "levels": 13}'::jsonb,
    array['99400000-0000-4000-8000-0000000000b0', '99400000-0000-4000-8000-0000000000b1'])
$$, 'the owner levels the character down');
select is((pg_temp.pm()).languages, array['Common'], 'taking the granted language back');

select * from finish();
rollback;
