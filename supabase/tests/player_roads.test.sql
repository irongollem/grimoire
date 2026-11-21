begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- What a player reads of a road (#1222): a road only when both its places are shown to them, without its
-- encounter table. A stranger is refused, and a DM previews only a character of their own campaign.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12221000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proads-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12221000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proads-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12221000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proads-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12221000-0000-4000-8000-0000000000b1', '12221000-0000-4000-8000-0000000000a1', 'The Coast', 'dnd5e-2024'),
  ('12221000-0000-4000-8000-0000000000b2', '12221000-0000-4000-8000-0000000000a3', 'Elsewhere', 'dnd5e-2024');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('12221000-0000-4000-8000-0000000000d1', '12221000-0000-4000-8000-0000000000a2', '12221000-0000-4000-8000-0000000000b1', 'Wren', '2024'),
  ('12221000-0000-4000-8000-0000000000d9', '12221000-0000-4000-8000-0000000000a3', '12221000-0000-4000-8000-0000000000b2', 'Stranger', '2024');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('12221000-0000-4000-8000-0000000000b1', '12221000-0000-4000-8000-0000000000a1', 'dm', 'DM', null),
  ('12221000-0000-4000-8000-0000000000b1', '12221000-0000-4000-8000-0000000000a2', 'player', 'Player', '12221000-0000-4000-8000-0000000000d1'),
  ('12221000-0000-4000-8000-0000000000b2', '12221000-0000-4000-8000-0000000000a3', 'dm', 'Other DM', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

-- Harbour and Brightwater are known to Wren; the Ford is not.
insert into public.locations (id, user_id, campaign_id, name, player_visible_to) values
  ('12221000-0000-4000-8000-0000000000c1', '12221000-0000-4000-8000-0000000000a1', '12221000-0000-4000-8000-0000000000b1', 'Harbour', '{12221000-0000-4000-8000-0000000000d1}'),
  ('12221000-0000-4000-8000-0000000000c2', '12221000-0000-4000-8000-0000000000a1', '12221000-0000-4000-8000-0000000000b1', 'Brightwater', '{12221000-0000-4000-8000-0000000000d1}'),
  ('12221000-0000-4000-8000-0000000000c3', '12221000-0000-4000-8000-0000000000a1', '12221000-0000-4000-8000-0000000000b1', 'The Ford', '{}');

insert into public.location_roads (id, user_id, campaign_id, from_location_id, to_location_id, distance, name, terrain) values
  ('12221000-0000-4000-8000-0000000000e1', '12221000-0000-4000-8000-0000000000a1', '12221000-0000-4000-8000-0000000000b1', '12221000-0000-4000-8000-0000000000c1', '12221000-0000-4000-8000-0000000000c2', 40, 'the coast road', 'road'),
  ('12221000-0000-4000-8000-0000000000e2', '12221000-0000-4000-8000-0000000000a1', '12221000-0000-4000-8000-0000000000b1', '12221000-0000-4000-8000-0000000000c2', '12221000-0000-4000-8000-0000000000c3', 12, 'the marsh path', 'difficult');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The player ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12221000-0000-4000-8000-0000000000a2', true);

select is(
  (select array_agg(name order by name) from public.get_player_roads('12221000-0000-4000-8000-0000000000b1')),
  array['the coast road'],
  'a player reads the road between two places they know (positive control)'
);
select is_empty(
  $$ select 1 from public.get_player_roads('12221000-0000-4000-8000-0000000000b1') where name = 'the marsh path' $$,
  'a road to a place the player does not know is not read'
);
select is_empty(
  $$ select 1 from public.location_roads $$,
  'the table itself stays the DM''s'
);

-- ── A stranger ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12221000-0000-4000-8000-0000000000a3', true);
select throws_ok(
  $$ select * from public.get_player_roads('12221000-0000-4000-8000-0000000000b1') $$,
  '42501', null, 'someone outside the campaign is refused'
);

-- ── The DM ─────────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12221000-0000-4000-8000-0000000000a1', true);
select is(
  (select count(*)::int from public.get_player_roads('12221000-0000-4000-8000-0000000000b1', '12221000-0000-4000-8000-0000000000d1')),
  1,
  'a DM previewing a character reads what that character would'
);
select is_empty(
  $$ select 1 from public.get_player_roads('12221000-0000-4000-8000-0000000000b1') $$,
  'a DM with no character previewed reads nothing here (the table is theirs to read)'
);
select throws_ok(
  $$ select * from public.get_player_roads('12221000-0000-4000-8000-0000000000b1', '12221000-0000-4000-8000-0000000000d9') $$,
  '22023', null, 'a DM cannot preview a character of another campaign'
);

select * from finish();
rollback;
