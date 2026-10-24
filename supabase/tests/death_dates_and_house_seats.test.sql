begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- death_dates_and_house_seats (20261024062101): an NPC's death date keeps its shape and never reaches a player;
-- a House's seat stays in its campaign and reaches a player only when they can already see that place, and a DM
-- previewing one member sees exactly that member's.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10240000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seat-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10240000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seat-ann@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10240000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seat-bo@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('10240000-0000-4000-8000-000000000010', '10240000-0000-4000-8000-000000000001', 'Seat test'),
  ('10240000-0000-4000-8000-000000000011', '10240000-0000-4000-8000-000000000001', 'Another campaign');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('10240000-0000-4000-8000-000000000020', '10240000-0000-4000-8000-000000000001', '10240000-0000-4000-8000-000000000010', 'Ann', '2014'),
  ('10240000-0000-4000-8000-000000000021', '10240000-0000-4000-8000-000000000001', '10240000-0000-4000-8000-000000000010', 'Bo', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('10240000-0000-4000-8000-000000000010', '10240000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('10240000-0000-4000-8000-000000000010', '10240000-0000-4000-8000-000000000002', 'player', 'Ann', '10240000-0000-4000-8000-000000000020'),
  ('10240000-0000-4000-8000-000000000010', '10240000-0000-4000-8000-000000000003', 'player', 'Bo', '10240000-0000-4000-8000-000000000021')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

-- The keep is shared with Ann only; a place in another campaign.
insert into public.locations (id, user_id, campaign_id, name, player_visible_to) values
  ('10240000-0000-4000-8000-000000000030', '10240000-0000-4000-8000-000000000001', '10240000-0000-4000-8000-000000000010', 'Thornmere Keep',
   array['10240000-0000-4000-8000-000000000020']::uuid[]),
  ('10240000-0000-4000-8000-000000000031', '10240000-0000-4000-8000-000000000001', '10240000-0000-4000-8000-000000000011', 'Far tower', '{}');

-- The house is known to both players.
insert into public.factions (id, user_id, campaign_id, name, faction_type, descent, player_visible_to, seat_location_id) values
  ('10240000-0000-4000-8000-000000000040', '10240000-0000-4000-8000-000000000001', '10240000-0000-4000-8000-000000000010', 'House Thane', 'House', 'either',
   array['10240000-0000-4000-8000-000000000020', '10240000-0000-4000-8000-000000000021']::uuid[], '10240000-0000-4000-8000-000000000030');

insert into public.npcs (id, user_id, campaign_id, name, status, born_year, died_year, player_visible_to, player_visible_fields) values
  ('10240000-0000-4000-8000-000000000050', '10240000-0000-4000-8000-000000000001', '10240000-0000-4000-8000-000000000010', 'Old Bren',
   'dead', 1428, 1491, array['10240000-0000-4000-8000-000000000020']::uuid[], array['name']);

-- ── Death dates ────────────────────────────────────────────────────────────────

select throws_ok(
  $$ update public.npcs set died_year = 1400 where id = '10240000-0000-4000-8000-000000000050' $$,
  '23514', null,
  'a death before the birth year is refused'
);

select throws_ok(
  $$ update public.npcs set died_month = 3, died_day = null where id = '10240000-0000-4000-8000-000000000050' $$,
  '23514', null,
  'a death month without a day is refused'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '10240000-0000-4000-8000-000000000002', true);
select is(
  (select died_year from public.get_player_visible_npcs('10240000-0000-4000-8000-000000000010') where id = '10240000-0000-4000-8000-000000000050'),
  null,
  'a player never sees the death date'
);

-- ── The seat ───────────────────────────────────────────────────────────────────

select is(
  (select seat_location_id from public.get_player_visible_factions('10240000-0000-4000-8000-000000000010') where id = '10240000-0000-4000-8000-000000000040'),
  '10240000-0000-4000-8000-000000000030'::uuid,
  'a player who can see the keep sees it as the seat'
);

select set_config('request.jwt.claim.sub', '10240000-0000-4000-8000-000000000003', true);
select is(
  (select seat_location_id from public.get_player_visible_factions('10240000-0000-4000-8000-000000000010') where id = '10240000-0000-4000-8000-000000000040'),
  null,
  'a player who cannot see the keep knows the house but not its seat'
);

select set_config('request.jwt.claim.sub', '10240000-0000-4000-8000-000000000001', true);
select is(
  (select seat_location_id from public.get_player_visible_factions('10240000-0000-4000-8000-000000000010', '10240000-0000-4000-8000-000000000020') where id = '10240000-0000-4000-8000-000000000040'),
  '10240000-0000-4000-8000-000000000030'::uuid,
  'the DM previewing Ann sees the seat Ann sees'
);
select is(
  (select seat_location_id from public.get_player_visible_factions('10240000-0000-4000-8000-000000000010', '10240000-0000-4000-8000-000000000021') where id = '10240000-0000-4000-8000-000000000040'),
  null,
  'the DM previewing Bo sees no seat, as Bo would'
);

select throws_ok(
  $$ update public.factions set seat_location_id = '10240000-0000-4000-8000-000000000031' where id = '10240000-0000-4000-8000-000000000040' $$,
  null, null,
  'a seat in another campaign is refused'
);

select * from finish();
rollback;
