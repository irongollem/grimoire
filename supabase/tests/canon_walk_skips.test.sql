begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- 20261126084426_canon_walk_skips (#1282): the sections a DM skipped in "Design it with me". The DMs of the campaign
-- read and write them; a player and another campaign's DM read nothing and write nothing; the pitch is never skipped.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12820000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'walk-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12820000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'walk-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12820000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'walk-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12820000-0000-4000-8000-000000000010', '12820000-0000-4000-8000-000000000001', 'The Long Walk', 'dnd5e-2014'),
  ('12820000-0000-4000-8000-000000000011', '12820000-0000-4000-8000-000000000003', 'Elsewhere', 'dnd5e-2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('12820000-0000-4000-8000-000000000010', '12820000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('12820000-0000-4000-8000-000000000010', '12820000-0000-4000-8000-000000000002', 'player', 'Player'),
  ('12820000-0000-4000-8000-000000000011', '12820000-0000-4000-8000-000000000003', 'dm', 'Other DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The DM ──────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12820000-0000-4000-8000-000000000001', true);
select lives_ok($$
  insert into public.canon_walk_skips (campaign_id, section) values ('12820000-0000-4000-8000-000000000010', 'arcs')
$$, 'the DM skips a section (positive control)');
select is((select count(*)::int from public.canon_walk_skips), 1, 'and reads it back');
select throws_ok($$
  insert into public.canon_walk_skips (campaign_id, section) values ('12820000-0000-4000-8000-000000000010', 'pitch')
$$, '23514', null, 'the pitch is never skipped: every draft after it reads it');
select throws_ok($$
  insert into public.canon_walk_skips (campaign_id, section) values ('12820000-0000-4000-8000-000000000010', 'arcs')
$$, '23505', null, 'a section is skipped once per campaign');

-- ── A player of the campaign ───────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12820000-0000-4000-8000-000000000002', true);
select is_empty($$ select id from public.canon_walk_skips $$, 'a player reads none of the DM''s walk');
select throws_ok($$
  insert into public.canon_walk_skips (campaign_id, section) values ('12820000-0000-4000-8000-000000000010', 'lore')
$$, '42501', null, 'a player cannot skip a section');

-- ── Another campaign's DM ──────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12820000-0000-4000-8000-000000000003', true);
select is_empty($$ select id from public.canon_walk_skips $$, 'another campaign''s DM reads none of it');
select throws_ok($$
  insert into public.canon_walk_skips (campaign_id, section) values ('12820000-0000-4000-8000-000000000010', 'lore')
$$, '42501', null, 'nor skips a section in it');

select * from finish();
rollback;
