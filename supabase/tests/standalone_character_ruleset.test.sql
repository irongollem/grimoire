-- A character with no campaign (#729/#730) has a ruleset, and exactly one
-- function resolves it.
--
-- Fifteen functions used to read a character's ruleset by joining the member to
-- its campaign. A standalone character has no campaign, so the join returned no
-- row: `into strict` raised P0002 and no campaign-less character could be given
-- a class at all, while a plain `into` left the ruleset NULL and let a 2014
-- character through `if v_ruleset <> '2024'`. Fixed in 20261001220509.
--
-- Every standalone assertion sits beside a control in a 2024 campaign, so it
-- proves the helper reads the campaign when there is one rather than answering
-- '2014' for everybody.
--
--   m1  Sol's standalone character, no campaign
--   m2  Sol's character in a 2024 campaign

begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('10010000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'standalone-ruleset@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, ruleset)
values ('10010000-0000-4000-8000-0000000000c1', '10010000-0000-4000-8000-000000000001', 'Sol''s 2024 table', '2024');

insert into public.party_members (
  id, user_id, owner_user_id, campaign_id, name, class, level, cha, proficiency_bonus, class_resources
) values
  ('10010000-0000-4000-8000-0000000000e1', '10010000-0000-4000-8000-000000000001',
   '10010000-0000-4000-8000-000000000001', null, 'Standalone', 'Sorcerer', 1, 16, 2,
   '{"innate_sorcery":{"current":2,"max":2,"rest":"long"}}'::jsonb),
  ('10010000-0000-4000-8000-0000000000e2', '10010000-0000-4000-8000-000000000001',
   '10010000-0000-4000-8000-000000000001', '10010000-0000-4000-8000-0000000000c1', 'At a table', 'Cleric', 1, 10, 2,
   '{}'::jsonb);

-- ── The resolver is total ────────────────────────────────────────────────────

select is(private.party_member_ruleset('10010000-0000-4000-8000-0000000000e1'), '2014',
  'a character with no campaign plays under 2014');
select is(private.party_member_ruleset('10010000-0000-4000-8000-0000000000e2'), '2024',
  'a character in a campaign plays under the campaign''s ruleset');
select is(private.party_member_ruleset('10010000-0000-4000-8000-0000000000ff'), '2014',
  'an unknown character resolves to 2014 rather than NULL');

-- ── The class row: the call that returned 500 P0002 ──────────────────────────

select lives_ok($$
  insert into public.character_classes
    (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
  values ('10010000-0000-4000-8000-0000000000f1', '10010000-0000-4000-8000-0000000000e1', 'Sorcerer', 1, true,
    (select id from public.system_classes where ruleset = '2014' and class_name = 'Sorcerer'), 'system')
$$, 'a standalone character takes a pinned 2014 class');

select throws_ok($$
  insert into public.character_classes
    (party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
  values ('10010000-0000-4000-8000-0000000000e1', 'Cleric', 1, false,
    (select id from public.system_classes where ruleset = '2024' and class_name = 'Cleric'), 'system')
$$, 'P0001', 'Class definition is unavailable for ruleset 2014',
  'a standalone character is refused a 2024 class by name, not by a missing row');

select lives_ok($$
  insert into public.character_classes
    (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
  values ('10010000-0000-4000-8000-0000000000f2', '10010000-0000-4000-8000-0000000000e2', 'Cleric', 1, true,
    (select id from public.system_classes where ruleset = '2024' and class_name = 'Cleric'), 'system')
$$, 'a character at a 2024 table takes a pinned 2024 class');

-- The window trigger reads the same resolver: 2024 has a Cleric policy, 2014
-- has none, so a window opens for the table character and not the standalone.
select is((select count(*)::int from public.spell_change_windows
  where party_member_id = '10010000-0000-4000-8000-0000000000e2'), 1,
  'a new 2024 Cleric gets its preparation window');
select is((select count(*)::int from public.spell_change_windows
  where party_member_id = '10010000-0000-4000-8000-0000000000e1'), 0,
  'a standalone 2014 Sorcerer has no 2024 change window');

-- ── Level-up counts: the other `into strict` ─────────────────────────────────

select results_eq($$
  select spell_count, cantrip_count
  from public.required_level_up_spell_choices('10010000-0000-4000-8000-0000000000e1', 'Sorcerer', 1)
$$, $$ values (2, 4) $$, 'a standalone Sorcerer levels by the 2014 spells-known table');

select throws_ok($$
  select * from public.required_level_up_spell_choices('10010000-0000-4000-8000-0000000000ff', 'Sorcerer', 1)
$$, 'P0002', 'Party member not found', 'level-up counts still refuse a character that does not exist');

-- ── The NULL ruleset: a 2014 character is not a 2024 character ───────────────

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"10010000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok($$ select public.activate_innate_sorcery('10010000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Innate Sorcery requires a 2024 Sorcerer',
  'a standalone 2014 Sorcerer cannot use a 2024 feature (the ruleset used to be NULL, and the guard fell through)');
select lives_ok($$ select public.take_spellcasting_rest('10010000-0000-4000-8000-0000000000e1', 'long') $$,
  'a standalone character can take a long rest');

reset role;

-- ── One reader ───────────────────────────────────────────────────────────────
-- Body-based on purpose: an outcome test covers only the functions someone
-- remembered to route through the resolver, and what went wrong here was
-- fifteen that each resolved it themselves.

select is_empty($q$
  select n.nspname || '.' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
    and p.prosrc ~* 'coalesce\(\s*\w+\.ruleset\s*,'
$q$, 'no function defaults a campaign''s ruleset inline');

select is_empty($q$
  select n.nspname || '.' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
    and p.prosrc ~* '\mcampaigns\M' and p.prosrc ~* '\.ruleset' and p.prosrc ~* 'party_member'
    and p.oid <> 'private.party_member_ruleset(uuid)'::regprocedure
$q$, 'private.party_member_ruleset() is the only function that reaches a character''s ruleset through its campaign');

select * from finish();
rollback;
