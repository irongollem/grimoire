begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- A feature released to chosen accounts only (#1021, `20261119125826`). What would go wrong silently: an account
-- granting itself the AI table, a stranger learning who has it, or a player unable to see that their own Dungeon
-- Master's table is open (their sheet's switch would never show).

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10270000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fa-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10270000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fa-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10270000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fa-stranger@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10270000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fa-admin@example.invalid', '', '{"role":"admin"}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system)
values ('10270000-0000-4000-8000-000000000010', '10270000-0000-4000-8000-000000000001', 'Flagged campaign', 'dnd5e-2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('10270000-0000-4000-8000-000000000010', '10270000-0000-4000-8000-000000000001', 'dm', 'The DM'),
  ('10270000-0000-4000-8000-000000000010', '10270000-0000-4000-8000-000000000002', 'player', 'A player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- ── The Dungeon Master, before any grant ────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10270000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email"}}', true);
select throws_ok(
  $$ insert into public.feature_access (user_id, feature) values ('10270000-0000-4000-8000-000000000001', 'ai_table') $$,
  '42501', null, 'an account cannot grant itself the AI table'
);
reset role;

-- ── An app admin grants it ──────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10270000-0000-4000-8000-000000000004","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);
select lives_ok(
  $$ insert into public.feature_access (user_id, feature, granted_by) values ('10270000-0000-4000-8000-000000000001', 'ai_table', '10270000-0000-4000-8000-000000000004') $$,
  'an app admin grants it'
);
reset role;

-- ── Who can see the grant ───────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10270000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email"}}', true);
select is((select count(*)::integer from public.feature_access where user_id = '10270000-0000-4000-8000-000000000001'), 1, 'the account reads its own grant');
delete from public.feature_access where user_id = '10270000-0000-4000-8000-000000000001';
reset role;
select is((select count(*)::integer from public.feature_access where user_id = '10270000-0000-4000-8000-000000000001'), 1, 'and cannot take it away from itself either (the grant is the admin''s)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10270000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"email"}}', true);
select is((select count(*)::integer from public.feature_access where user_id = '10270000-0000-4000-8000-000000000001'), 1, 'a player in the campaign sees that its owner has the table');
select throws_ok(
  $$ insert into public.feature_access (user_id, feature) values ('10270000-0000-4000-8000-000000000002', 'ai_table') $$,
  '42501', null, 'and cannot grant it to themselves'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10270000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"provider":"email"}}', true);
select is((select count(*)::integer from public.feature_access), 0, 'someone outside the campaign sees no grants at all');
reset role;

select * from finish();
rollback;
