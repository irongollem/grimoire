begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

-- The admin list counts an account's campaigns with AI on (20261123190249).
-- What it must get right: only an explicit `true` counts (an unchosen campaign
-- is AI off everywhere else, so it is off here too), and the demo copy is left
-- out exactly as campaigns_owned leaves it out, so the two share a denominator.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at)
values
  ('11230000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-dm@example.invalid',    '', '{"provider":"email"}'::jsonb, '{}'::jsonb, now()),
  ('11230000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-admin@example.invalid', '', '{"provider":"email","role":"admin"}'::jsonb, '{}'::jsonb, now());

insert into public.campaigns (id, user_id, name, ai_enabled, demo_source)
values
  ('11230000-0000-4000-8000-0000000000c1', '11230000-0000-4000-8000-000000000001', 'On',          true,  null),
  ('11230000-0000-4000-8000-0000000000c2', '11230000-0000-4000-8000-000000000001', 'Declined',    false, null),
  ('11230000-0000-4000-8000-0000000000c3', '11230000-0000-4000-8000-000000000001', 'Not chosen',  null,  null),
  ('11230000-0000-4000-8000-0000000000c4', '11230000-0000-4000-8000-000000000001', 'Demo copy',   true,  'demo');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11230000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);

select is(
  (select campaigns_ai_on from public.get_admin_users() where user_id = '11230000-0000-4000-8000-000000000001'),
  1,
  'only the campaign switched on counts: declined, unchosen and the demo copy do not');

select is(
  (select campaigns_owned from public.get_admin_users() where user_id = '11230000-0000-4000-8000-000000000001'),
  3,
  'out of the same campaigns campaigns_owned counts, the demo copy excluded');

select is(
  (select campaigns_ai_on from public.get_admin_users() where user_id = '11230000-0000-4000-8000-000000000002'),
  0,
  'an account with no campaigns counts zero, not null');
reset role;

select * from finish();
rollback;
