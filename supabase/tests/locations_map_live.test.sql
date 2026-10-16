-- #1073 stories 1 and 2: a published site's live-layer snapshot (locations.map_live, 20261016213818_locations_map_live)
-- and its standing layer (locations.map_layer_stand_url, 20261016220002_locations_map_stand_layer), with its copy less
-- what sways (locations.map_layer_stand_live_url, 20261016222453_locations_map_stand_live_layer, story 7)
-- reaches a player through get_player_visible_locations under the same is_map_shared gate as the picture, and not
-- otherwise.

begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10730000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue1073-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10730000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue1073-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('10730000-0000-4000-8000-000000000010', '10730000-0000-4000-8000-000000000001', 'Living maps campaign');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset)
values ('10730000-0000-4000-8000-000000000020', '10730000-0000-4000-8000-000000000001', '10730000-0000-4000-8000-000000000002', '10730000-0000-4000-8000-000000000010', 'Nessa', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('10730000-0000-4000-8000-000000000010', '10730000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('10730000-0000-4000-8000-000000000010', '10730000-0000-4000-8000-000000000002', 'player', 'Player', '10730000-0000-4000-8000-000000000020')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.locations (id, user_id, campaign_id, name, location_type, map_layer_url, is_map_shared, player_visible_to, map_live) values
  ('10730000-0000-4000-8000-000000000050', '10730000-0000-4000-8000-000000000001', '10730000-0000-4000-8000-000000000010',
   'Drowned Hall', 'dungeon', 'https://example.invalid/drawing.webp', true, array['10730000-0000-4000-8000-000000000020']::uuid[],
   '{"version": 1, "groups": [], "lights": []}'::jsonb);
update public.locations set map_layer_stand_url = 'https://example.invalid/standing.webp',
  map_layer_stand_live_url = 'https://example.invalid/standing-live.webp' where id = '10730000-0000-4000-8000-000000000050';

select ok(
  (select attnum from pg_attribute where attrelid = 'public.locations'::regclass and attname = 'map_live') > 0,
  'a site carries a live-layer snapshot');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10730000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select map_live from public.get_player_visible_locations('10730000-0000-4000-8000-000000000010', '10730000-0000-4000-8000-000000000050')),
  '{"version": 1, "groups": [], "lights": []}'::jsonb,
  'a player sees the snapshot of a shared map, beside its picture');
select is(
  (select map_layer_stand_url from public.get_player_visible_locations('10730000-0000-4000-8000-000000000010', '10730000-0000-4000-8000-000000000050')),
  'https://example.invalid/standing.webp',
  'and its standing layer (story 2)');
select is(
  (select map_layer_stand_live_url from public.get_player_visible_locations('10730000-0000-4000-8000-000000000010', '10730000-0000-4000-8000-000000000050')),
  'https://example.invalid/standing-live.webp',
  'and the standing layer less what sways (story 7)');

reset role;
update public.locations set is_map_shared = false where id = '10730000-0000-4000-8000-000000000050';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10730000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select map_live from public.get_player_visible_locations('10730000-0000-4000-8000-000000000010', '10730000-0000-4000-8000-000000000050')),
  null::jsonb,
  'an unshared map withholds its snapshot, as it withholds its picture');
select is(
  (select map_layer_url from public.get_player_visible_locations('10730000-0000-4000-8000-000000000010', '10730000-0000-4000-8000-000000000050')),
  null::text,
  'and the picture with it (the gate is one gate)');
select is(
  (select map_layer_stand_url from public.get_player_visible_locations('10730000-0000-4000-8000-000000000010', '10730000-0000-4000-8000-000000000050')),
  null::text,
  'and its standing layer');
select is(
  (select map_layer_stand_live_url from public.get_player_visible_locations('10730000-0000-4000-8000-000000000010', '10730000-0000-4000-8000-000000000050')),
  null::text,
  'and its copy less what sways');

select * from finish();
rollback;
