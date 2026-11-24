-- #1021 row 23: a correction puts the campaign's date back (`rewind_campaign_date`, security invoker; 20261124115638).
--   1 Dana  owner and DM   2 Pia  player at the table   3 Sam  a stranger
-- The campaigns update policy decides who may move the date: the DM may, a player and a stranger may not. Days outside
-- 1 to 60 are refused. Counting back is checked on a small custom calendar whose festival day sits between months:
--   three months of 30 days and one festival day after the first, so a year is 91 days.

begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('11240000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'rewind-date-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 3) as n;

insert into public.campaigns (id, user_id, name, game_system, calendar_id, current_year, current_month, current_day) values
  ('11240000-0000-4000-8000-0000000000c1', '11240000-0000-4000-8000-000000000001', 'Dated table', 'dnd5e-2014', 'custom', 1492, 2, 3);
update public.campaigns
   set custom_calendar = '{"months":[{"name":"Frost","days":30},{"name":"Thaw","days":30},{"name":"Bloom","days":30}],"intercalaryDays":[{"name":"Lantern Night","afterMonth":1}]}'::jsonb
 where id = '11240000-0000-4000-8000-0000000000c1';

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('11240000-0000-4000-8000-0000000000c1', '11240000-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('11240000-0000-4000-8000-0000000000c1', '11240000-0000-4000-8000-000000000002', 'player', 'Pia')
on conflict (campaign_id, user_id) do update set role = excluded.role;

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"11240000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;
-- Read past RLS, so a refused call is checked against the row as it really is.
create function pg_temp.today() returns text language sql security definer as $$
  select current_year || '-' || current_month || '-' || current_day from public.campaigns
   where id = '11240000-0000-4000-8000-0000000000c1';
$$;
create function pg_temp.set_day(p_year int, p_month int, p_day int) returns void language sql security definer as $$
  update public.campaigns set current_year = p_year, current_month = p_month, current_day = p_day
   where id = '11240000-0000-4000-8000-0000000000c1';
$$;

set local role authenticated;

select pg_temp.as_user(2);
select throws_ok($$ select * from public.rewind_campaign_date('11240000-0000-4000-8000-0000000000c1', 5) $$, '42501', null,
  'a player cannot put the date back');
select is(pg_temp.today(), '1492-2-3', 'the refused player left the date as it was');

select pg_temp.as_user(3);
select throws_ok($$ select * from public.rewind_campaign_date('11240000-0000-4000-8000-0000000000c1', 5) $$, 'P0002', null,
  'a stranger cannot put the date back');

select pg_temp.as_user(1);
-- 2-3 is the 34th day (30 + Lantern Night + 3); back 5 is the 29th: 1-29, the festival counted as the day it is.
select results_eq($$ select year, month, day from public.rewind_campaign_date('11240000-0000-4000-8000-0000000000c1', 5) $$,
  $$ values (1492, 1, 29) $$, 'back across the festival day, which counts as a day');
select is(pg_temp.today(), '1492-1-29', 'the campaign row holds the earlier date');

-- 1-2 back 5: into 1491, its 88th day of 91. 61 days come before month 3 (30 + 1 + 30), so 3-27.
select pg_temp.set_day(1492, 1, 2);
select results_eq($$ select year, month, day from public.rewind_campaign_date('11240000-0000-4000-8000-0000000000c1', 5) $$,
  $$ values (1491, 3, 27) $$, 'back into the year before, on that year''s own length');

-- 2-1 back 1 lands on the festival day itself, which is no month's day: it steps back to 1-30, never forward to 2-1 again.
select pg_temp.set_day(1492, 2, 1);
select results_eq($$ select year, month, day from public.rewind_campaign_date('11240000-0000-4000-8000-0000000000c1', 1) $$,
  $$ values (1492, 1, 30) $$, 'a day back onto a festival day steps back off it, not forward');

-- Forward and back again is where it started (advance_campaign_date, 20261120215933).
select pg_temp.set_day(1492, 3, 25);
select results_eq($$ select r.year, r.month, r.day from public.advance_campaign_date('11240000-0000-4000-8000-0000000000c1', 40) a,
                     lateral public.rewind_campaign_date('11240000-0000-4000-8000-0000000000c1', 40) r $$,
  $$ values (1492, 3, 25) $$, 'forty days on into the next year and past its festival, then forty back, is the same day');

select throws_ok($$ select * from public.rewind_campaign_date('11240000-0000-4000-8000-0000000000c1', 0) $$, '22023', null,
  'zero days is refused');
select throws_ok($$ select * from public.rewind_campaign_date('11240000-0000-4000-8000-0000000000c1', 61) $$, '22023', null,
  'more than sixty days is refused');

select * from finish();
rollback;
