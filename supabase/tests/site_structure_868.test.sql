-- Epic #868 (Sites & Cartographer), the five schema migrations:
--   20260908215640 a region has a role (zones)
--   20260908215641 a way out has a kind and may join two spaces (door_kind,
--                  source_edge_key, dungeon_feature_id, the widened endpoint guard)
--   20260908215643 the publish remembers what it wrote (dungeon_maps.rev,
--                  locations.map_published_rev, location_placements.source_cell_key,
--                  the stale updated_at triggers)
--   20260908215644 a door has play state (location_state_events.door_id)
--   20260908215645 the player plan is composed, not masked
--                  (get_player_visible_site_state -> jsonb)

begin;

create extension if not exists pgtap with schema extensions;
select plan(47);

-- This file traces many locations, regions and doors across eight sections;
-- none of it is what free-tier quotas exist to police, and a fixture that size
-- can trip the real limit on whatever count the local stack already carries.
set local grimoire.bypass_quota = 'on';

-- ── Shared fixtures ─────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('86800000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue868-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('86800000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue868-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('86800000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue868-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('86800000-0000-4000-8000-000000000010', '86800000-0000-4000-8000-000000000001', 'Sites & Cartographer');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
values ('86800000-0000-4000-8000-000000000020', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000002', '86800000-0000-4000-8000-000000000010', 'Talia');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('86800000-0000-4000-8000-000000000010', '86800000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('86800000-0000-4000-8000-000000000010', '86800000-0000-4000-8000-000000000002', 'player', 'Player', '86800000-0000-4000-8000-000000000020')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Regions: a zone is a role, not a second table (20260908215640)
-- ══════════════════════════════════════════════════════════════════════════

insert into public.locations (id, user_id, campaign_id, name, location_type)
values ('86800000-0000-4000-8000-000000000100', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', 'Region Test Hall', 'dungeon');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type)
values ('86800000-0000-4000-8000-000000000101', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', '86800000-0000-4000-8000-000000000100', 'Bound Room', 'room');

select lives_ok(
  $$insert into public.location_map_regions (id, user_id, site_location_id, region_role, zone_kind, cells)
    values ('86800000-0000-4000-8000-000000000110', '86800000-0000-4000-8000-000000000001',
            '86800000-0000-4000-8000-000000000100', 'zone', 'terrain', '["3,3"]'::jsonb)$$,
  'a zone with a kind and no bound space traces fine'
);

select throws_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, space_location_id, region_role, zone_kind, cells)
    values ('86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000100',
            '86800000-0000-4000-8000-000000000101', 'zone', 'terrain', '["1,1"]'::jsonb)$$,
  '23514', null,
  'a zone binds to nothing -- setting space_location_id on a zone is rejected'
);

select throws_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, region_role, zone_kind, cells)
    values ('86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000100',
            'space', 'terrain', '["2,2"]'::jsonb)$$,
  '23514', null,
  'a space cannot claim a zone_kind -- the biconditional check rejects it'
);

select throws_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, region_role, cells)
    values ('86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000100',
            'zone', '["4,4"]'::jsonb)$$,
  '23514', null,
  'a zone with no zone_kind is rejected -- the same biconditional, the other way'
);

-- A bound space, then flipped to a zone -- the trigger must fire on region_role too.
insert into public.location_map_regions (id, user_id, site_location_id, space_location_id, cells)
values ('86800000-0000-4000-8000-000000000120', '86800000-0000-4000-8000-000000000001',
        '86800000-0000-4000-8000-000000000100', '86800000-0000-4000-8000-000000000101', '["5,5"]'::jsonb);

select throws_ok(
  $$update public.location_map_regions set region_role = 'zone'
     where id = '86800000-0000-4000-8000-000000000120'$$,
  '23514', null,
  'a bound space region cannot be flipped to a zone while still bound -- the guard fires on region_role'
);

