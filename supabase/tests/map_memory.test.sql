begin;
-- What the party has seen of a map (#1133): members read it, only the DM writes, and remember_map_cells merges on the
-- server so two DM windows cannot overwrite each other's squares.
set constraints all immediate;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('11330000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue1133-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('11330000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue1133-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('11330000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue1133-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('11330000-0000-4000-8000-000000000010', '11330000-0000-4000-8000-000000000001', 'Memory test'),
       ('11330000-0000-4000-8000-000000000011', '11330000-0000-4000-8000-000000000001', 'Other campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('11330000-0000-4000-8000-000000000010', '11330000-0000-4000-8000-000000000002', 'player', 'Player');

insert into public.locations (id, user_id, campaign_id, name, location_type)
values ('11330000-0000-4000-8000-000000000020', '11330000-0000-4000-8000-000000000001', '11330000-0000-4000-8000-000000000010', 'Crypt', 'dungeon'),
       ('11330000-0000-4000-8000-000000000021', '11330000-0000-4000-8000-000000000001', '11330000-0000-4000-8000-000000000011', 'Elsewhere', 'dungeon');

select is(
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'campaigns' and column_name = 'map_memory'),
  '''remembered''::text',
  'a campaign remembers what the party has seen unless the DM chooses strict'
);

select ok(
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'encounter_state' and column_name = 'fog_mask'),
  'a fight keeps no fog of its own any more'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- The DM remembers squares; the RPC merges, de-duplicates and drops anything that is not a square.
select set_config('request.jwt.claim.sub', '11330000-0000-4000-8000-000000000001', true);
select is(
  public.remember_map_cells('11330000-0000-4000-8000-000000000010', '11330000-0000-4000-8000-000000000020', array['2,3', '1,1', 'junk']),
  '1,1;2,3',
  'the DM remembers squares, sorted, without anything that is not a square'
);
select is(
  public.remember_map_cells('11330000-0000-4000-8000-000000000010', '11330000-0000-4000-8000-000000000020', array['-1,0', '2,3']),
  '-1,0;1,1;2,3',
  'a second write adds to the memory instead of replacing it'
);
select is(
  public.remember_map_cells('11330000-0000-4000-8000-000000000010', '11330000-0000-4000-8000-000000000020', '{}', array['1,1']),
  '-1,0;2,3',
  'hiding a square takes it out'
);

-- A map of another campaign cannot be remembered under this one.
select throws_ok(
  $$ select public.remember_map_cells('11330000-0000-4000-8000-000000000010', '11330000-0000-4000-8000-000000000021', array['0,0']) $$,
  null, null,
  'a map from another campaign is refused'
);

-- A player reads the memory but cannot change it.
select set_config('request.jwt.claim.sub', '11330000-0000-4000-8000-000000000002', true);
select is(
  (select seen from public.map_memory where campaign_id = '11330000-0000-4000-8000-000000000010'),
  '-1,0;2,3',
  'a member reads what the party has seen'
);
select throws_ok(
  $$ select public.remember_map_cells('11330000-0000-4000-8000-000000000010', '11330000-0000-4000-8000-000000000020', array['9,9']) $$,
  '42501', null,
  'a player cannot reveal squares'
);
select is_empty(
  $$ update public.map_memory set seen = '' where campaign_id = '11330000-0000-4000-8000-000000000010' returning id $$,
  'a player cannot clear the memory by hand'
);

-- An outsider sees nothing.
select set_config('request.jwt.claim.sub', '11330000-0000-4000-8000-000000000003', true);
select is_empty(
  $$ select id from public.map_memory where campaign_id = '11330000-0000-4000-8000-000000000010' $$,
  'someone outside the campaign reads nothing'
);

-- Forgetting empties it (Hide all).
select set_config('request.jwt.claim.sub', '11330000-0000-4000-8000-000000000001', true);
select is(
  public.remember_map_cells('11330000-0000-4000-8000-000000000010', '11330000-0000-4000-8000-000000000020', '{}', '{}', true),
  '',
  'Hide all forgets every square'
);

select * from finish();
rollback;
