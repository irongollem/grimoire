-- #1103: craft_experiment, the experiment bench's reveal.
--
--   1 Dana (DM)   2 Pat (plays e2)   3 Quinn (plays e3, same table)   4 Sam (stranger)
-- Refusals are paired with Pat succeeding in the same fixture, so a pass proves the guard
-- rather than a broken setup. Then the matching rules: exact set, near misses both ways,
-- hints switched off, undiscoverable recipes, a recipe already known, and one stack filling
-- two dishes.

begin;

create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('11030000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'craft-experiment-' || n || '@example.invalid', '',
       '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name) values
  ('11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', 'Dana''s table'),
  ('11030000-0000-4000-8000-0000000000c2', '11030000-0000-4000-8000-000000000001', 'Dana''s other table');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, is_dm_managed, ruleset) values
  ('11030000-0000-4000-8000-0000000000e2', '11030000-0000-4000-8000-000000000002',
   '11030000-0000-4000-8000-000000000002', '11030000-0000-4000-8000-0000000000c1', 'Pat''s smith', false, '2014'),
  ('11030000-0000-4000-8000-0000000000e3', '11030000-0000-4000-8000-000000000003',
   '11030000-0000-4000-8000-000000000003', '11030000-0000-4000-8000-0000000000c1', 'Quinn''s tinker', false, '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', 'dm', 'Dana', null),
  ('11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000002', 'player', 'Pat', '11030000-0000-4000-8000-0000000000e2'),
  ('11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000003', 'player', 'Quinn', '11030000-0000-4000-8000-0000000000e3')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.items (id, user_id, campaign_id, name, tags) values
  ('11030000-0000-4000-8000-0000000000b1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000c1', 'Iron Ingot', '{metal,iron,ingot}'),
  ('11030000-0000-4000-8000-0000000000b2', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000c1', 'Leather Strips', '{leather}'),
  ('11030000-0000-4000-8000-0000000000b3', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000c1', 'Frost Crystal', '{crystal}'),
  ('11030000-0000-4000-8000-0000000000b4', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000c1', 'Iron Shortsword', '{metal,iron,ingot}'),
  ('11030000-0000-4000-8000-0000000000b5', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000c1', 'Charcoal', '{charcoal}');

-- Pat holds iron (stash), leather, crystal, charcoal and an EQUIPPED sword; Quinn holds leather.
insert into public.party_inventory (id, campaign_id, user_id, item_id, name, quantity, carried_by, is_equipped) values
  ('11030000-0000-4000-8000-0000000000a1', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000b1', 'Iron Ingot', 4, null, false),
  ('11030000-0000-4000-8000-0000000000a2', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000b2', 'Leather Strips', 2, '11030000-0000-4000-8000-0000000000e2', false),
  ('11030000-0000-4000-8000-0000000000a3', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000b3', 'Frost Crystal', 1, '11030000-0000-4000-8000-0000000000e2', false),
  ('11030000-0000-4000-8000-0000000000a4', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000b4', 'Iron Shortsword', 1, '11030000-0000-4000-8000-0000000000e2', true),
  ('11030000-0000-4000-8000-0000000000a5', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000b2', 'Leather Strips', 1, '11030000-0000-4000-8000-0000000000e3', false),
  ('11030000-0000-4000-8000-0000000000a6', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000b5', 'Charcoal', 3, '11030000-0000-4000-8000-0000000000e2', false);
-- Rows the guard must refuse: Pat's RUINED leather, Pat's CONTAINER, the other table's stash,
-- and Pat's EMPTY charcoal stack.
insert into public.party_inventory (id, campaign_id, user_id, item_id, name, quantity, carried_by, quality, is_container) values
  ('11030000-0000-4000-8000-0000000000aa', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000b5', 'Charcoal', 0, '11030000-0000-4000-8000-0000000000e2', 'standard', false),
  ('11030000-0000-4000-8000-0000000000a7', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000b2', 'Leather Strips', 1, '11030000-0000-4000-8000-0000000000e2', 'ruined', false),
  ('11030000-0000-4000-8000-0000000000a8', '11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-000000000001', null, 'Backpack', 1, '11030000-0000-4000-8000-0000000000e2', 'standard', true),
  ('11030000-0000-4000-8000-0000000000a9', '11030000-0000-4000-8000-0000000000c2', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000b3', 'Frost Crystal', 1, null, 'standard', false);

-- d1: discoverable smithing, Any [metal+iron+ingot] + Any "leather" + Frost Crystal.
-- d2: smithing, leather only, NOT discoverable.  d3: discoverable alchemy, Frost Crystal only.
-- d4: discoverable smithing, Iron Ingot + Any [metal]: one stack of ingots fills both.
insert into public.crafting_recipes (id, user_id, campaign_id, name, discipline, discoverable) values
  ('11030000-0000-4000-8000-0000000000d1', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000c1', 'Frostbrand Dagger', 'smithing', true),
  ('11030000-0000-4000-8000-0000000000d2', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000c1', 'Leather Strap', 'smithing', false),
  ('11030000-0000-4000-8000-0000000000d3', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000c1', 'Frost Tincture', 'alchemy', true),
  ('11030000-0000-4000-8000-0000000000d4', '11030000-0000-4000-8000-000000000001', '11030000-0000-4000-8000-0000000000c1', 'Iron Rivets', 'smithing', true);
insert into public.crafting_recipe_ingredients (recipe_id, item_id, tags, quantity, position) values
  ('11030000-0000-4000-8000-0000000000d1', null, '{metal,iron,ingot}', 2, 0),
  ('11030000-0000-4000-8000-0000000000d1', null, '{leather}', 1, 1),
  ('11030000-0000-4000-8000-0000000000d1', '11030000-0000-4000-8000-0000000000b3', null, 1, 2),
  ('11030000-0000-4000-8000-0000000000d2', null, '{leather}', 1, 0),
  ('11030000-0000-4000-8000-0000000000d3', '11030000-0000-4000-8000-0000000000b3', null, 1, 0),
  ('11030000-0000-4000-8000-0000000000d4', '11030000-0000-4000-8000-0000000000b1', null, 1, 0),
  ('11030000-0000-4000-8000-0000000000d4', null, '{metal}', 1, 1);

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"11030000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

create function pg_temp.experiment(p_rows text[], p_discipline text default 'smithing') returns jsonb language sql as $$
  select public.craft_experiment('11030000-0000-4000-8000-0000000000e2', p_discipline,
    array(select ('11030000-0000-4000-8000-0000000000' || r)::uuid from unnest(p_rows) as r));
$$;

set local role authenticated;

-- ── Refusals ──────────────────────────────────────────────────────────────
select pg_temp.as_user(4);
select throws_ok(
  $$ select public.craft_experiment('11030000-0000-4000-8000-0000000000e2', 'smithing', array['11030000-0000-4000-8000-0000000000a1'::uuid]) $$,
  '42501', 'Not authorized', 'a stranger cannot experiment as Pat''s character');

select pg_temp.as_user(3);
select throws_ok(
  $$ select public.craft_experiment('11030000-0000-4000-8000-0000000000e2', 'smithing', array['11030000-0000-4000-8000-0000000000a1'::uuid]) $$,
  '42501', 'Not authorized', 'another player at the same table cannot experiment as Pat''s character');

select pg_temp.as_user(2);
select throws_ok(
  $$ select pg_temp.experiment(array['a1','a2','a5']) $$,
  'CX001', 'Those items cannot be laid out', 'Pat cannot lay out a row Quinn carries');
select throws_ok(
  $$ select pg_temp.experiment(array['a4','a2','a3']) $$,
  'CX001', 'Those items cannot be laid out', 'an equipped item is never laid out');
select throws_ok(
  $$ select pg_temp.experiment(array['a1','a7']) $$,
  'CX001', 'Those items cannot be laid out', 'a ruined item is never laid out');
select throws_ok(
  $$ select pg_temp.experiment(array['a1','a8']) $$,
  'CX001', 'Those items cannot be laid out', 'a container is never laid out');
select throws_ok(
  $$ select pg_temp.experiment(array['a9'], 'alchemy') $$,
  'CX001', 'Those items cannot be laid out', 'another table''s stash is never laid out');
select throws_ok(
  $$ select pg_temp.experiment(array['a1','aa']) $$,
  'CX001', 'Those items cannot be laid out', 'an empty stack is never laid out');
select throws_ok(
  $$ select pg_temp.experiment(array['a3','a3'], 'alchemy') $$,
  'CX001', 'Those items cannot be laid out', 'a stack fills no more dishes than it holds units');
select throws_ok(
  $$ select public.craft_experiment('11030000-0000-4000-8000-0000000000e2', 'alchemy', array[null]::uuid[]) $$,
  '22023', 'Lay out between one and eight items', 'a NULL element cannot reach the matching with nothing laid out');

select pg_temp.as_user(1);
select throws_ok(
  $$ select public.craft_experiment('11030000-0000-4000-8000-0000000000e2', 'smithing', array['11030000-0000-4000-8000-0000000000a1'::uuid]) $$,
  '42501', 'Not authorized', 'the DM, seated on no character, cannot experiment as Pat''s character');

-- Pat hands the character to Quinn (#1059), who takes it up: seated on it, but a caretaker,
-- not the owner.
select pg_temp.as_user(2);
insert into public.character_caretakers (campaign_id, party_member_id, caretaker_user_id)
values ('11030000-0000-4000-8000-0000000000c1', '11030000-0000-4000-8000-0000000000e2', '11030000-0000-4000-8000-000000000003');
select pg_temp.as_user(3);
update public.campaign_members set party_member_id = '11030000-0000-4000-8000-0000000000e2'
 where campaign_id = '11030000-0000-4000-8000-0000000000c1' and user_id = '11030000-0000-4000-8000-000000000003';
-- The seat really moved, so the refusal below is the caretaker check and not "not seated".
select is((select party_member_id from public.campaign_members
            where campaign_id = '11030000-0000-4000-8000-0000000000c1' and user_id = '11030000-0000-4000-8000-000000000003'),
  '11030000-0000-4000-8000-0000000000e2'::uuid, 'Quinn has taken Pat''s character up');
select throws_ok(
  $$ select pg_temp.experiment(array['a3'], 'alchemy') $$,
  '42501', 'Not authorized', 'a caretaker minding Pat''s character cannot reveal recipes on it');
select pg_temp.as_user(2);

-- ── Matching ──────────────────────────────────────────────────────────────
select is(pg_temp.experiment(array['a1','a2']), '{"result":"near","hint":"missing"}'::jsonb,
  'one ingredient short of a discoverable recipe is a near miss: missing');
select is(pg_temp.experiment(array['a1','a2','a3','a6']), '{"result":"near","hint":"extra"}'::jsonb,
  'one item too many is a near miss: extra');
select is(pg_temp.experiment(array['a2']), '{"result":"none"}'::jsonb,
  'a recipe that is not discoverable is never found, even by its exact set');
select is(pg_temp.experiment(array['a3'], 'herbalism'), '{"result":"none"}'::jsonb,
  'the discipline matters: the alchemy recipe is not found at a herbalist''s bench');

-- Hints off: the DM switches them off for the campaign.
reset role;
insert into public.campaign_rules (campaign_id, rule_key, enabled)
values ('11030000-0000-4000-8000-0000000000c1', 'crafting_near_miss_hints', false);
set local role authenticated;
select pg_temp.as_user(2);
select is(pg_temp.experiment(array['a1','a2']), '{"result":"none"}'::jsonb,
  'with hints switched off a near miss answers nothing');

-- The exact set reveals the recipe, and the reveal is real: RLS now lets Pat read it.
select is(pg_temp.experiment(array['a3','a1','a2']) ->> 'result', 'match',
  'the exact set, in any order, is a match');
select is((select name from public.crafting_recipes where id = '11030000-0000-4000-8000-0000000000d1'), 'Frostbrand Dagger',
  'the revealed recipe is now readable by Pat');
select is(pg_temp.experiment(array['a1','a2','a3']), '{"result":"none"}'::jsonb,
  'a recipe already known is not found again');
select is(pg_temp.experiment(array['a3'], 'alchemy') ->> 'name', 'Frost Tincture',
  'a single-ingredient recipe of another discipline is found at its own bench');
select is(pg_temp.experiment(array['a1','a1']) ->> 'name', 'Iron Rivets',
  'one stack laid in two dishes fills two ingredients, as the craft would spend it');

select * from finish();
rollback;