select throws_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, vertices, cells)
    values ('86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000100',
            '{"x":1,"y":1}'::jsonb, '[]'::jsonb)$$,
  '23514', null,
  'vertices must be a jsonb array -- a jsonb object is rejected'
);

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Doors: a kind, an edge key, and a citable feature (20260908215641)
-- ══════════════════════════════════════════════════════════════════════════

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('86800000-0000-4000-8000-000000000200', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', 'Door Test Dungeon', 'dungeon'),
  ('86800000-0000-4000-8000-000000000210', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', 'Other Dungeon', 'dungeon');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('86800000-0000-4000-8000-000000000201', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', '86800000-0000-4000-8000-000000000200', 'Room A', 'room'),
  ('86800000-0000-4000-8000-000000000202', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', '86800000-0000-4000-8000-000000000200', 'Room B', 'room'),
  ('86800000-0000-4000-8000-000000000203', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', '86800000-0000-4000-8000-000000000200', 'Sunken Courtyard', 'grounds'),
  ('86800000-0000-4000-8000-000000000204', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', '86800000-0000-4000-8000-000000000210', 'Far Courtyard', 'grounds');

insert into public.dungeon_features (id, user_id, name, feature_type) values
  ('86800000-0000-4000-8000-000000000230', '86800000-0000-4000-8000-000000000001', 'Grated Vent', 'Secret Door'),
  ('86800000-0000-4000-8000-000000000231', '86800000-0000-4000-8000-000000000003', 'Foreign Grate', 'Secret Door');

-- door_kind default and validation
insert into public.location_doors (id, user_id, from_location_id, to_location_id, label)
values ('86800000-0000-4000-8000-000000000240', '86800000-0000-4000-8000-000000000001',
        '86800000-0000-4000-8000-000000000201', '86800000-0000-4000-8000-000000000202', 'default kind check');

select is(
  (select door_kind from public.location_doors where id = '86800000-0000-4000-8000-000000000240'),
  'door',
  'door_kind defaults to a plain door'
);

select throws_ok(
  $$insert into public.location_doors (user_id, from_location_id, to_location_id, label, door_kind)
    values ('86800000-0000-4000-8000-000000000001',
            '86800000-0000-4000-8000-000000000201', '86800000-0000-4000-8000-000000000202', 'bad kind', 'teleporter')$$,
  '23514', null,
  'an invalid door_kind is rejected'
);

-- source_edge_key format
select lives_ok(
  $$insert into public.location_doors (user_id, from_location_id, to_location_id, label, source_edge_key)
    values ('86800000-0000-4000-8000-000000000001',
            '86800000-0000-4000-8000-000000000201', '86800000-0000-4000-8000-000000000202', 'edge ok', '3,4:N')$$,
  'a well-formed edge key ("3,4:N") is accepted'
);

select throws_ok(
  $$insert into public.location_doors (user_id, from_location_id, to_location_id, label, source_edge_key)
    values ('86800000-0000-4000-8000-000000000001',
            '86800000-0000-4000-8000-000000000201', '86800000-0000-4000-8000-000000000202', 'edge bad', '3,4:E')$$,
  '23514', null,
  'an edge key naming a non-NW side ("3,4:E") is rejected'
);

-- one derived door per edge, per originating space
insert into public.location_doors (id, user_id, from_location_id, to_location_id, label, source_edge_key)
values ('86800000-0000-4000-8000-000000000242', '86800000-0000-4000-8000-000000000001',
        '86800000-0000-4000-8000-000000000201', '86800000-0000-4000-8000-000000000202', 'dup edge 1', '9,9:N');

select throws_ok(
  $$insert into public.location_doors (user_id, from_location_id, to_location_id, label, source_edge_key)
    values ('86800000-0000-4000-8000-000000000001',
            '86800000-0000-4000-8000-000000000201', '86800000-0000-4000-8000-000000000203', 'dup edge 2', '9,9:N')$$,
  '23505', null,
  'two doors from the same room with the same edge key collide, whatever they lead to'
);

-- the widened guard: a room may now connect to a nested site with its own floor plan
select lives_ok(
  $$insert into public.location_doors (id, user_id, from_location_id, to_location_id, label)
    values ('86800000-0000-4000-8000-000000000243', '86800000-0000-4000-8000-000000000001',
            '86800000-0000-4000-8000-000000000201', '86800000-0000-4000-8000-000000000203', 'stair to the courtyard')$$,
  'a door from a room to a nested grounds site under the same dungeon is now accepted'
);

-- ...but two bindable spaces under different parents are still rejected
select throws_ok(
  $$insert into public.location_doors (user_id, from_location_id, to_location_id, label)
    values ('86800000-0000-4000-8000-000000000001',
            '86800000-0000-4000-8000-000000000203', '86800000-0000-4000-8000-000000000204', 'cross-dungeon')$$,
  '23514', null,
  'a door between two sites with different parents is still rejected'
);

-- a door may only cite a dungeon feature the caller authored
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"86800000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.location_doors (user_id, from_location_id, to_location_id, label, dungeon_feature_id)
    values ('86800000-0000-4000-8000-000000000001',
            '86800000-0000-4000-8000-000000000201', '86800000-0000-4000-8000-000000000202',
            'feature not mine', '86800000-0000-4000-8000-000000000231')$$,
  '23514', null,
  'a door may not cite a dungeon feature the caller does not own'
);

select lives_ok(
  $$insert into public.location_doors (user_id, from_location_id, to_location_id, label, dungeon_feature_id)
    values ('86800000-0000-4000-8000-000000000001',
            '86800000-0000-4000-8000-000000000201', '86800000-0000-4000-8000-000000000202',
            'feature mine', '86800000-0000-4000-8000-000000000230')$$,
  'a door may cite a dungeon feature the caller does own'
);

reset role;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Placements: source_cell_key format (20260908215643)
-- ══════════════════════════════════════════════════════════════════════════

insert into public.dungeon_features (id, user_id, name, feature_type) values
  ('86800000-0000-4000-8000-000000000250', '86800000-0000-4000-8000-000000000001', 'Placement Feature A', 'Treasure Chest'),
  ('86800000-0000-4000-8000-000000000251', '86800000-0000-4000-8000-000000000001', 'Placement Feature B', 'Treasure Chest');

select lives_ok(
  $$insert into public.location_placements (user_id, location_id, dungeon_feature_id, source_cell_key)
    values ('86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000201',
            '86800000-0000-4000-8000-000000000250', '7,2')$$,
  'a plain cell key ("7,2") is accepted'
);

select throws_ok(
  $$insert into public.location_placements (user_id, location_id, dungeon_feature_id, source_cell_key)
    values ('86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000202',
            '86800000-0000-4000-8000-000000000251', '7,2:N')$$,
  '23514', null,
  'a placement cell key naming an edge ("7,2:N") is rejected -- placements sit in cells, not on edges'
);

-- ══════════════════════════════════════════════════════════════════════════
-- 4. dungeon_maps.rev: bumped by the drawing, not by metadata renames (20260908215643)
-- ══════════════════════════════════════════════════════════════════════════

insert into public.dungeon_maps (id, user_id, name)
values ('86800000-0000-4000-8000-000000000260', '86800000-0000-4000-8000-000000000001', 'Test Map');

select is(
  (select rev from public.dungeon_maps where id = '86800000-0000-4000-8000-000000000260'),
  1,
  'a fresh map starts at revision 1'
);

update public.dungeon_maps
   set layers = '{"floor": {"0,0": "stone"}, "object": {}, "annotation": {}, "solidBlock": {}}'::jsonb
 where id = '86800000-0000-4000-8000-000000000260';

select is(
  (select rev from public.dungeon_maps where id = '86800000-0000-4000-8000-000000000260'),
  2,
  'changing the drawing''s layers bumps the revision'
);

update public.dungeon_maps set name = 'Renamed Map' where id = '86800000-0000-4000-8000-000000000260';

select is(
  (select rev from public.dungeon_maps where id = '86800000-0000-4000-8000-000000000260'),
  2,
  'renaming the map leaves the revision alone'
);

update public.dungeon_maps set metadata = '{"note": "updated"}'::jsonb where id = '86800000-0000-4000-8000-000000000260';

select is(
  (select rev from public.dungeon_maps where id = '86800000-0000-4000-8000-000000000260'),
  3,
  'changing metadata also bumps the revision'
);

-- ══════════════════════════════════════════════════════════════════════════
-- 5. locations.map_published_rev exists and is nullable (20260908215643)
-- ══════════════════════════════════════════════════════════════════════════

select has_column('locations', 'map_published_rev',
  'locations gained a map_published_rev column for the Cartographer publish');
select col_type_is('locations', 'map_published_rev', 'integer',
  'map_published_rev is an integer revision counter');
select col_is_null('locations', 'map_published_rev',
  'map_published_rev is nullable -- null means never published from the Cartographer');

-- ══════════════════════════════════════════════════════════════════════════
-- 6. A door has play state (20260908215644)
-- ══════════════════════════════════════════════════════════════════════════

insert into public.locations (id, user_id, campaign_id, name, location_type)
values ('86800000-0000-4000-8000-000000000300', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', 'Play State Site', 'dungeon');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('86800000-0000-4000-8000-000000000301', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', '86800000-0000-4000-8000-000000000300', 'Room X', 'room'),
  ('86800000-0000-4000-8000-000000000302', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', '86800000-0000-4000-8000-000000000300', 'Room Y', 'room');
insert into public.location_doors (id, user_id, from_location_id, to_location_id, label)
values ('86800000-0000-4000-8000-000000000310', '86800000-0000-4000-8000-000000000001',
        '86800000-0000-4000-8000-000000000301', '86800000-0000-4000-8000-000000000302', 'Brass Door');

select lives_ok(
  $$insert into public.location_state_events (user_id, location_id, door_id, fact, value)
    values ('86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000300',
            '86800000-0000-4000-8000-000000000310', 'unlocked', true)$$,
  'unlocked, logged against the door''s site, is accepted'
);

select throws_ok(
  $$insert into public.location_state_events (user_id, location_id, door_id, fact, value)
    values ('86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000300',
            '86800000-0000-4000-8000-000000000310', 'explored', true)$$,
  '23514', null,
  'a door fact is not a location fact -- explored is rejected for a door'
);

select throws_ok(
  $$insert into public.location_state_events (user_id, location_id, door_id, fact, value)
    values ('86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000301',
            '86800000-0000-4000-8000-000000000310', 'unlocked', true)$$,
  '23514', null,
  'a door fact logged against the room instead of the site is rejected'
);

select results_eq(
  $$select door_id, value from public.location_state
     where door_id = '86800000-0000-4000-8000-000000000310' and fact = 'unlocked'$$,
  $$values ('86800000-0000-4000-8000-000000000310'::uuid, true)$$,
  'the view surfaces door_id alongside value for a door fact'
);

insert into public.location_state_events (user_id, location_id, door_id, fact, value)
values ('86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000300',
        '86800000-0000-4000-8000-000000000310', 'unlocked', false);

select is(
  (select value from public.location_state
    where door_id = '86800000-0000-4000-8000-000000000310' and fact = 'unlocked'),
  false,
  'appending a new assertion for the same door fact makes the newest one win'
);

select is(
  (select 'security_invoker=true' = any(c.reloptions) from pg_class c where c.oid = 'public.location_state'::regclass),
  true,
  'location_state stays security_invoker after being widened for doors'
);

-- ══════════════════════════════════════════════════════════════════════════
-- 7. updated_at triggers: the stale unconditional pair is gone (20260908215643)
-- ══════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::integer from pg_trigger
    where tgrelid = 'public.locations'::regclass and not tgisinternal and tgname ilike '%updated_at%'),
  1,
  'locations carries exactly one updated_at trigger -- the stale unconditional one is gone'
);

select is(
  (select count(*)::integer from pg_trigger
    where tgrelid = 'public.quests'::regclass and not tgisinternal and tgname ilike '%updated_at%'),
  1,
  'quests carries exactly one updated_at trigger -- the stale unconditional one is gone'
);

-- ══════════════════════════════════════════════════════════════════════════
-- 8. The composed player plan: spaces, glimpsed, ways, zones (20260908215645)
-- ══════════════════════════════════════════════════════════════════════════

insert into public.locations (id, user_id, campaign_id, name, location_type, is_map_shared, player_visible_to)
values ('86800000-0000-4000-8000-000000000400', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010',
        'Composed Plan Site', 'dungeon', true, array['86800000-0000-4000-8000-000000000020']::uuid[]);
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('86800000-0000-4000-8000-000000000401', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', '86800000-0000-4000-8000-000000000400', 'Room A2', 'room'),
  ('86800000-0000-4000-8000-000000000402', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', '86800000-0000-4000-8000-000000000400', 'Room B2', 'room'),
  ('86800000-0000-4000-8000-000000000403', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000010', '86800000-0000-4000-8000-000000000400', 'Room C2', 'room');

insert into public.location_map_regions (id, user_id, site_location_id, space_location_id, cells) values
  ('86800000-0000-4000-8000-000000000410', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000400', '86800000-0000-4000-8000-000000000401', '["0,0","0,1"]'::jsonb),
  ('86800000-0000-4000-8000-000000000411', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000400', '86800000-0000-4000-8000-000000000402', '["1,0","1,1"]'::jsonb),
  ('86800000-0000-4000-8000-000000000412', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000400', '86800000-0000-4000-8000-000000000403', '["2,0","2,1"]'::jsonb);

-- A player-visible zone straddling A2 and C2, and a DM-only zone -- both over the same corner as A2.
insert into public.location_map_regions (id, user_id, site_location_id, region_role, zone_kind, zone_payload, cells) values
  ('86800000-0000-4000-8000-000000000413', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000400',
   'zone', 'light', '{"visible_to_players": true}'::jsonb, '["0,0","2,0"]'::jsonb),
  ('86800000-0000-4000-8000-000000000414', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000400',
   'zone', 'hazard', '{}'::jsonb, '["0,0"]'::jsonb);

insert into public.location_doors (id, user_id, from_location_id, to_location_id, label, is_secret) values
  ('86800000-0000-4000-8000-000000000420', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000401', '86800000-0000-4000-8000-000000000402', 'Plain Archway', false),
  ('86800000-0000-4000-8000-000000000421', '86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000402', '86800000-0000-4000-8000-000000000403', 'Hidden Passage', true);

insert into public.location_state_events (user_id, location_id, fact, value)
values ('86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000401', 'explored', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"86800000-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- ── Only A2 explored ─────────────────────────────────────────────────────

select is(
  jsonb_array_length((public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'spaces'),
  1,
  'spaces has exactly the one explored room'
);

-- A beat may be staged at a ROOM ("Opens at", #868 S12); the player's quest
-- page hands the projection the room id. The site resolves inside the RPC.
select is(
  (public.get_player_visible_site_state('86800000-0000-4000-8000-000000000401')),
  (public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400')),
  'asking for a room returns its site''s plan -- the caller need not know the parent'
);

select is(
  jsonb_array_length((public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'glimpsed'),
  1,
  'glimpsed carries the footprint of the adjoining unexplored room'
);

select is(
  (select array_agg(k order by k) from jsonb_object_keys(
     ((public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'glimpsed'->0)) k),
  array['cells'],
  'a glimpsed footprint carries only cells -- no id, no name'
);

select is(
  jsonb_array_length((public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'ways'),
  1,
  'one way out is known -- the plain door out of the explored room'
);

select is(
  ((public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'ways'->0->>'from_space_id')::uuid,
  '86800000-0000-4000-8000-000000000401'::uuid,
  'the known way''s from_space_id is the explored room'
);

select ok(
  ((public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'ways'->0->>'to_space_id') is null,
  'the known way''s to_space_id is null while the far room is unexplored'
);

select ok(
  not (((public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'ways'->0)
       ?| array['starts_locked', 'lock_note', 'is_one_way']),
  'a way out never carries starts_locked, lock_note or is_one_way'
);

select is(
  jsonb_array_length((public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'zones'),
  1,
  'only the player-visible zone appears -- the DM-only one is absent'
);

select is(
  (public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'zones'->0->'cells',
  '["0,0"]'::jsonb,
  'the visible zone is clipped to its overlap with the explored room'
);

-- ── B2 also explored ─────────────────────────────────────────────────────

reset role;
insert into public.location_state_events (user_id, location_id, fact, value)
values ('86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000402', 'explored', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"86800000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  jsonb_array_length((public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'spaces'),
  2,
  'spaces grows to two once the second room is explored'
);

select is(
  jsonb_array_length((public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'glimpsed'),
  0,
  'C2 sits behind a secret, unfound door -- it is not glimpsed'
);

select is(
  jsonb_array_length((public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'ways'),
  1,
  'still only the one known way -- the secret door has not been found'
);

-- ── The secret door is found ─────────────────────────────────────────────

reset role;
insert into public.location_state_events (user_id, location_id, door_id, fact, value)
values ('86800000-0000-4000-8000-000000000001', '86800000-0000-4000-8000-000000000400',
        '86800000-0000-4000-8000-000000000421', 'found', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"86800000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  jsonb_array_length((public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'ways'),
  2,
  'the found secret door joins the known ways'
);

select is(
  jsonb_array_length((public.get_player_visible_site_state('86800000-0000-4000-8000-000000000400'))->'glimpsed'),
  1,
  'C2 is now glimpsed through the found door'
);

reset role;
select * from finish();
rollback;
