begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- A campaign's own terrains and ways of travelling (#1222 decision 9): the DM's, like its roads. A way may be
-- pulled by a companion of the same campaign only.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12222000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ways-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12222000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ways-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12222000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ways-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12222000-0000-4000-8000-0000000000b1', '12222000-0000-4000-8000-0000000000a1', 'Icewind Dale', 'dnd5e-2014'),
  ('12222000-0000-4000-8000-0000000000b2', '12222000-0000-4000-8000-0000000000a3', 'Elsewhere', 'dnd5e-2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('12222000-0000-4000-8000-0000000000b1', '12222000-0000-4000-8000-0000000000a1', 'dm', 'DM'),
  ('12222000-0000-4000-8000-0000000000b1', '12222000-0000-4000-8000-0000000000a2', 'player', 'Player'),
  ('12222000-0000-4000-8000-0000000000b2', '12222000-0000-4000-8000-0000000000a3', 'dm', 'Other DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.companions (id, user_id, campaign_id, name, companion_type, source_type, max_hp, current_hp, ac, speed) values
  ('12222000-0000-4000-8000-0000000000c1', '12222000-0000-4000-8000-0000000000a1', '12222000-0000-4000-8000-0000000000b1', 'Snowbeak', 'mount', 'custom', 19, 19, 11, 50),
  ('12222000-0000-4000-8000-0000000000c9', '12222000-0000-4000-8000-0000000000a3', '12222000-0000-4000-8000-0000000000b2', 'Someone else''s horse', 'mount', 'custom', 13, 13, 10, 60);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The DM ─────────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12222000-0000-4000-8000-0000000000a1', true);
select lives_ok(
  $$ insert into public.travel_ways (campaign_id, key, name, kind, companion_id, at_home)
     values ('12222000-0000-4000-8000-0000000000b1', 'beak_sled', 'Dogsled (axe beak)', 'vehicle', '12222000-0000-4000-8000-0000000000c1', '{snow}') $$,
  'a DM adds a sled pulled by the campaign''s own axe beak (positive control)'
);
select lives_ok(
  $$ insert into public.travel_terrains (campaign_id, key, name, factor, sink)
     values ('12222000-0000-4000-8000-0000000000b1', 'snow', 'Deep snow', 0.25, 0.25) $$,
  'a DM overrides a preset terrain by its key'
);
select throws_ok(
  $$ insert into public.travel_ways (campaign_id, key, name, kind, companion_id)
     values ('12222000-0000-4000-8000-0000000000b1', 'stolen', 'A horse from elsewhere', 'ride', '12222000-0000-4000-8000-0000000000c9') $$,
  null, null, 'a way cannot be pulled by another campaign''s companion'
);
select throws_ok(
  $$ insert into public.travel_terrains (campaign_id, key, name, factor)
     values ('12222000-0000-4000-8000-0000000000b1', 'snow', 'Snow again', 0.5) $$,
  '23505', null, 'one row per key in a campaign'
);

-- ── A player ───────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12222000-0000-4000-8000-0000000000a2', true);
select is_empty($$ select 1 from public.travel_ways $$, 'a player does not read the DM''s ways of travelling');
select throws_ok(
  $$ insert into public.travel_terrains (campaign_id, key, name, factor) values ('12222000-0000-4000-8000-0000000000b1', 'mud', 'Mud', 0.5) $$,
  '42501', null, 'a player cannot add a terrain'
);

-- ── Another campaign's DM ──────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12222000-0000-4000-8000-0000000000a3', true);
select is_empty($$ select 1 from public.travel_terrains $$, 'another campaign''s DM reads none of them');

select * from finish();
rollback;
