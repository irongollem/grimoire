-- exchange_wild_shape (epic #959): Wild Shape's spell-slot trades.
--
--   1 Dana  DM of c1            2 Pat  plays m1 (owner, linked)
--   3 Sam   DM of c2 (a stranger to c1)
--   4 Oz    a player at c1, not linked to m1
-- m1 is a level 5 druid in a beast form with its own hit points (8 of 11),
-- two Wild Shape uses spent, two of four level 1 slots spent.
-- m2 is Pat's rogue, who has no Wild Shape at all.
-- m3 is Pat's druid from before class rows existed (class 'Druid', no
-- character_classes row), in a form without its own hit point pool. Epic
-- #943's one-class model (PR #948) makes `class` a mirror of the class rows,
-- after which such a druid cannot exist: that rebase drops Moss's druid case
-- here together with the fallback in exchange_wild_shape and `druidProfile`.

begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('95900000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'wild-shape-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name, ruleset) values
  ('95900000-0000-4000-8000-0000000000c1', '95900000-0000-4000-8000-000000000001', 'Dana''s table', '2014'),
  ('95900000-0000-4000-8000-0000000000c2', '95900000-0000-4000-8000-000000000003', 'Sam''s table', '2014');

insert into public.party_members (
  id, user_id, owner_user_id, campaign_id, name, class, level, wis, proficiency_bonus,
  spell_slots, wildshapes_used, wildshape_state, class_choices
) values
  ('95900000-0000-4000-8000-0000000000e1', '95900000-0000-4000-8000-000000000002',
   '95900000-0000-4000-8000-000000000002', '95900000-0000-4000-8000-0000000000c1',
   'Briar', 'Druid', 5, 16, 3,
   '[{"level":1,"max":4,"used":2,"pool":"spellcasting","recovery":"long"},
     {"level":2,"max":3,"used":0,"pool":"spellcasting","recovery":"long"}]'::jsonb,
   2,
   '{"monster_id":"srd_wolf","beast_name":"Wolf","beast_image_url":null,"beast_hp":8,"beast_max_hp":11,"beast_ac":"13"}'::jsonb,
   '{}'::jsonb),
  ('95900000-0000-4000-8000-0000000000e2', '95900000-0000-4000-8000-000000000002',
   '95900000-0000-4000-8000-000000000002', '95900000-0000-4000-8000-0000000000c1',
   'Wren', 'Rogue', 5, 10, 3, '[]'::jsonb, 0, null, '{}'::jsonb),
  ('95900000-0000-4000-8000-0000000000e3', '95900000-0000-4000-8000-000000000002',
   '95900000-0000-4000-8000-000000000002', '95900000-0000-4000-8000-0000000000c1',
   'Moss', 'Druid', 3, 14, 2,
   '[{"level":1,"max":4,"used":0,"pool":"spellcasting","recovery":"long"}]'::jsonb,
   1,
   '{"monster_id":"srd_wolf","beast_name":"Wolf","beast_image_url":null,"beast_ac":"13"}'::jsonb,
   '{}'::jsonb);

insert into public.character_classes
  (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
values
  ('95900000-0000-4000-8000-0000000000f1', '95900000-0000-4000-8000-0000000000e1', 'Druid', 5, true,
   (select id from public.system_classes where ruleset = '2014' and class_name = 'Druid'), 'system'),
  ('95900000-0000-4000-8000-0000000000f2', '95900000-0000-4000-8000-0000000000e2', 'Rogue', 5, true,
   (select id from public.system_classes where ruleset = '2014' and class_name = 'Rogue'), 'system');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('95900000-0000-4000-8000-0000000000c1', '95900000-0000-4000-8000-000000000001', 'dm', 'Dana', null),
  ('95900000-0000-4000-8000-0000000000c2', '95900000-0000-4000-8000-000000000003', 'dm', 'Sam', null),
  ('95900000-0000-4000-8000-0000000000c1', '95900000-0000-4000-8000-000000000002', 'player', 'Pat',
   '95900000-0000-4000-8000-0000000000e1'),
  ('95900000-0000-4000-8000-0000000000c1', '95900000-0000-4000-8000-000000000004', 'player', 'Oz', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"95900000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

-- Definer, so a check reads the row whoever is signed in.
create function pg_temp.briar() returns public.party_members language sql security definer as $$
  select * from public.party_members where id = '95900000-0000-4000-8000-0000000000e1';
$$;
create function pg_temp.slot_used(p_level int) returns int language sql security definer as $$
  select (s ->> 'used')::int
  from public.party_members pm, jsonb_array_elements(pm.spell_slots) s
  where pm.id = '95900000-0000-4000-8000-0000000000e1' and (s ->> 'level')::int = p_level;
$$;
create function pg_temp.moss() returns public.party_members language sql security definer as $$
  select * from public.party_members where id = '95900000-0000-4000-8000-0000000000e3';
$$;

set local role authenticated;

-- ── Refusals ──────────────────────────────────────────────────────────────────

select pg_temp.as_user(3);
select throws_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e1', 'slot_for_healing', 1, 'spellcasting', null, 4) $$,
  'P0001', 'Access denied', 'a stranger cannot heal another table''s druid with its slots');
select throws_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e1', 'slot_for_use', 1) $$,
  'P0001', 'Access denied', 'a stranger cannot trade another table''s druid''s slot for a use');
