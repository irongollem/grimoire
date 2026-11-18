begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

-- Roads between places (#1222): a row joining two places of one campaign, with a distance. The campaign's DMs
-- write them; players and other campaigns do not read them.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12220000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roads-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12220000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roads-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12220000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roads-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12220000-0000-4000-8000-0000000000b1', '12220000-0000-4000-8000-0000000000a1', 'The Coast', 'dnd5e-2024'),
  ('12220000-0000-4000-8000-0000000000b2', '12220000-0000-4000-8000-0000000000a3', 'Elsewhere', 'dnd5e-2024');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('12220000-0000-4000-8000-0000000000b1', '12220000-0000-4000-8000-0000000000a1', 'dm', 'DM'),
  ('12220000-0000-4000-8000-0000000000b1', '12220000-0000-4000-8000-0000000000a2', 'player', 'Player'),
  ('12220000-0000-4000-8000-0000000000b2', '12220000-0000-4000-8000-0000000000a3', 'dm', 'Other DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- Harbour (…c1) and Brightwater (…c2) are on the coast; Farholt (…c9) is in the other campaign.
insert into public.locations (id, user_id, campaign_id, name) values
  ('12220000-0000-4000-8000-0000000000c1', '12220000-0000-4000-8000-0000000000a1', '12220000-0000-4000-8000-0000000000b1', 'Harbour'),
  ('12220000-0000-4000-8000-0000000000c2', '12220000-0000-4000-8000-0000000000a1', '12220000-0000-4000-8000-0000000000b1', 'Brightwater'),
  ('12220000-0000-4000-8000-0000000000c9', '12220000-0000-4000-8000-0000000000a3', '12220000-0000-4000-8000-0000000000b2', 'Farholt');

-- ── The DM ─────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '12220000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Entered from Brightwater's end, with a name that has stray spaces.
select lives_ok(
  $$ insert into public.location_roads (campaign_id, from_location_id, to_location_id, distance, name)
     values ('12220000-0000-4000-8000-0000000000b1', '12220000-0000-4000-8000-0000000000c2', '12220000-0000-4000-8000-0000000000c1', 40, '  the coast road ') $$,
  'a DM adds a road between two places of their campaign'
);
select is(
  (select from_location_id::text || ' ' || to_location_id::text from public.location_roads),
  '12220000-0000-4000-8000-0000000000c1 12220000-0000-4000-8000-0000000000c2',
  'the two ends are stored in one order, whichever end it was entered from'
);
select is((select name from public.location_roads), 'the coast road', 'a name is kept without its stray spaces');
select is((select unit || ' ' || going from public.location_roads), 'mi road', 'miles and a road unless said otherwise');

select lives_ok(
  $$ insert into public.location_roads (campaign_id, from_location_id, to_location_id, distance, name, going)
     values ('12220000-0000-4000-8000-0000000000b1', '12220000-0000-4000-8000-0000000000c1', '12220000-0000-4000-8000-0000000000c2', 55, 'the pass', 'track') $$,
  'the same two places may be joined by a second road'
);

-- The "second road" above is the positive control: a different name between the same pair is let in.
select throws_ok(
  $$ insert into public.location_roads (campaign_id, from_location_id, to_location_id, distance, name)
     values ('12220000-0000-4000-8000-0000000000b1', '12220000-0000-4000-8000-0000000000c1', '12220000-0000-4000-8000-0000000000c2', 41, 'the coast road ') $$,
  '23505', null, 'a road cannot be entered twice by swapping its ends'
);
select throws_ok(
  $$ insert into public.location_roads (campaign_id, from_location_id, to_location_id, distance)
     values ('12220000-0000-4000-8000-0000000000b1', '12220000-0000-4000-8000-0000000000c1', '12220000-0000-4000-8000-0000000000c1', 5) $$,
  '23514', null, 'a road joins two places, not one to itself'
);
select throws_ok(
  $$ insert into public.location_roads (campaign_id, from_location_id, to_location_id, distance)
     values ('12220000-0000-4000-8000-0000000000b1', '12220000-0000-4000-8000-0000000000c1', '12220000-0000-4000-8000-0000000000c2', 0) $$,
  '23514', null, 'a road has a length'
);
select throws_ok(
  $$ insert into public.location_roads (campaign_id, from_location_id, to_location_id, distance)
     values ('12220000-0000-4000-8000-0000000000b1', '12220000-0000-4000-8000-0000000000c1', '12220000-0000-4000-8000-0000000000c9', 12) $$,
  '23514', null, 'a road cannot lead to a place of another campaign'
);

-- ── A player of the campaign ───────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12220000-0000-4000-8000-0000000000a2', true);
-- The DM's reads above are the positive control: these come back empty because they are refused.
select is((select count(*)::integer from public.location_roads), 0, 'a player does not read the roads table');
select throws_ok(
  $$ insert into public.location_roads (campaign_id, from_location_id, to_location_id, distance)
     values ('12220000-0000-4000-8000-0000000000b1', '12220000-0000-4000-8000-0000000000c1', '12220000-0000-4000-8000-0000000000c2', 3) $$,
  '42501', null, 'nor adds one'
);

-- ── A DM of another campaign ───────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12220000-0000-4000-8000-0000000000a3', true);
select is((select count(*)::integer from public.location_roads), 0, 'another campaign''s DM reads none of them');
select throws_ok(
  $$ insert into public.location_roads (campaign_id, from_location_id, to_location_id, distance)
     values ('12220000-0000-4000-8000-0000000000b1', '12220000-0000-4000-8000-0000000000c1', '12220000-0000-4000-8000-0000000000c2', 3) $$,
  '42501', null, 'nor adds one to a campaign that is not theirs'
);

-- ── A road's own table (20261118 location_roads_roll_table) ────────────────
reset role;
insert into public.roll_tables (id, user_id, campaign_id, name, dice) values
  ('12220000-0000-4000-8000-0000000000e1', '12220000-0000-4000-8000-0000000000a1', '12220000-0000-4000-8000-0000000000b1', 'The coast road', '1d6'),
  ('12220000-0000-4000-8000-0000000000e9', '12220000-0000-4000-8000-0000000000a3', '12220000-0000-4000-8000-0000000000b2', 'Elsewhere''s table', '1d6');
set local role authenticated;
select set_config('request.jwt.claim.sub', '12220000-0000-4000-8000-0000000000a1', true);
select lives_ok(
  $$ update public.location_roads set roll_table_id = '12220000-0000-4000-8000-0000000000e1' where campaign_id = '12220000-0000-4000-8000-0000000000b1' $$,
  'a road takes a table of its own campaign'
);
-- Bug caught: a road pointed at another campaign's table, whose entries the narrator would then read out.
select throws_ok(
  $$ update public.location_roads set roll_table_id = '12220000-0000-4000-8000-0000000000e9' where campaign_id = '12220000-0000-4000-8000-0000000000b1' $$,
  '23514', null, 'and never a table of another campaign'
);
reset role;
delete from public.roll_tables where id = '12220000-0000-4000-8000-0000000000e1';
select is(
  (select count(*)::integer from public.location_roads where campaign_id = '12220000-0000-4000-8000-0000000000b1' and roll_table_id is null),
  (select count(*)::integer from public.location_roads where campaign_id = '12220000-0000-4000-8000-0000000000b1'),
  'a table that goes leaves its roads standing, with no table'
);

-- ── The campaign changes hands ─────────────────────────────────────────────
-- Bug caught (20261118080453): roads left with the outgoing owner, whose account deletion would cascade them away.
reset role;
select private.move_campaign_content('12220000-0000-4000-8000-0000000000b1', '12220000-0000-4000-8000-0000000000a1', '12220000-0000-4000-8000-0000000000a2', false, false);
select is(
  (select count(*)::integer from public.location_roads where campaign_id = '12220000-0000-4000-8000-0000000000b1' and user_id <> '12220000-0000-4000-8000-0000000000a2'),
  0, 'a campaign that changes hands takes its roads to the new owner'
);

-- ── A place that goes takes its roads ──────────────────────────────────────
delete from public.locations where id = '12220000-0000-4000-8000-0000000000c2';
select is((select count(*)::integer from public.location_roads where campaign_id = '12220000-0000-4000-8000-0000000000b1'), 0, 'deleting a place removes the roads that led to it');

select * from finish();
rollback;
