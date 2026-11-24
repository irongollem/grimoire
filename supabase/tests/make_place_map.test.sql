-- #1021 row 17: the AI table makes a map for a place that has none (`make_place_map`, security invoker; 20261124113255).
--   1 Dana  owner and DM   2 Pia  player at the table
-- The DM's call writes the drawing, the place's picture and snapshot, a room per part of the plan (reusing a room the
-- place already has by name), each room's region and the doors, in one transaction. A retry with the same request key
-- makes nothing new. A place that already has a map is refused, and so is a player: neither leaves a drawing behind.
-- A place that cannot hold rooms (a city) gets the map and no rooms.

begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('11241700-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'make-map-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;

insert into public.campaigns (id, user_id, name, game_system) values
  ('11241700-0000-4000-8000-0000000000c1', '11241700-0000-4000-8000-000000000001', 'Mapped table', 'dnd5e-2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('11241700-0000-4000-8000-0000000000c1', '11241700-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('11241700-0000-4000-8000-0000000000c1', '11241700-0000-4000-8000-000000000002', 'player', 'Pia')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- d1 a dungeon with no map and one room already named; d2 a dungeon with a picture; t1 a city, which holds no rooms.
insert into public.locations (id, user_id, campaign_id, name, location_type, map_url) values
  ('11241700-0000-4000-8000-0000000000d1', '11241700-0000-4000-8000-000000000001', '11241700-0000-4000-8000-0000000000c1', 'The crypt', 'dungeon', null),
  ('11241700-0000-4000-8000-0000000000d2', '11241700-0000-4000-8000-000000000001', '11241700-0000-4000-8000-0000000000c1', 'The mapped keep', 'dungeon', 'https://example.invalid/keep.webp'),
  ('11241700-0000-4000-8000-0000000000e1', '11241700-0000-4000-8000-000000000001', '11241700-0000-4000-8000-0000000000c1', 'Sugarport', 'city', null),
  ('11241700-0000-4000-8000-0000000000d3', '11241700-0000-4000-8000-000000000001', '11241700-0000-4000-8000-0000000000c1', 'The full vault', 'dungeon', null);
-- d4 a cellar under the mapped keep, which reads the keep's map; d5 a place with a blank grid of its own.
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('11241700-0000-4000-8000-0000000000d4', '11241700-0000-4000-8000-000000000001', '11241700-0000-4000-8000-0000000000c1',
   '11241700-0000-4000-8000-0000000000d2', 'The keep''s cellar', 'dungeon');
insert into public.locations (id, user_id, campaign_id, name, location_type, plan_size) values
  ('11241700-0000-4000-8000-0000000000d5', '11241700-0000-4000-8000-000000000001', '11241700-0000-4000-8000-0000000000c1',
   'The gridded yard', 'dungeon', '{"cols":4,"rows":4}'::jsonb);
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('11241700-0000-4000-8000-0000000000a1', '11241700-0000-4000-8000-000000000001', '11241700-0000-4000-8000-0000000000c1',
   '11241700-0000-4000-8000-0000000000d1', 'Ossuary', 'room');

-- The Ossuary keeps a region from a map the crypt no longer has.
insert into public.location_map_regions (user_id, site_location_id, space_location_id, cells, region_role, derived_from, cell_signature) values
  ('11241700-0000-4000-8000-000000000001', '11241700-0000-4000-8000-0000000000d1', '11241700-0000-4000-8000-0000000000a1', '["9,9"]'::jsonb, 'space', 'floodfill', 's-old');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"11241700-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;
-- Two 3x3 rooms side by side, joined by a door on their shared wall, and an outside door on the hall's north side.
create function pg_temp.make(p_place uuid, p_request uuid) returns jsonb language sql as $$
  select public.make_place_map(
    p_place, p_request, 'https://example.invalid/plan.png',
    '{"cells_per_image_width":6,"origin_x_pct":0,"origin_y_pct":0,"origin_cell_x":0,"origin_cell_y":0,"image_height_over_width":0.5}'::jsonb,
    '{"version":3,"darkness":"dim","groups":[],"lights":[],"sprites":[],"walls":[],"doors":[],"solid":[]}'::jsonb,
    '{"name":"The crypt","darkness":"dim","layers":{"walls":{}}}'::jsonb,
    '[{"key":"hall","name":"Hall","about":"A long table.","cells":["0,0","1,0","2,0"],"signature":"s-hall"},
      {"key":"oss","name":"ossuary","about":null,"cells":["3,0","4,0","5,0"],"signature":"s-oss"}]'::jsonb,
    '[{"from":"hall","to":"oss","edgeKey":"3,1:W"},{"from":"hall","to":null,"edgeKey":"1,0:N"}]'::jsonb
  );
$$;
-- Counts read past RLS, so a refusal is checked against the rows as they really are.
create function pg_temp.counts(p_place uuid) returns text language sql security definer as $$
  select (select count(*) from public.dungeon_maps where campaign_id = '11241700-0000-4000-8000-0000000000c1')
      || '|' || (select count(*) from public.locations where parent_id = p_place and location_type = 'room')
      || '|' || (select count(*) from public.location_map_regions where site_location_id = p_place)
      || '|' || (select count(*) from public.location_doors d join public.locations l on l.id = d.from_location_id where l.parent_id = p_place);
$$;

set local role authenticated;

-- A player cannot make the map: an unshared place is not even visible to them (found nothing), and nothing is left behind.
select pg_temp.as_user(2);
select throws_ok($$ select pg_temp.make('11241700-0000-4000-8000-0000000000d1', '11241700-0000-4000-8000-0000000000f1') $$,
  'P0002', null, 'a player cannot make a map');
select is(pg_temp.counts('11241700-0000-4000-8000-0000000000d1'), '0|1|1|0', 'the refused player left no drawing, room, region or door');

select pg_temp.as_user(1);
select lives_ok($$ select pg_temp.make('11241700-0000-4000-8000-0000000000d1', '11241700-0000-4000-8000-0000000000f1') $$,
  'the DM makes the crypt''s map');
select is(pg_temp.counts('11241700-0000-4000-8000-0000000000d1'), '1|2|2|2',
  'one drawing, two rooms (the Ossuary reused, the Hall made), a region each and both doors');
select is((select map_url || '|' || (source_map_id is not null)::text || '|' || (map_published_rev is not null)::text
             from public.locations where id = '11241700-0000-4000-8000-0000000000d1'),
  'https://example.invalid/plan.png|true|true', 'the place holds the picture, the drawing and the drawing''s rev');
select is((select description from public.locations where parent_id = '11241700-0000-4000-8000-0000000000d1' and name = 'Hall'),
  'A long table.', 'a made room carries what stands there');
select is((select space_location_id from public.location_map_regions where cell_signature = 's-oss'),
  '11241700-0000-4000-8000-0000000000a1'::uuid, 'the room the DM had named gets the region, not a second Ossuary');
select is((select cells::text from public.location_map_regions where space_location_id = '11241700-0000-4000-8000-0000000000a1'),
  '["3,0", "4,0", "5,0"]', 'its old region is replaced by the new map''s, not refused (#1271 review)');
select is((select count(*)::int from public.location_doors where edge_key = '1,0:N' and to_location_id is null), 1,
  'a door to the outside leads nowhere in the campaign');

-- The same request again: nothing new.
select lives_ok($$ select pg_temp.make('11241700-0000-4000-8000-0000000000d1', '11241700-0000-4000-8000-0000000000f1') $$,
  'a retried request answers');
select is(pg_temp.counts('11241700-0000-4000-8000-0000000000d1'), '1|2|2|2', 'and makes nothing a second time');

-- A place with a map of its own keeps it.
select throws_ok($$ select pg_temp.make('11241700-0000-4000-8000-0000000000d2', '11241700-0000-4000-8000-0000000000f2') $$,
  '23505', 'This place already has a map', 'a place that has a map is refused');

-- #1271 review: the guard read only the place's own picture and drawing.
select throws_ok($$ select pg_temp.make('11241700-0000-4000-8000-0000000000d4', '11241700-0000-4000-8000-0000000000f5') $$,
  '23505', 'This place already has a map', 'a place under a mapped place is refused');
select throws_ok($$ select pg_temp.make('11241700-0000-4000-8000-0000000000d5', '11241700-0000-4000-8000-0000000000f6') $$,
  '23505', 'This place already has a map', 'a place with a blank grid is refused');

-- A city holds no rooms: the map is made, open ground with exact walls.
select lives_ok($$ select pg_temp.make('11241700-0000-4000-8000-0000000000e1', '11241700-0000-4000-8000-0000000000f3') $$,
  'a city gets a map');
select is(pg_temp.counts('11241700-0000-4000-8000-0000000000e1'), '2|0|0|0', 'and no rooms, regions or doors (two drawings now: the crypt and the city; the keep was refused before its drawing)');

-- An account whose plan has no room for more places: the plan limit refuses a room the way the quota trigger does.
-- The map is still made, as open ground, and no room is half made.
reset role;
create function pg_temp.full_plan() returns trigger language plpgsql as $$
begin
  if new.location_type = 'room' and new.parent_id = '11241700-0000-4000-8000-0000000000d3' then
    raise exception 'quota_exceeded';
  end if;
  return new;
end $$;
create trigger zz_test_full_plan before insert on public.locations for each row execute function pg_temp.full_plan();
set local role authenticated;
select pg_temp.as_user(1);
select lives_ok($$ select pg_temp.make('11241700-0000-4000-8000-0000000000d3', '11241700-0000-4000-8000-0000000000f4') $$,
  'a full plan still gets the map');
select is((select (map_url is not null)::text || '|' || (select count(*) from public.locations r where r.parent_id = l.id)
             from public.locations l where l.id = '11241700-0000-4000-8000-0000000000d3'),
  'true|0', 'with its picture and walls, and no rooms at all');

select * from finish();
rollback;
