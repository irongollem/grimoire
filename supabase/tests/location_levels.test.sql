begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

-- A level is a floor its DM assigned (20260928195128), never inferred from
-- type or plan: a shop may be a floor of a department store, and a dungeon
-- may be a place on another's floor. What the guard holds is only that both
-- ends have a floor plan.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('92800000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'levels-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name)
values ('92800000-0000-4000-8000-000000000010', '92800000-0000-4000-8000-000000000001', 'Levels');

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('92800000-0000-4000-8000-000000000020', '92800000-0000-4000-8000-000000000001', '92800000-0000-4000-8000-000000000010', 'The Well', 'dungeon'),
  ('92800000-0000-4000-8000-000000000021', '92800000-0000-4000-8000-000000000001', '92800000-0000-4000-8000-000000000010', 'Sugarwell', 'town'),
  ('92800000-0000-4000-8000-000000000022', '92800000-0000-4000-8000-000000000001', '92800000-0000-4000-8000-000000000010', 'The Ashmouth', 'dungeon');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('92800000-0000-4000-8000-000000000030', '92800000-0000-4000-8000-000000000001', '92800000-0000-4000-8000-000000000010', '92800000-0000-4000-8000-000000000020', 'The Crook', 'room'),
  ('92800000-0000-4000-8000-000000000031', '92800000-0000-4000-8000-000000000001', '92800000-0000-4000-8000-000000000010', '92800000-0000-4000-8000-000000000020', 'Fondant''s Window', 'store'),
  ('92800000-0000-4000-8000-000000000032', '92800000-0000-4000-8000-000000000001', '92800000-0000-4000-8000-000000000010', '92800000-0000-4000-8000-000000000021', 'The Chapel', 'building');

-- ── assigning ────────────────────────────────────────────────────────────────

select is(
  (select is_level from public.locations where id = '92800000-0000-4000-8000-000000000031'),
  false,
  'a nested site is a place on its parent''s floor until its DM says otherwise'
);

select lives_ok(
  $$insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type, is_level)
    values ('92800000-0000-4000-8000-000000000040', '92800000-0000-4000-8000-000000000001', '92800000-0000-4000-8000-000000000010', '92800000-0000-4000-8000-000000000020', 'The Middle', 'dungeon', true)$$,
  'a dungeon may be created as a level of a dungeon'
);

select lives_ok(
  $$update public.locations set is_level = true where id = '92800000-0000-4000-8000-000000000031'$$,
  'a store may be made a level: nothing about its type rules it out'
);

select lives_ok(
  $$update public.locations set is_level = false where id = '92800000-0000-4000-8000-000000000031'$$,
  'and made a place on the floor again'
);

select throws_ok(
  $$update public.locations set is_level = true where id = '92800000-0000-4000-8000-000000000032'$$,
  '23514',
  null,
  'a site inside a town cannot be a level: the town has no floor plan'
);

select throws_ok(
  $$update public.locations set is_level = true where id = '92800000-0000-4000-8000-000000000022'$$,
  '23514',
  null,
  'a top-level site cannot be a level of nothing'
);

select throws_ok(
  $$update public.locations set is_level = true where id = '92800000-0000-4000-8000-000000000030'$$,
  '23514',
  null,
  'a room is never a level'
);

-- ── moving and retyping ──────────────────────────────────────────────────────

update public.locations set parent_id = '92800000-0000-4000-8000-000000000022'
 where id = '92800000-0000-4000-8000-000000000040';
select is(
  (select is_level from public.locations where id = '92800000-0000-4000-8000-000000000040'),
  true,
  'a level moved into another dungeon stays a level: the DM re-filed a floor'
);

select lives_ok(
  $$update public.locations set parent_id = '92800000-0000-4000-8000-000000000021'
     where id = '92800000-0000-4000-8000-000000000040'$$,
  'a level may be moved into a town'
);
select is(
  (select is_level from public.locations where id = '92800000-0000-4000-8000-000000000040'),
  false,
  'and is then no longer a level of anything'
);

update public.locations
   set parent_id = '92800000-0000-4000-8000-000000000022', is_level = true
 where id = '92800000-0000-4000-8000-000000000040';
select throws_ok(
  $$update public.locations set location_type = 'region' where id = '92800000-0000-4000-8000-000000000022'$$,
  '23514',
  null,
  'a site holding levels cannot become a type without a floor plan'
);

select lives_ok(
  $$update public.locations set location_type = 'room' where id = '92800000-0000-4000-8000-000000000040'$$,
  'a level retyped to a room is allowed'
);

select * from finish();
rollback;
