-- Epic #976 wave 4: level-up carries every book choice, and refuses a feat the
-- character cannot take (20261005144119).
--
--   apply_level_up   writes skill_proficiencies and weapon_masteries; every feat
--                    ADDED to class_choices.feats (new list minus old, counted)
--                    must be a feat row of the character's edition that its
--                    owner, or a DM of its table, may use. Only additions are
--                    checked, so a list already on the row can be sent back.
--   apply_de_level   writes class_choices, skill/tool proficiencies and masteries
--
--   1 Ann  owns e1 (2024 Fighter, level 3) at c1     3 Sam  stranger, in no part of c1
--   2 Dan  DM of c1                                  4 Otto another author of private feats

begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('97602000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'level-up-feats-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name, ruleset) values
  ('97602000-0000-4000-8000-0000000000c1', '97602000-0000-4000-8000-000000000002', 'Dan''s table', '2024');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('97602000-0000-4000-8000-0000000000c1', '97602000-0000-4000-8000-000000000002', 'dm', 'Dan'),
  ('97602000-0000-4000-8000-0000000000c1', '97602000-0000-4000-8000-000000000001', 'player', 'Ann')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- f1 official 2024 feat       f2 official 2014 feat      f3 a feature, not a feat
-- f4 Otto's private feat      f5 Ann's own feat          f6 Dan's feat (the table's DM)
-- f7 official repeatable feat
insert into public.class_features (id, user_id, name, source, ruleset, kind, feat_category, repeatable) values
  ('97602000-0000-4000-8000-0000000000f1', null, 'Official 2024 Feat', 'grimoire-system', '2024', 'feat', 'general', false),
  ('97602000-0000-4000-8000-0000000000f2', null, 'Official 2014 Feat', 'grimoire-system', '2014', 'feat', 'general', false),
  ('97602000-0000-4000-8000-0000000000f4', '97602000-0000-4000-8000-000000000004', 'Otto''s Feat', null, '2024', 'feat', 'general', false),
  ('97602000-0000-4000-8000-0000000000f5', '97602000-0000-4000-8000-000000000001', 'Ann''s Feat', null, '2024', 'feat', 'general', false),
  ('97602000-0000-4000-8000-0000000000f6', '97602000-0000-4000-8000-000000000002', 'Dan''s Feat', null, '2024', 'feat', 'general', false),
  ('97602000-0000-4000-8000-0000000000f7', null, 'Official Repeatable Feat', 'grimoire-system', '2024', 'feat', 'general', true);
insert into public.class_features (id, user_id, name, source, ruleset, kind) values
  ('97602000-0000-4000-8000-0000000000f3', null, 'Official Feature', 'grimoire-system', '2024', 'feature');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, ruleset, max_hp, current_hp) values
  ('97602000-0000-4000-8000-0000000000e1', '97602000-0000-4000-8000-000000000001', '97602000-0000-4000-8000-000000000001',
   '97602000-0000-4000-8000-0000000000c1', 'Ann''s Fighter', 3, '2024', 20, 20);
