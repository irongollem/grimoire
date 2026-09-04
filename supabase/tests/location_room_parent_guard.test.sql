begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

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
  ('78300000-0000-4000-8000-000000000022', '78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', 'Ilvaren Reach', 'region'),
  ('78300000-0000-4000-8000-000000000023', '78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', 'The White Quarter', 'district'),
  ('78300000-0000-4000-8000-000000000024', '78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', 'The Frost Moors', 'wilderness');

-- ── a room's parent ─────────────────────────────────────────────────────────

select lives_ok(
  $$insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type)
    values ('78300000-0000-4000-8000-000000000030', '78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', '78300000-0000-4000-8000-000000000020', 'Flooded Nave', 'room')$$,
  'a room may sit inside a dungeon'
);

-- An inn is a building, so it holds rooms AND gets the panel — #810 removed the
-- gap this case used to document. It stays because renting a room above a
-- tavern is the ordinary thing a DM does, and because the predicate must keep
-- agreeing with `isSiteType` on all five structure types, not just the two
-- obvious ones.
select lives_ok(
  $$insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type)
    values ('78300000-0000-4000-8000-000000000031', '78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', '78300000-0000-4000-8000-000000000021', 'Upstairs back room', 'room')$$,
  'a room may sit inside an inn'
);

-- #810: geography holds no rooms. A district is a street map and a wilderness
-- is terrain; both take pins on their children, and neither has a floor plan to
-- trace a room onto. Both were accepted before #810 because the generated tier
-- ladder had grouped them with buildings.
select throws_ok(
  $$insert into public.locations (user_id, campaign_id, parent_id, name, location_type)
    values ('78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', '78300000-0000-4000-8000-000000000023', 'Back office', 'room')$$,
  '23514',
  null,
  'a room may not hang off a district'
);

select throws_ok(
  $$insert into public.locations (user_id, campaign_id, parent_id, name, location_type)
    values ('78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', '78300000-0000-4000-8000-000000000024', 'Clearing', 'room')$$,
  '23514',
  null,
  'a room may not hang off a wilderness'
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

-- ── a row that predates the rule stays editable (#810) ──────────────────────
--
-- `UPDATE OF parent_id, location_type` fires when a column appears in the SET
-- list, changed or not, and `LocationEditor.buildPayload()` sends both on every
-- save. So when #810 narrowed the allowed parents from seven types to five, the
-- four production rooms sitting under a district or a wilderness would have
-- become unrenameable, untaggable and unshareable — punished for a rule that
-- arrived after them. The guard therefore judges a *transition*, not a row.
--
-- The trigger is disabled to plant the row, which is the honest way to express
-- "this existed before the rule did"; every assertion below runs with it on.
alter table public.locations disable trigger locations_room_parent_guard;
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type)
values ('78300000-0000-4000-8000-000000000040', '78300000-0000-4000-8000-000000000001', '78300000-0000-4000-8000-000000000010', '78300000-0000-4000-8000-000000000023', 'Legacy back room', 'room');
alter table public.locations enable trigger locations_room_parent_guard;

select lives_ok(
  $$update public.locations set name = 'Legacy back room, renamed'
    where id = '78300000-0000-4000-8000-000000000040'$$,
  'a room under a now-invalid parent can still be renamed'
);

-- The case that actually bit: the value is unchanged but present in the SET
-- list, so `UPDATE OF` fires and the old guard re-judged it.
select lives_ok(
  $$update public.locations
      set parent_id = parent_id, location_type = location_type, notes = 'edited'
    where id = '78300000-0000-4000-8000-000000000040'$$,
  'saving a legacy room with parent_id and location_type unchanged is allowed'
);

-- But a real move is still judged, so the row corrects itself the moment
-- anyone actually re-parents it.
select throws_ok(
  $$update public.locations set parent_id = '78300000-0000-4000-8000-000000000024'
    where id = '78300000-0000-4000-8000-000000000040'$$,
  '23514',
  null,
  'moving that legacy room to another invalid parent is still refused'
);

select * from finish();
rollback;
