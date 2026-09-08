begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

-- Story #784 (epic #780), widened by #818. A region binds a shape on a
-- site's map to one of its addressable spaces -- a room, or a nested site
-- that itself has a floor plan (grounds, building, dungeon, store, tavern,
-- inn). The binding is a real FK with a real guard; the geometry is jsonb
-- because a shape is shaped data. What must not be possible is a binding
-- that points somewhere the site does not contain, or at a child with no
-- footprint of its own -- the hole quest_beat_attachments.metadata.room_ids
-- left by checking only existence.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('78400000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'regions-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name)
values ('78400000-0000-4000-8000-000000000010', '78400000-0000-4000-8000-000000000001', 'Regions');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('78400000-0000-4000-8000-000000000010', '78400000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('78400000-0000-4000-8000-000000000020', '78400000-0000-4000-8000-000000000001', '78400000-0000-4000-8000-000000000010', 'The Sunken Vault', 'dungeon'),
  ('78400000-0000-4000-8000-000000000021', '78400000-0000-4000-8000-000000000001', '78400000-0000-4000-8000-000000000010', 'The Drowned Chapel', 'dungeon'),
  ('78400000-0000-4000-8000-000000000022', '78400000-0000-4000-8000-000000000001', '78400000-0000-4000-8000-000000000010', 'The White Quarter', 'district');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('78400000-0000-4000-8000-000000000030', '78400000-0000-4000-8000-000000000001', '78400000-0000-4000-8000-000000000010', '78400000-0000-4000-8000-000000000020', 'Reliquary', 'room'),
  ('78400000-0000-4000-8000-000000000031', '78400000-0000-4000-8000-000000000001', '78400000-0000-4000-8000-000000000010', '78400000-0000-4000-8000-000000000021', 'Far Vestry', 'room'),
  -- #818: a nested site occupies its own footprint on the parent's map,
  -- exactly as a room does -- a courtyard inside the vault.
  ('78400000-0000-4000-8000-000000000032', '78400000-0000-4000-8000-000000000001', '78400000-0000-4000-8000-000000000010', '78400000-0000-4000-8000-000000000020', 'Sunken Courtyard', 'grounds'),
  -- #818: a child with no footprint of its own -- nothing a region could
  -- ever be traced onto -- must still be rejected as a bind target.
  ('78400000-0000-4000-8000-000000000033', '78400000-0000-4000-8000-000000000001', '78400000-0000-4000-8000-000000000010', '78400000-0000-4000-8000-000000000020', 'Buried Ward', 'city');

-- Tracing before naming is the normal workflow: you draw the shapes off the
-- page, then say which space each one is. So an unbound region is valid.
select lives_ok(
  $$insert into public.location_map_regions (id, user_id, site_location_id, cells, label)
    values ('78400000-0000-4000-8000-000000000040', '78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '["3,4","3,5"]'::jsonb, 'Region 5')$$,
  'a region may be traced before it is bound to any space'
);

select lives_ok(
  $$insert into public.location_map_regions (id, user_id, site_location_id, space_location_id, cells)
    values ('78400000-0000-4000-8000-000000000041', '78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '78400000-0000-4000-8000-000000000030', '["1,1"]'::jsonb)$$,
  'a region binds to a room of the site it is drawn on'
);

-- The guard: a room of a *different* site is the mistake that a bare FK pair
-- would happily accept.
select throws_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, space_location_id, cells)
    values ('78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '78400000-0000-4000-8000-000000000031', '["2,2"]'::jsonb)$$,
  '23514',
  null,
  'a region cannot bind to a room belonging to another site'
);

-- #818: a nested site -- a nested type is not enough on its own; the parent
-- check still applies, and a valid-elsewhere space that is not a child of
-- *this* site must still be rejected.
select throws_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, space_location_id, cells)
    values ('78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '78400000-0000-4000-8000-000000000021', '["2,2"]'::jsonb)$$,
  '23514',
  null,
  'a region cannot bind to a space that is not a child of the site it is drawn on'
);

-- Two shapes claiming one space is always a mistake; two unbound shapes are
-- the normal state mid-trace, which is why the unique index is partial.
select throws_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, space_location_id, cells)
    values ('78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '78400000-0000-4000-8000-000000000030', '["9,9"]'::jsonb)$$,
  '23505',
  null,
  'two regions cannot claim the same space'
);

select lives_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, cells, label)
    values ('78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '["7,7"]'::jsonb, 'Region 6')$$,
  'but several unbound regions may coexist while tracing'
);

select throws_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, cells)
    values ('78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '{"not":"an array"}'::jsonb)$$,
  '23514',
  null,
  'cells must be an array'
);

-- Deleting the room takes its region with it: a shape bound to nothing that
-- still claims a space id would be worse than no shape.
delete from public.locations where id = '78400000-0000-4000-8000-000000000030';
select is(
  (select count(*)::integer from public.location_map_regions
    where id = '78400000-0000-4000-8000-000000000041'),
  0,
  'removing a room removes the region bound to it'
);

-- #818: binding to a nested site succeeds. Palace Gardens' Sunken Courtyard
-- is a `grounds` child of the vault -- private.location_can_hold_rooms
-- admits it, exactly as it admits a room.
select lives_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, space_location_id, cells)
    values ('78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '78400000-0000-4000-8000-000000000032', '["5,5"]'::jsonb)$$,
  'a region binds to a nested site that is a direct child of the site it is drawn on'
);

-- #818: a child with no footprint of its own -- a `city` has nowhere to be
-- traced onto -- is still rejected even though it is a genuine child.
select throws_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, space_location_id, cells)
    values ('78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '78400000-0000-4000-8000-000000000033', '["6,6"]'::jsonb)$$,
  '23514',
  null,
  'a region cannot bind to a child with no footprint of its own'
);

-- #810: a region is geometry on a floor plan, so it can only be traced on a
-- place that has one. Before #810 the guard constrained only the bound
-- *space* and never the site, so the database happily stored a region on a
-- continent -- a row no screen could ever render. Free to close while the
-- table is empty.
select throws_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, cells)
    values ('78400000-0000-4000-8000-000000000001', '78400000-0000-4000-8000-000000000022', '["1,1"]'::jsonb)$$,
  '23514',
  null,
  'a region may not be traced on a district'
);

-- #810: retyping a site out of the tier must not strand the shapes drawn on it.
-- The region guard fires only on insert and on rebinding, so before this the
-- site could simply become a city afterwards, leaving an unbound region on a
-- place with no floor plan — and then partly frozen, since any later write
-- touching `site_location_id` raises. Unbound is the normal mid-trace state, so
-- the gap sat exactly on the workflow the table exists for.
insert into public.location_map_regions (id, user_id, site_location_id, cells, label)
values ('78400000-0000-4000-8000-000000000050', '78400000-0000-4000-8000-000000000001', '78400000-0000-4000-8000-000000000021', '["4,4"]'::jsonb, 'Untraced yet');

select throws_ok(
  $$update public.locations set location_type = 'city'
    where id = '78400000-0000-4000-8000-000000000021'$$,
  '23514',
  null,
  'a site carrying an unbound region cannot become a place with no floor plan'
);

select * from finish();
rollback;