insert into public.character_classes (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
select '97602000-0000-4000-8000-0000000000a1', m.id, 'Fighter', 3, true, sc.id, 'system'
  from public.party_members m join public.system_classes sc on sc.ruleset = '2024' and sc.class_name = 'Fighter'
 where m.id = '97602000-0000-4000-8000-0000000000e1';

-- Put the character back at level 3 with a given feat list, then level it up
-- to 4 with another. Every call starts from the same row.
create function pg_temp.reset_e1(p_old jsonb) returns void language sql security definer as $$
  update public.party_members set level = 3, class_choices = jsonb_build_object('feats', p_old),
         skill_proficiencies = '[]'::jsonb, weapon_masteries = '{}', tool_proficiencies = '{}'
   where id = '97602000-0000-4000-8000-0000000000e1';
  update public.character_classes set levels = 3 where id = '97602000-0000-4000-8000-0000000000a1';
$$;
create function pg_temp.up(p_old jsonb, p_update jsonb) returns void language plpgsql as $$
begin
  perform pg_temp.reset_e1(p_old);
  perform public.apply_level_up('97602000-0000-4000-8000-0000000000e1',
    jsonb_build_object('level', 4) || p_update,
    '{"op": "update", "id": "97602000-0000-4000-8000-0000000000a1", "levels": 4}'::jsonb, '[]'::jsonb);
end $$;
create function pg_temp.pm() returns public.party_members language sql security definer as $$
  select * from public.party_members where id = '97602000-0000-4000-8000-0000000000e1';
$$;
create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"97602000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

set local role authenticated;
select pg_temp.as_user(1);

-- ── A feat of the edition ────────────────────────────────────────────────────

select lives_ok($$ select pg_temp.up('[]', '{"class_choices": {"feats": ["97602000-0000-4000-8000-0000000000f1"]}}') $$,
  'the owner adds an official feat of the character''s edition');
select is((pg_temp.pm()).class_choices -> 'feats', '["97602000-0000-4000-8000-0000000000f1"]'::jsonb, 'and it is on the character');
select throws_ok($$ select pg_temp.up('[]', '{"class_choices": {"feats": ["97602000-0000-4000-8000-0000000000f2"]}}') $$,
  '22023', null, 'an official feat of the other edition is refused');

-- ── A feature is not a feat, a string is not an id ───────────────────────────

select throws_ok($$ select pg_temp.up('[]', '{"class_choices": {"feats": ["97602000-0000-4000-8000-0000000000f3"]}}') $$,
  '22023', null, 'a feature row is not a feat');
select throws_ok($$ select pg_temp.up('[]', '{"class_choices": {"feats": ["not-an-id"]}}') $$,
  '22023', null, 'a string that is no id is refused');

-- ── Whose feat it is ─────────────────────────────────────────────────────────

select throws_ok($$ select pg_temp.up('[]', '{"class_choices": {"feats": ["97602000-0000-4000-8000-0000000000f4"]}}') $$,
  '22023', null, 'another author''s private feat is refused');
select lives_ok($$ select pg_temp.up('[]', '{"class_choices": {"feats": ["97602000-0000-4000-8000-0000000000f5"]}}') $$,
  'control: the owner''s own feat is taken');
select lives_ok($$ select pg_temp.up('[]', '{"class_choices": {"feats": ["97602000-0000-4000-8000-0000000000f6"]}}') $$,
  'and so is a feat of the table''s DM');
select is((pg_temp.pm()).class_choices -> 'feats', '["97602000-0000-4000-8000-0000000000f6"]'::jsonb, 'which lands on the character');

-- ── Only additions are checked ───────────────────────────────────────────────

select lives_ok($$ select pg_temp.up('["97602000-0000-4000-8000-0000000000f4"]',
  '{"class_choices": {"feats": ["97602000-0000-4000-8000-0000000000f4"]}}') $$,
  'a list already on the row is sent back unchanged even though an old entry would no longer pass');
select throws_ok($$ select pg_temp.up('["97602000-0000-4000-8000-0000000000f4"]',
  '{"class_choices": {"feats": ["97602000-0000-4000-8000-0000000000f4", "97602000-0000-4000-8000-0000000000f4"]}}') $$,
  '22023', null, 'but a second copy of it is an addition, and is refused');
select lives_ok($$ select pg_temp.up('["97602000-0000-4000-8000-0000000000f7"]',
  '{"class_choices": {"feats": ["97602000-0000-4000-8000-0000000000f7", "97602000-0000-4000-8000-0000000000f7"]}}') $$,
  'control: a repeatable feat taken again is checked and passes when it is valid');

-- ── The other things a level writes ──────────────────────────────────────────

select lives_ok($$ select pg_temp.up('[]',
  '{"skill_proficiencies": [{"skill": "Athletics", "expertise": true}], "weapon_masteries": ["Longsword", "Handaxe"]}') $$,
  'a level-up writes skill proficiencies and weapon masteries');
select is((pg_temp.pm()).skill_proficiencies, '[{"skill": "Athletics", "expertise": true}]'::jsonb, 'the skills land');
select is((pg_temp.pm()).weapon_masteries, array['Longsword', 'Handaxe'], 'and so do the masteries');

-- ── De-level takes the picks back ────────────────────────────────────────────

select pg_temp.reset_e1('["97602000-0000-4000-8000-0000000000f1"]');
reset role;
update public.party_members set skill_proficiencies = '[{"skill": "Athletics", "expertise": true}]'::jsonb,
       weapon_masteries = array['Longsword', 'Handaxe'], tool_proficiencies = array['Smith''s Tools']
 where id = '97602000-0000-4000-8000-0000000000e1';
set local role authenticated;
select pg_temp.as_user(1);
select lives_ok($$
  select public.apply_de_level('97602000-0000-4000-8000-0000000000e1',
    '{"level": 2, "class_choices": {"feats": []}, "skill_proficiencies": [], "weapon_masteries": ["Longsword"], "tool_proficiencies": []}'::jsonb,
    '{"op": "update", "id": "97602000-0000-4000-8000-0000000000a1", "levels": 2}'::jsonb, '{}')
$$, 'the owner levels the character down, taking its picks back');
select is((pg_temp.pm()).class_choices -> 'feats', '[]'::jsonb, 'the feat is gone');
select is((pg_temp.pm()).skill_proficiencies, '[]'::jsonb, 'so is the expertise');
select is((pg_temp.pm()).weapon_masteries, array['Longsword'], 'and a mastery');
select is((pg_temp.pm()).tool_proficiencies, '{}'::text[], 'and a tool proficiency');

-- ── A stranger does none of it ───────────────────────────────────────────────

select pg_temp.as_user(3);
select throws_ok($$
  select public.apply_de_level('97602000-0000-4000-8000-0000000000e1', '{"class_choices": {"feats": ["x"]}}'::jsonb, null, '{}')
$$, '42501', null, 'a stranger cannot level the character down');
select throws_ok($$
  select public.apply_level_up('97602000-0000-4000-8000-0000000000e1', '{"level": 4}'::jsonb,
    '{"op": "update", "id": "97602000-0000-4000-8000-0000000000a1", "levels": 4}'::jsonb, '[]'::jsonb)
$$, '42501', null, 'nor up');

-- ── A feature spends a spell slot (2014 Divine Smite) ────────────────────────

reset role;
update public.party_members
   set spell_slots = '[{"level": 1, "max": 2, "used": 0, "pool": "spellcasting", "recovery": "long"}]'::jsonb
 where id = '97602000-0000-4000-8000-0000000000e1';
set local role authenticated;

select pg_temp.as_user(3);
select throws_ok($$
  select public.spend_feature_spell_slot('97602000-0000-4000-8000-0000000000e1', 1, 'spellcasting')
$$, 'P0001', 'Access denied', 'a stranger cannot spend the character''s slot');

select pg_temp.as_user(1);
select lives_ok($$
  select public.spend_feature_spell_slot('97602000-0000-4000-8000-0000000000e1', 1, 'spellcasting')
$$, 'the owner spends one');
select is(((pg_temp.pm()).spell_slots -> 0 ->> 'used')::int, 1, 'and exactly one is used');
select throws_ok($$
  select public.spend_feature_spell_slot('97602000-0000-4000-8000-0000000000e1', 1, 'temporary')
$$, 'P0001', 'A feature spends a spellcasting or pact slot', 'a feature cannot invent a pool');

select * from finish();
rollback;
