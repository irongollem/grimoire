begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

-- Access rules for a campaign's cadence and players' absences (#1213,
-- 20261116074905). The rhythm is the DM's to set and the table's to read; an
-- absence is the player's own to say and the table's to read. Each refusal has
-- a positive control beside it, so a policy that refuses everyone fails too.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('7a5b0000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cad-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('7a5b0000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cad-p1@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('7a5b0000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cad-p2@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('7a5b0000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cad-out@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('7a5b0000-0000-4000-8000-000000000010', '7a5b0000-0000-4000-8000-000000000001', 'Cadence campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values
  ('7a5b0000-0000-4000-8000-000000000010', '7a5b0000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('7a5b0000-0000-4000-8000-000000000010', '7a5b0000-0000-4000-8000-000000000002', 'player', 'P1'),
  ('7a5b0000-0000-4000-8000-000000000010', '7a5b0000-0000-4000-8000-000000000003', 'player', 'P2')
on conflict (campaign_id, user_id) do update set role = excluded.role;

set local role authenticated;

-- ── The rhythm ───────────────────────────────────────────────────────────────

select set_config('request.jwt.claims', '{"sub":"7a5b0000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.session_cadences (campaign_id, user_id, repeat, weekday, start_time, starts_on)
     values ('7a5b0000-0000-4000-8000-000000000010', '7a5b0000-0000-4000-8000-000000000002', 'weekly', 4, '19:30', current_date) $$,
  '42501', null, 'a player cannot set the table''s rhythm');

select set_config('request.jwt.claims', '{"sub":"7a5b0000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.session_cadences (campaign_id, user_id, repeat, weekday, start_time, starts_on)
     values ('7a5b0000-0000-4000-8000-000000000010', '7a5b0000-0000-4000-8000-000000000001', 'weekly', 4, '19:30', current_date) $$,
  'the DM sets it');

select throws_ok(
  $$ insert into public.session_cadences (campaign_id, user_id, repeat, weekday, start_time, starts_on)
     values ('7a5b0000-0000-4000-8000-000000000010', '7a5b0000-0000-4000-8000-000000000001', 'monthly', 4, '19:30', current_date) $$,
  '23514', null, 'a monthly rhythm without a week of the month is refused');

select set_config('request.jwt.claims', '{"sub":"7a5b0000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.session_cadences), 1, 'a player reads the rhythm');
select is_empty(
  $$ update public.session_cadences set weekday = 5 returning id $$,
  'a player cannot change it');

select set_config('request.jwt.claims', '{"sub":"7a5b0000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from public.session_cadences), 0, 'someone outside the campaign reads nothing');

-- ── "I can't make it" ────────────────────────────────────────────────────────

select set_config('request.jwt.claims', '{"sub":"7a5b0000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.session_absences (campaign_id, user_id, absent_on)
     values ('7a5b0000-0000-4000-8000-000000000010', '7a5b0000-0000-4000-8000-000000000002', current_date + 3) $$,
  'a player says they cannot make an evening');
select throws_ok(
  $$ insert into public.session_absences (campaign_id, user_id, absent_on)
     values ('7a5b0000-0000-4000-8000-000000000010', '7a5b0000-0000-4000-8000-000000000003', current_date + 3) $$,
  '42501', null, 'a player cannot say it for someone else');

select set_config('request.jwt.claims', '{"sub":"7a5b0000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is_empty(
  $$ delete from public.session_absences returning id $$,
  'another player cannot take back someone''s absence');

select set_config('request.jwt.claims', '{"sub":"7a5b0000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.session_absences), 1, 'the DM sees who is out');

select * from finish();
rollback;
