-- #812: an archived campaign does not occupy a plan slot, in both quota
-- functions, because the downgrade picker's whole promise depends on it.

begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('81200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue812-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, is_archived) values
  ('81200000-0000-4000-8000-000000000010', '81200000-0000-4000-8000-000000000001', 'The live one',   false),
  ('81200000-0000-4000-8000-000000000011', '81200000-0000-4000-8000-000000000001', 'Shelved in 2025', true),
  ('81200000-0000-4000-8000-000000000012', '81200000-0000-4000-8000-000000000001', 'Also shelved',   true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81200000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Three owned, two archived. The number that matters is one.
select is(
  (public.check_quota('campaigns') ->> 'current')::integer,
  1,
  'check_quota counts only the campaigns that are actually running'
);

select is(
  (public.check_all_quotas() -> 'campaigns' ->> 'current')::integer,
  1,
  'and check_all_quotas agrees — the two must not hold different opinions of one fact'
);

-- At a free limit of 1 with 1 active campaign the DM is AT the limit, so
-- `allowed` is correctly false. The bug was never that they could not create a
-- second — it was that the count said 3 while the screen said 1, leaving them
-- told they were over a limit with no action that could change it. Archiving
-- the last one frees the slot outright, which is the promise the picker makes.
reset role;
update public.campaigns set is_archived = true where id = '81200000-0000-4000-8000-000000000010';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81200000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select ok(
  (public.check_quota('campaigns') ->> 'allowed')::boolean,
  'archiving every campaign frees the slot, so the DM can start a fresh one'
);

reset role;
update public.campaigns set is_archived = false where id = '81200000-0000-4000-8000-000000000010';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81200000-0000-4000-8000-000000000001","role":"authenticated"}', true);

reset role;
update public.campaigns set is_archived = false where id = '81200000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81200000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (public.check_quota('campaigns') ->> 'current')::integer,
  2,
  'and restoring one takes its slot back'
);

reset role;
select * from finish();
rollback;
