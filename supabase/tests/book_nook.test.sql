-- Book Nook (#1142), migration 20261105124218: who may read, make and show a nook.
--
-- Cast (uuid suffix): 01 the DM of table c1, 02 Ada (player, character e1), 03 Bo (player, character e2),
-- 04 Sam (runs his own table c2: a legitimate user of the app, just not of c1).
-- The inn (location 51) is shared with Ada only and shows nook n1. Every refusal sits beside the rightful
-- caller succeeding on the same fixture, so a refusal cannot be a broken fixture.

begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('11420000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'nook-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name, game_system) values
  ('11420000-0000-4000-8000-0000000000c1', '11420000-0000-4000-8000-000000000001', 'Table one', 'dnd5e-2014'),
  ('11420000-0000-4000-8000-0000000000c2', '11420000-0000-4000-8000-000000000004', 'Sam''s table', 'dnd5e-2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('11420000-0000-4000-8000-0000000000c1', '11420000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('11420000-0000-4000-8000-0000000000c2', '11420000-0000-4000-8000-000000000004', 'dm', 'Sam')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('11420000-0000-4000-8000-0000000000e1', '11420000-0000-4000-8000-000000000002', '11420000-0000-4000-8000-000000000002', '11420000-0000-4000-8000-0000000000c1', 'Ada''s ranger', '2014'),
  ('11420000-0000-4000-8000-0000000000e2', '11420000-0000-4000-8000-000000000003', '11420000-0000-4000-8000-000000000003', '11420000-0000-4000-8000-0000000000c1', 'Bo''s bard', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('11420000-0000-4000-8000-0000000000c1', '11420000-0000-4000-8000-000000000002', 'player', 'Ada', '11420000-0000-4000-8000-0000000000e1'),
  ('11420000-0000-4000-8000-0000000000c1', '11420000-0000-4000-8000-000000000003', 'player', 'Bo',  '11420000-0000-4000-8000-0000000000e2');

insert into public.book_nooks (id, user_id, campaign_id, title, scene) values
  ('11420000-0000-4000-8000-0000000000a1', '11420000-0000-4000-8000-000000000001', '11420000-0000-4000-8000-0000000000c1', 'Dawn at the inn', '{"id":"n1"}'),
  ('11420000-0000-4000-8000-0000000000a2', '11420000-0000-4000-8000-000000000004', '11420000-0000-4000-8000-0000000000c2', 'Sam''s cellar', '{"id":"n2"}'),
  ('11420000-0000-4000-8000-0000000000a3', '11420000-0000-4000-8000-000000000001', '11420000-0000-4000-8000-0000000000c1', 'The vault, lit', '{"id":"n3"}');

insert into public.locations (id, user_id, campaign_id, name, location_type, player_visible_to, book_nook_id) values
  ('11420000-0000-4000-8000-000000000051', '11420000-0000-4000-8000-000000000001', '11420000-0000-4000-8000-0000000000c1',
   'The Pulled Sugar Inn', 'building', array['11420000-0000-4000-8000-0000000000e1']::uuid[], '11420000-0000-4000-8000-0000000000a1'),
  ('11420000-0000-4000-8000-000000000052', '11420000-0000-4000-8000-000000000001', '11420000-0000-4000-8000-0000000000c1',
   'The Bellhouse', 'building', array['11420000-0000-4000-8000-0000000000e1']::uuid[], null);
-- A vault whose map is shared with the table but which is shown to no one: its nook is not the DM's to give yet.
insert into public.locations (id, user_id, campaign_id, name, location_type, map_url, is_map_shared, player_visible_to, book_nook_id) values
  ('11420000-0000-4000-8000-000000000053', '11420000-0000-4000-8000-000000000001', '11420000-0000-4000-8000-0000000000c1',
   'The vault', 'building', 'https://example.invalid/vault.webp', true, '{}'::uuid[], '11420000-0000-4000-8000-0000000000a3');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"11420000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

set local role authenticated;

-- ── get_player_book_nook ────────────────────────────────────────────────────
select pg_temp.as_user(2);
select is((select title from public.get_player_book_nook('11420000-0000-4000-8000-000000000051')), 'Dawn at the inn',
  'the player a place is shown to reads the nook it shows');
select is_empty($$ select * from public.book_nooks $$,
  'but a player has no read on the table itself: only through a place they may see');

select pg_temp.as_user(3);
select is_empty($$ select * from public.get_player_book_nook('11420000-0000-4000-8000-000000000051') $$,
  'a member the place was not shown to gets nothing, even naming it');

select pg_temp.as_user(4);
select is_empty($$ select * from public.get_player_book_nook('11420000-0000-4000-8000-000000000051') $$,
  'a stranger naming another table''s place gets nothing');

select pg_temp.as_user(2);
select is_empty($$ select * from public.get_player_book_nook('11420000-0000-4000-8000-000000000053') $$,
  'a shared map does not show its place''s nook: only a place shown to the player does');
select is_empty($$ select * from public.get_player_book_nook(null) $$,
  'naming no place answers nothing');

-- ── The DMs' table ──────────────────────────────────────────────────────────
select pg_temp.as_user(1);
select is((select count(*)::int from public.book_nooks), 2, 'a DM reads their own campaign''s nooks and no one else''s');
select throws_ok($$ update public.book_nooks set user_id = '11420000-0000-4000-8000-000000000002'
  where id = '11420000-0000-4000-8000-0000000000a1' $$,
  '42501', null, 'a DM cannot hand a nook to a player by rewriting its author');

select pg_temp.as_user(2);
select is_empty($$ update public.book_nooks set title = 'Mine now' where id = '11420000-0000-4000-8000-0000000000a1' returning id $$,
  'a player cannot edit a nook');
select is_empty($$ delete from public.book_nooks where id = '11420000-0000-4000-8000-0000000000a1' returning id $$,
  'nor delete one');
select is_empty($$ update public.campaigns set table_shows = 'picture' where id = '11420000-0000-4000-8000-0000000000c1' returning id $$,
  'and a player cannot switch what the Table screen shows');

select pg_temp.as_user(4);
select throws_ok($$ insert into public.book_nooks (user_id, campaign_id, title, scene)
  values ('11420000-0000-4000-8000-000000000004', '11420000-0000-4000-8000-0000000000c1', 'Planted', '{}') $$,
  '42501', null, 'a DM of another table cannot make a nook in this one');
select lives_ok($$ insert into public.book_nooks (user_id, campaign_id, title, scene)
  values ('11420000-0000-4000-8000-000000000004', '11420000-0000-4000-8000-0000000000c2', 'His own', '{}') $$,
  'while making one in his own table works');

select pg_temp.as_user(2);
select throws_ok($$ insert into public.book_nooks (user_id, campaign_id, title, scene)
  values ('11420000-0000-4000-8000-000000000002', '11420000-0000-4000-8000-0000000000c1', 'A player''s', '{}') $$,
  '42501', null, 'a player cannot make a nook in the table they play at');

-- ── Showing a nook at a place ───────────────────────────────────────────────
select pg_temp.as_user(1);
select throws_ok($$ update public.locations set book_nook_id = '11420000-0000-4000-8000-0000000000a2'
  where id = '11420000-0000-4000-8000-000000000052' $$,
  null, null, 'a place cannot show another campaign''s nook');
select throws_ok($$ update public.locations set book_nook_id = '11420000-0000-4000-8000-0000000000a1'
  where id = '11420000-0000-4000-8000-000000000052' $$,
  '23505', null, 'a nook is shown at one place at most');

-- ── The stock shelf and the table switch ────────────────────────────────────
select throws_ok($$ insert into public.library_nook_parts (id, kind, group_key, name) values ('stock-x', 'cutout', 'fire', 'X') $$,
  '42501', null, 'only an admin stocks the shelf');
select set_config('request.jwt.claims',
  '{"sub":"11420000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}', true);
select lives_ok($$ insert into public.library_nook_parts (id, kind, group_key, name) values ('stock-y', 'cutout', 'fire', 'Y') $$,
  'while the admin does');

-- A DM who steps down keeps nothing of what they made: authorship is not access.
reset role;
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('11420000-0000-4000-8000-0000000000c2', '11420000-0000-4000-8000-000000000001', 'dm', 'Guest DM');
insert into public.book_nooks (id, user_id, campaign_id, title, scene) values
  ('11420000-0000-4000-8000-0000000000a4', '11420000-0000-4000-8000-000000000001', '11420000-0000-4000-8000-0000000000c2', 'Guest work', '{}');
update public.campaign_members set role = 'player' where campaign_id = '11420000-0000-4000-8000-0000000000c2' and user_id = '11420000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user(1);
select is_empty($$ select * from public.book_nooks where id = '11420000-0000-4000-8000-0000000000a4' $$,
  'a DM who is no longer one cannot read the nooks they made there');

reset role;
select throws_ok($$ update public.campaigns set table_shows = 'tv' where id = '11420000-0000-4000-8000-0000000000c1' $$,
  '23514', null, 'the Table screen shows a map or a picture, nothing else');

select * from finish();
rollback;
