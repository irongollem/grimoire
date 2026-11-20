-- #1021: the server moves a campaign's date itself (`advance_campaign_date`, security invoker).
--   1 Dana  owner and DM   2 Pia  player at the table   3 Sam  a stranger
-- The campaigns update policy decides who may move the date: the DM may, a player and a stranger may not. Days outside
-- 1 to 60 are refused. Each refusal is checked to change nothing.

begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('10210000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'advance-date-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 3) as n;

insert into public.campaigns (id, user_id, name, game_system, calendar_id, current_year, current_month, current_day) values
  ('10210000-0000-4000-8000-0000000000c1', '10210000-0000-4000-8000-000000000001', 'Dated table', 'dnd5e-2014', 'harptos', 1492, 1, 10);

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('10210000-0000-4000-8000-0000000000c1', '10210000-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('10210000-0000-4000-8000-0000000000c1', '10210000-0000-4000-8000-000000000002', 'player', 'Pia')
on conflict (campaign_id, user_id) do update set role = excluded.role;

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"10210000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;
-- Read past RLS, so a refused call is checked against the row as it really is.
create function pg_temp.today() returns text language sql security definer as $$
  select current_year || '-' || current_month || '-' || current_day from public.campaigns
   where id = '10210000-0000-4000-8000-0000000000c1';
$$;

set local role authenticated;

-- A player at the table can read the campaign but not move its time.
select pg_temp.as_user(2);
select throws_ok($$ select * from public.advance_campaign_date('10210000-0000-4000-8000-0000000000c1', 5) $$, '42501', null,
  'a player cannot move the date');
select is(pg_temp.today(), '1492-1-10', 'the refused player left the date as it was');

-- A stranger cannot see the campaign at all.
select pg_temp.as_user(3);
select throws_ok($$ select * from public.advance_campaign_date('10210000-0000-4000-8000-0000000000c1', 5) $$, 'P0002', null,
  'a stranger cannot move the date');

-- The DM moves it on the campaign's own calendar (Harptos: day 10 + 5 = day 15 of the same month).
select pg_temp.as_user(1);
select results_eq($$ select year, month, day from public.advance_campaign_date('10210000-0000-4000-8000-0000000000c1', 5) $$,
  $$ values (1492, 1, 15) $$, 'the DM moves the date five days');
select is(pg_temp.today(), '1492-1-15', 'the campaign row holds the new date');

-- Out of range.
select throws_ok($$ select * from public.advance_campaign_date('10210000-0000-4000-8000-0000000000c1', 0) $$, '22023', null,
  'zero days is refused');
select throws_ok($$ select * from public.advance_campaign_date('10210000-0000-4000-8000-0000000000c1', 61) $$, '22023', null,
  'more than sixty days is refused');

select * from finish();
rollback;
