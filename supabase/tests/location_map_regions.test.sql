begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- Story #784 (epic #780). A region binds a shape on a site's map to one of its
-- rooms. The binding is a real FK with a real guard; the geometry is jsonb
-- because a shape is shaped data. What must not be possible is a binding that
-- points somewhere the site does not contain -- the hole
-- quest_beat_attachments.metadata.room_ids left by checking only existence.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('78400000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'regions-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name)
values ('78400000-0000-4000-8000-000000000010', '78400000-0000-4000-8000-000000000001', 'Regions');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('78400000-0000-4000-8000-000000000010', '78400000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('78400000-0000-4000-8000-000000000020', '78400000-0000-4000-8000-000000000001', '78400000-0000-4000-8000-000000000010', 'The Sunken Vault', 'dungeon'),
  ('78400000-0000-4000-8000-000000000021', '78400000-0000-4000-8000-000000000001', '78400000-0000-4000-8000-000000000010', 'The Drowned Chapel', 'dungeon');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('78400000-0000-4000-8000-000000000030', '78400000-0000-4000-8000-000000000001', '78400000-0000-4000-8000-000000000010', '78400000-0000-4000-8000-000000000020', 'Reliquary', 'room'),
  ('78400000-0000-4000-8000-000000000031', '78400000-0000-4000-8000-000000000001', '78400000-0000-4000-8000-000000000010', '78400000-0000-4000-8000-000000000021', 'Far Vestry', 'room');

-- Tracing before naming is the normal workflow: you draw the shapes off the
-- page, then say which room each one is. So an unbound region is valid.
select lives_ok(
  $$insert into public.location_map_regions (id, user_id, site_location_id, cells, label)
    values ('78400000-0000-4000-8000-000000000040', '78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '["3,4","3,5"]'::jsonb, 'Region 5')$$,
  'a region may be traced before it is bound to any room'
);

select lives_ok(
  $$insert into public.location_map_regions (id, user_id, site_location_id, room_location_id, cells)
    values ('78400000-0000-4000-8000-000000000041', '78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '78400000-0000-4000-8000-000000000030', '["1,1"]'::jsonb)$$,
  'a region binds to a room of the site it is drawn on'
);

-- The guard: a room of a *different* site is the mistake that a bare FK pair
-- would happily accept.
select throws_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, room_location_id, cells)
    values ('78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '78400000-0000-4000-8000-000000000031', '["2,2"]'::jsonb)$$,
  '23514',
  null,
  'a region cannot bind to a room belonging to another site'
);

select throws_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, room_location_id, cells)
    values ('78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '78400000-0000-4000-8000-000000000021', '["2,2"]'::jsonb)$$,
  '23514',
  null,
  'a region cannot bind to something that is not a room'
);

-- Two shapes claiming one room is always a mistake; two unbound shapes are the
-- normal state mid-trace, which is why the unique index is partial.
select throws_ok(
  $$insert into public.location_map_regions (user_id, site_location_id, room_location_id, cells)
    values ('78400000-0000-4000-8000-000000000001',
            '78400000-0000-4000-8000-000000000020', '78400000-0000-4000-8000-000000000030', '["9,9"]'::jsonb)$$,
  '23505',
  null,
  'two regions cannot claim the same room'
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
-- still claims a room id would be worse than no shape.
delete from public.locations where id = '78400000-0000-4000-8000-000000000030';
select is(
  (select count(*)::integer from public.location_map_regions
    where id = '78400000-0000-4000-8000-000000000041'),
  0,
  'removing a room removes the region bound to it'
);

select * from finish();
rollback;
