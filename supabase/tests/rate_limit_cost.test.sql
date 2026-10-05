begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

-- check_rate_limit's cost (#972, migration 20261005075217): a batch spends as
-- many units as it does work, and is refused whole when it does not fit.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('97310000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rate-limit@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

select ok(public.check_rate_limit('97310000-0000-4000-8000-000000000001', 'cost-test', 5, 60), 'a call without a cost spends one unit, as before');
select ok(public.check_rate_limit('97310000-0000-4000-8000-000000000001', 'cost-test', 5, 60, 3), 'a batch that fits is allowed');
select ok(not public.check_rate_limit('97310000-0000-4000-8000-000000000001', 'cost-test', 5, 60, 2), 'a batch that would overshoot the limit is refused whole');
select is(
  (select count(*)::int from public.rate_limit_events where user_id = '97310000-0000-4000-8000-000000000001' and action = 'cost-test'),
  4,
  'a refused batch records nothing; an allowed one records its full cost'
);
select throws_ok(
  $$ select public.check_rate_limit('97310000-0000-4000-8000-000000000001', 'cost-test', 5, 60, 0) $$,
  'check_rate_limit: cost must be at least 1',
  'a zero cost cannot buy a free pass'
);
select ok(
  not has_function_privilege('authenticated', 'public.check_rate_limit(uuid,text,integer,integer,integer)', 'EXECUTE'),
  'only the service role can charge the limiter'
);

select * from finish();
rollback;
