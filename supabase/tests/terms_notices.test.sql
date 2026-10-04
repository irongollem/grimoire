begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

-- terms_notices (20261004184012): the per-account record of who was emailed
-- about which Terms version. Written by the admin's send-terms-notice function
-- with the service role; an account can at most read its own rows.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('97200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tn-a@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('97200000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tn-b@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.terms_notices (user_id, terms_version, sent_at) values
  ('97200000-0000-4000-8000-000000000001', '2026-09-28', now()),
  ('97200000-0000-4000-8000-000000000002', '2026-09-28', now());

select throws_ok(
  $$ insert into public.terms_notices (user_id, terms_version, sent_at)
     values ('97200000-0000-4000-8000-000000000001', '2026-09-28', now()) $$,
  '23505', null, 'an account is recorded once per version, so a re-run cannot mail it twice');

select throws_ok(
  $$ insert into public.terms_notices (user_id, terms_version)
     values ('97200000-0000-4000-8000-000000000001', '2026-10-01') $$,
  '23514', null, 'a row records an outcome: sent or failed');

select lives_ok(
  $$ insert into public.admin_audit_log (admin_user_id, action, target_user_id, details)
     values ('97200000-0000-4000-8000-000000000001', 'terms_notice_sent', null,
             '{"terms_version": "2026-09-28", "sent": 2, "failed": 0}'::jsonb) $$,
  'a send run is an audit action with no single target');

set local role authenticated;
select set_config('request.jwt.claim.sub', '97200000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select array_agg(user_id) from public.terms_notices),
  array['97200000-0000-4000-8000-000000000001']::uuid[],
  'an account reads only its own notice rows');

select is_empty(
  $$ delete from public.terms_notices where user_id = '97200000-0000-4000-8000-000000000002' returning user_id $$,
  'and cannot touch anyone else''s');

select * from finish();
rollback;
