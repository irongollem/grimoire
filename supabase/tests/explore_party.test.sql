-- Where the party stands while exploring (#1125, 20261103093427): campaigns.explore_party holds a site of THIS
-- campaign and a square per party member, and nothing else. Its site id reaches every member who reads the row.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('99920000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'explore-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values
  ('99920000-0000-4000-8000-000000000010', '99920000-0000-4000-8000-000000000001', 'Here'),
  ('99920000-0000-4000-8000-000000000011', '99920000-0000-4000-8000-000000000001', 'Elsewhere');
insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('99920000-0000-4000-8000-000000000020', '99920000-0000-4000-8000-000000000001', '99920000-0000-4000-8000-000000000010', 'Undercroft', 'dungeon'),
  ('99920000-0000-4000-8000-000000000021', '99920000-0000-4000-8000-000000000001', '99920000-0000-4000-8000-000000000011', 'Other dungeon', 'dungeon');

select lives_ok(
  $$update public.campaigns set explore_party = '{"site_id":"99920000-0000-4000-8000-000000000020","positions":{"99920000-0000-4000-8000-000000000030":{"x":3,"y":4.5}}}'
    where id = '99920000-0000-4000-8000-000000000010'$$,
  'a site of this campaign and a square per member is stored');
select throws_ok(
  $$update public.campaigns set explore_party = '{"site_id":"99920000-0000-4000-8000-000000000021","positions":{}}'
    where id = '99920000-0000-4000-8000-000000000010'$$,
  '23514', null, 'a site of another campaign is refused');
select throws_ok(
  $$update public.campaigns set explore_party = '{"site_id":"99920000-0000-4000-8000-000000000020","positions":{"99920000-0000-4000-8000-000000000030":{"x":"3","y":4}}}'
    where id = '99920000-0000-4000-8000-000000000010'$$,
  '23514', null, 'a square whose x is not a number is refused');
select throws_ok(
  $$update public.campaigns set explore_party = '{"site_id":"99920000-0000-4000-8000-000000000020","positions":{"99920000-0000-4000-8000-000000000030":{"x":3}}}'
    where id = '99920000-0000-4000-8000-000000000010'$$,
  '23514', null, 'a square missing y is refused');
select throws_ok(
  $$update public.campaigns set explore_party = '{"site_id":"99920000-0000-4000-8000-000000000020","positions":{},"note":"x"}'
    where id = '99920000-0000-4000-8000-000000000010'$$,
  '23514', null, 'an extra key is refused');
select lives_ok(
  $$update public.campaigns set explore_party = null where id = '99920000-0000-4000-8000-000000000010'$$,
  'no party on the grid is fine');
select is(private.is_explore_party('{"site_id":"99920000-0000-4000-8000-000000000020","positions":{"bad":null}}'::jsonb), false,
  'the shape test is false, not NULL, for a malformed member');

select * from finish();
rollback;
