begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

-- Story #783 (epic #780). Two invariants ship together and neither has a
-- client-side equivalent that can be trusted: a room must sit somewhere that
-- can hold rooms, and a place that already holds rooms may not become
-- something that cannot. Both raise 23514.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('78300000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rooms-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name)
values ('78300000-0000-4000-8000-000000000010', '78300000-0000-4000-8000-000000000001', 'Rooms invariant');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('78300000-0000-4000-8000-000000000010', '78300000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('78300000-0000-4000-8000-000000000020', '78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', 'The Sunken Vault', 'dungeon'),
  ('78300000-0000-4000-8000-000000000021', '78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', 'The Rusted Flagon', 'inn'),
  ('78300000-0000-4000-8000-000000000022', '78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', 'Ilvaren Reach', 'region');

-- ── a room's parent ─────────────────────────────────────────────────────────

select lives_ok(
  $$insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type)
    values ('78300000-0000-4000-8000-000000000030', '78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', '78300000-0000-4000-8000-000000000020', 'Flooded Nave', 'room')$$,
  'a room may sit inside a dungeon'
);

-- The wider half of the predicate, and the reason it is wider than the panel:
-- renting a room above a tavern is ordinary, so the constraint must not reject
-- what the UI merely declines to offer a map for.
select lives_ok(
  $$insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type)
    values ('78300000-0000-4000-8000-000000000031', '78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', '78300000-0000-4000-8000-000000000021', 'Upstairs back room', 'room')$$,
  'a room may sit inside an inn, even though inns get no rooms panel'
);

select throws_ok(
  $$insert into public.locations (user_id, campaign_id, parent_id, name, location_type)
    values ('78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', '78300000-0000-4000-8000-000000000022', 'Nowhere', 'room')$$,
  '23514',
  null,
  'a room may not hang off a region'
);

select throws_ok(
  $$insert into public.locations (user_id, campaign_id, parent_id, name, location_type)
    values ('78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', '78300000-0000-4000-8000-000000000030', 'Alcove', 'room')$$,
  '23514',
  null,
  'a room may not sit inside another room'
);

select throws_ok(
  $$insert into public.locations (user_id, campaign_id, name, location_type)
    values ('78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', 'Orphan', 'room')$$,
  '23514',
  null,
  'a room may not be top-level'
);

-- Reparenting is guarded too — the trigger fires on `update of parent_id`.
select throws_ok(
  $$update public.locations set parent_id = '78300000-0000-4000-8000-000000000022'
     where id = '78300000-0000-4000-8000-000000000030'$$,
  '23514',
  null,
  'a room may not be reparented onto a region'
);

-- ── a holder of rooms may not stop being one ────────────────────────────────

select throws_ok(
  $$update public.locations set location_type = 'city'
     where id = '78300000-0000-4000-8000-000000000020'$$,
  '23514',
  null,
  'a dungeon holding rooms cannot become a city'
);

select lives_ok(
  $$update public.locations set location_type = 'building'
     where id = '78300000-0000-4000-8000-000000000020'$$,
  'a dungeon holding rooms may become a building, which also holds rooms'
);

-- ── ordering ────────────────────────────────────────────────────────────────

-- NULL means "no order claimed" rather than "first". The whole Atlas keeps its
-- name ordering until a DM arranges something, so the default must not be 0.
select is(
  (select sort_order from public.locations where id = '78300000-0000-4000-8000-000000000030'),
  null::integer,
  'sort_order defaults to null, not zero'
);

-- The projection lists every column positionally, so widening `locations`
-- without recreating it fails at call time in the player atlas. Calling it is
-- the cheapest proof the recreation kept the column list in step.
select lives_ok(
  $$select * from public.get_player_visible_locations('78300000-0000-4000-8000-000000000010', null)$$,
  'get_player_visible_locations still matches the widened locations rowtype'
);

select * from finish();
rollback;