select throws_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e1', 'use_for_slot', 1) $$,
  'P0001', 'Access denied', 'a stranger cannot trade another table''s druid''s use for a slot');

select pg_temp.as_user(4);
select throws_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e1', 'slot_for_use', 1) $$,
  'P0001', 'Access denied', 'another player at the table cannot spend this druid''s slots');

select is((pg_temp.briar()).wildshapes_used, 2, 'the refused calls changed nothing');

-- ── The owner ─────────────────────────────────────────────────────────────────

select pg_temp.as_user(2);

-- A NULL argument must be refused, not read as "none of the above": a bare
-- `not in` is NULL for NULL and would let the call fall into a branch.
select throws_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e1', null, 1) $$,
  'P0001', 'Invalid Wild Shape exchange', 'an unnamed action is refused');
select throws_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e1', 'slot_for_healing', null, 'spellcasting', null, 4) $$,
  'P0001', 'Choose a spell slot to spend', 'healing without a slot level is refused');
select is((pg_temp.briar()).wildshapes_used, 2, 'the refused arguments changed nothing');

select throws_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e1', 'slot_for_healing', 1, 'spellcasting', null, 9) $$,
  'P0001', 'Healing must be what 1d8 per slot level can roll', 'a level 1 slot cannot heal 9');
select throws_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e2', 'slot_for_use', 1) $$,
  'P0001', 'Wild Shape requires a Druid', 'a character without Wild Shape cannot trade for it');

-- Combat Wild Shape: 8 + 6, capped at the beast's 11, for one level 1 slot.
select lives_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e1', 'slot_for_healing', 1, 'spellcasting', null, 6) $$,
  'the owner heals the beast with a slot');
select is(((pg_temp.briar()).wildshape_state ->> 'beast_hp')::int, 11, 'healing tops the beast up to its maximum');
select is(pg_temp.slot_used(1), 3, 'healing spent a level 1 slot');

-- Wild Resurgence, slot for a use.
select lives_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e1', 'slot_for_use', 2) $$,
  'the owner trades a slot for a use');
select is((pg_temp.briar()).wildshapes_used, 1, 'one Wild Shape use came back');
select is(pg_temp.slot_used(2), 1, 'it cost a level 2 slot');

-- Wild Resurgence, a use for a level 1 slot, once per long rest.
select lives_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e1', 'use_for_slot', 1) $$,
  'the owner trades a use for a level 1 slot');
select is(pg_temp.slot_used(1), 2, 'an expended level 1 slot came back');
select is((pg_temp.briar()).wildshapes_used, 2, 'it cost a use');
select throws_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e1', 'use_for_slot', 1) $$,
  'P0001', 'Already regained a slot from Wild Shape this long rest', 'only once per long rest');

-- A form with no hit point pool of its own: the guard must refuse while the
-- keys are absent, not read NULL as "fine", spend the slot and null the form.
select throws_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e3', 'slot_for_healing', 1, 'spellcasting', null, 5) $$,
  'P0001', 'Not in a beast form with its own hit points', 'a form without beast_hp cannot be healed with a slot');
select is((pg_temp.moss()).wildshape_state ->> 'beast_name', 'Wolf', 'the refused healing left the form in place');
select is(((pg_temp.moss()).spell_slots -> 0 ->> 'used')::int, 0, 'the refused healing spent no slot');

-- A druid known only by the row's own class is a druid, as the sheet says.
select lives_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e3', 'slot_for_use', 1) $$,
  'a druid without class rows can trade a slot for a use');

-- ── The DM ────────────────────────────────────────────────────────────────────

select pg_temp.as_user(1);
select lives_ok($$ select public.exchange_wild_shape('95900000-0000-4000-8000-0000000000e1', 'slot_for_use', 1) $$,
  'the DM may make the trade for a druid at their table');

-- ── A long rest clears the once-per-rest flags ────────────────────────────────

select pg_temp.as_user(2);
select lives_ok($$ select public.take_spellcasting_rest('95900000-0000-4000-8000-0000000000e1', 'long') $$,
  'the owner takes a long rest');
select is(((pg_temp.briar()).class_choices ->> 'wild_resurgence_slot_taken')::boolean, false,
  'the long rest makes the slot trade available again');

select * from finish();
rollback;
