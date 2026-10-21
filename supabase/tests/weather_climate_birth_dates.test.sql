-- #1086 / 20261021164506: climate on campaigns and places, birth dates on
-- NPCs and characters. The constraints are the whole of the database's part
-- (weather and ages are computed on the client), so they are what is pinned.

begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('10861000-0000-4000-8000-100000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wx1086-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values
  ('10861000-0000-4000-8000-200000000001', '10861000-0000-4000-8000-100000000001', 'Weather table');

select is((select climate from public.campaigns where id = '10861000-0000-4000-8000-200000000001'),
  'temperate', 'a campaign starts temperate');

select throws_ok($q$
  update public.campaigns set climate = 'balmy' where id = '10861000-0000-4000-8000-200000000001'
$q$, '23514', null, 'a campaign climate outside the set is refused');

select lives_ok($q$
  insert into public.locations (id, user_id, campaign_id, name, location_type)
  values ('10861000-0000-4000-8000-300000000001', '10861000-0000-4000-8000-100000000001',
          '10861000-0000-4000-8000-200000000001', 'Icewind Dale', 'region')
$q$, 'a place may leave its climate unset');

select is((select climate from public.locations where id = '10861000-0000-4000-8000-300000000001'),
  null, 'an unset place climate is null, which inherits');

select throws_ok($q$
  update public.locations set climate = 'balmy' where id = '10861000-0000-4000-8000-300000000001'
$q$, '23514', null, 'a place climate outside the set is refused');

select lives_ok($q$
  insert into public.npcs (id, user_id, campaign_id, name, born_year)
  values ('10861000-0000-4000-8000-400000000001', '10861000-0000-4000-8000-100000000001',
          '10861000-0000-4000-8000-200000000001', 'Old Bren', 1448)
$q$, 'a birth year alone is a birth date');

select throws_ok($q$
  update public.npcs set born_month = 3 where id = '10861000-0000-4000-8000-400000000001'
$q$, '23514', null, 'a month without a day is refused');

select throws_ok($q$
  update public.npcs set born_year = null, born_month = 3, born_day = 12 where id = '10861000-0000-4000-8000-400000000001'
$q$, '23514', null, 'a month and day without a year are refused');

select lives_ok($q$
  update public.npcs set born_month = 3, born_day = 12 where id = '10861000-0000-4000-8000-400000000001'
$q$, 'year, month and day together are a full birth date');

-- The player projections name their columns by position; a column added to
-- the table without them fails here ("final statement returns too few columns").
select lives_ok($q$ select * from public.get_player_visible_locations(null, null) $q$,
  'the player places projection still matches the locations table');
select lives_ok($q$ select * from public.get_player_visible_npcs(null, null, null) $q$,
  'the player NPC projection still matches the npcs table');

select * from finish();
rollback;
