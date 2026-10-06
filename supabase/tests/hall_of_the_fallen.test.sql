-- #982 Hall of the Fallen: who may set a character down, write which words,
-- see which memorial, and light which candle.
--
--   1 Dana  DM of c1               3 Sam  DM of c2, a stranger to c1
--   2 Pia   player at c1, owns m1  4 Oz   player at c1, owns m2
-- m1 "Chicory" (Pia, seat name "Mira"), m2 "Toddy" (Oz).

begin;

create extension if not exists pgtap with schema extensions;
select plan(44);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('98200000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'hall-of-the-fallen-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name, ruleset) values
  ('98200000-0000-4000-8000-0000000000c1', '98200000-0000-4000-8000-000000000001', 'Sugarwell', '2024'),
  ('98200000-0000-4000-8000-0000000000c2', '98200000-0000-4000-8000-000000000003', 'Sam''s table', '2024');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, class, level, sort_order, ruleset) values
  ('98200000-0000-4000-8000-0000000000e1', '98200000-0000-4000-8000-000000000002',
   '98200000-0000-4000-8000-000000000002', '98200000-0000-4000-8000-0000000000c1', 'Chicory', 'Cleric', 6, 1, '2024'),
  ('98200000-0000-4000-8000-0000000000e2', '98200000-0000-4000-8000-000000000004',
   '98200000-0000-4000-8000-000000000004', '98200000-0000-4000-8000-0000000000c1', 'Toddy', 'Bard', 6, 2, '2024');

-- m3: a DM-run character nobody has claimed (owner_user_id NULL), the case
-- that turns a careless owner comparison into a NULL guard.
insert into public.party_members (id, user_id, owner_user_id, is_dm_managed, campaign_id, name, class, level, ruleset) values
  ('98200000-0000-4000-8000-0000000000e3', '98200000-0000-4000-8000-000000000001', null, true,
   '98200000-0000-4000-8000-0000000000c1', 'Old Pellam', 'Wizard', 9, '2024');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('98200000-0000-4000-8000-0000000000c1', '98200000-0000-4000-8000-000000000001', 'dm', 'Dana', null),
  ('98200000-0000-4000-8000-0000000000c1', '98200000-0000-4000-8000-000000000002', 'player', 'Mira',
   '98200000-0000-4000-8000-0000000000e1'),
  ('98200000-0000-4000-8000-0000000000c1', '98200000-0000-4000-8000-000000000004', 'player', 'Oz',
   '98200000-0000-4000-8000-0000000000e2'),
  ('98200000-0000-4000-8000-0000000000c2', '98200000-0000-4000-8000-000000000003', 'dm', 'Sam', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, display_name = excluded.display_name,
  party_member_id = excluded.party_member_id;

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"98200000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

-- Definer readers: a refused caller cannot see the row through RLS, so a plain
-- check would pass vacuously.
create function pg_temp.memorial(p_id text) returns public.character_memorials
language sql security definer as $$
  select * from public.character_memorials where party_member_id = ('98200000-0000-4000-8000-0000000000' || p_id)::uuid;
$$;
create function pg_temp.memorial_id(p_id text) returns uuid
language sql security definer as $$
  select id from public.character_memorials where party_member_id = ('98200000-0000-4000-8000-0000000000' || p_id)::uuid;
$$;
create function pg_temp.mourner(p_id text, p_n int) returns public.memorial_mourners
language sql security definer as $$
  select * from public.memorial_mourners
   where memorial_id = pg_temp.memorial_id(p_id)
     and user_id = ('98200000-0000-4000-8000-00000000000' || p_n)::uuid;
$$;

set local role authenticated;

-- ── set_character_down ──────────────────────────────────────────────────────

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e1', 'retired', null, null, null, null, null) $$,
  'P0001', 'Access denied', 'a caller with no identity is refused');

select pg_temp.as_user(4);
select throws_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e3', 'retired', null, null, null, null, null) $$,
  'P0001', 'Access denied', 'nobody owns an unclaimed DM-run character, so a player cannot retire it');

select pg_temp.as_user(3);
select throws_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e1', 'fallen', null, null, null, null, null) $$,
  'P0001', 'Access denied', 'a stranger cannot mark another table''s character fallen');
select throws_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e1', 'retired', null, null, null, null, null) $$,
  'P0001', 'Access denied', 'a stranger cannot retire another table''s character');

select pg_temp.as_user(2);
select throws_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e1', 'fallen', null, null, null, null, null) $$,
  'P0001', 'Only the DM marks a character fallen', 'the owner cannot mark their own character fallen');
select throws_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e1', 'retired', null, null, 'my account', null, null) $$,
  'P0001', 'Only the DM writes the account', 'the owner cannot write the DM''s account');

select pg_temp.as_user(4);
select throws_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e1', 'retired', null, null, null, null, null) $$,
  'P0001', 'Access denied', 'another player at the table cannot retire someone else''s character');

select pg_temp.as_user(1);
select throws_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e1', 'fallen', null, null, null, null, 'not mine to write') $$,
  'P0001', 'Only the player writes the last words', 'the DM cannot write a player''s last words');
select throws_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e1', null, null, null, null, null, null) $$,
  'P0001', 'Unknown kind', 'a NULL kind is refused, not waved through');
select is(pg_temp.memorial('e1'), null, 'no refused call left a memorial behind');
select lives_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e3', 'retired', null, null, null, null, null) $$,
  'the DM retires an unclaimed DM-run character');

-- Positive control: the DM marks Chicory fallen.
select lives_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e1', 'fallen',
  '14 Mirtul 1492 DR', '2026-05-04', 'Chicory held the Honeyed Gate.', 'a giant wasp', null) $$,
  'the DM marks a character fallen');
select is((pg_temp.memorial('e1')).kind, 'fallen', 'the memorial records the fall');
select is((pg_temp.memorial('e1')).survived_by, array['Toddy'], 'survived by the rest of the party, frozen');
select is((pg_temp.memorial('e1')).player_name, 'Mira', 'the player tag is the seat name at the moment');
select is((pg_temp.memorial('e1')).campaign_name, 'Sugarwell', 'the campaign is snapshotted for the card');
select is((select count(*)::int from public.memorial_mourners where memorial_id = pg_temp.memorial_id('e1')),
  3, 'everyone at the table is a mourner');
select isnt((pg_temp.mourner('e1', 1)).tolled_at, null, 'the DM who recorded it has seen the notice');
select is((pg_temp.mourner('e1', 2)).tolled_at, null, 'the owner has not');
select throws_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e1', 'fallen', null, null, null, null, null) $$,
  'P0001', 'Already in the Hall of the Fallen', 'a character cannot fall twice without an undo');

-- ── Who sees it ─────────────────────────────────────────────────────────────

select pg_temp.as_user(3);
select is_empty($$ select 1 from public.character_memorials $$, 'a stranger sees no memorial');
select pg_temp.as_user(4);
select isnt_empty($$ select 1 from public.character_memorials where party_member_id = '98200000-0000-4000-8000-0000000000e1' $$,
  'a companion at the table sees it');

-- ── write_last_words ────────────────────────────────────────────────────────

select throws_ok($$ select public.write_last_words('98200000-0000-4000-8000-0000000000e1', 'forged') $$,
  'P0001', 'Access denied', 'a companion cannot write someone else''s last words');
select pg_temp.as_user(1);
select throws_ok($$ select public.write_last_words('98200000-0000-4000-8000-0000000000e1', 'forged') $$,
  'P0001', 'Access denied', 'the DM cannot write a player''s last words');
select pg_temp.as_user(2);
select lives_ok($$ select public.write_last_words('98200000-0000-4000-8000-0000000000e1', 'Plant something where I fell.') $$,
  'the owner writes the last words');
select is((pg_temp.memorial('e1')).last_words, 'Plant something where I fell.', 'the last words are on the memorial');

-- ── edit_memorial_account ───────────────────────────────────────────────────

select throws_ok($$ select public.edit_memorial_account('98200000-0000-4000-8000-0000000000e1', null, null, 'rewritten', null) $$,
  'P0001', 'Access denied', 'the owner cannot rewrite the DM''s account');
select pg_temp.as_user(3);
select throws_ok($$ select public.edit_memorial_account('98200000-0000-4000-8000-0000000000e1', null, null, 'rewritten', null) $$,
  'P0001', 'Access denied', 'a stranger cannot rewrite the account');
select pg_temp.as_user(1);
select lives_ok($$ select public.edit_memorial_account('98200000-0000-4000-8000-0000000000e1', '15 Mirtul 1492 DR', null,
  'Chicory held the Honeyed Gate with a shield painted in daisies.', 'a giant wasp') $$, 'the DM edits the account');

-- ── restore_character ───────────────────────────────────────────────────────

select pg_temp.as_user(2);
select throws_ok($$ select public.restore_character('98200000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Access denied', 'the owner cannot restore a fallen character to life');
select pg_temp.as_user(3);
select throws_ok($$ select public.restore_character('98200000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Access denied', 'a stranger cannot restore it');
select pg_temp.as_user(1);
select lives_ok($$ select public.restore_character('98200000-0000-4000-8000-0000000000e1') $$, 'the DM restores to life');
select isnt((pg_temp.memorial('e1')).restored_at, null, 'restored');

-- A second fall keeps every word written before the undo.
select lives_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e1', 'fallen', '20 Mirtul 1492 DR', null, null, null, null) $$,
  'the DM marks the character fallen again');
select is((pg_temp.memorial('e1')).account, 'Chicory held the Honeyed Gate with a shield painted in daisies.', 'the account survived the undo');
select is((pg_temp.memorial('e1')).last_words, 'Plant something where I fell.', 'the last words survived the undo');

-- Retirement belongs to the owner as well: Oz retires Toddy and brings him back.
select pg_temp.as_user(4);
select lives_ok($$ select public.set_character_down('98200000-0000-4000-8000-0000000000e2', 'retired', null, null, null, null, 'Somebody has to teach parrying.') $$,
  'the owner retires their own character');
select pg_temp.as_user(2);
select throws_ok($$ select public.restore_character('98200000-0000-4000-8000-0000000000e2') $$,
  'P0001', 'Access denied', 'a companion cannot return someone else''s retired character');
select pg_temp.as_user(4);
select lives_ok($$ select public.restore_character('98200000-0000-4000-8000-0000000000e2') $$,
  'the owner returns a retired character to the party');

-- ── Mourners: candles, and leaving ──────────────────────────────────────────

select pg_temp.as_user(3);
select throws_ok($$ insert into public.memorial_mourners (memorial_id, user_id, campaign_id, candle_lit_at)
  values (pg_temp.memorial_id('e1'), '98200000-0000-4000-8000-000000000003', '98200000-0000-4000-8000-0000000000c1', now()) $$,
  '42501', null, 'a stranger cannot light a candle at a memorial they cannot see');

select pg_temp.as_user(4);
select throws_ok($$ insert into public.memorial_mourners (memorial_id, user_id, campaign_id, candle_lit_at)
  values (pg_temp.memorial_id('e3'), '98200000-0000-4000-8000-000000000003', '98200000-0000-4000-8000-0000000000c1', now()) $$,
  '42501', 'new row violates row-level security policy for table "memorial_mourners"',
  'nobody lights a candle in someone else''s name');
update public.memorial_mourners set candle_lit_at = now()
 where memorial_id = pg_temp.memorial_id('e1');
select isnt((pg_temp.mourner('e1', 4)).candle_lit_at, null, 'a companion lights their own candle');
select is((pg_temp.mourner('e1', 2)).candle_lit_at, null, 'and only their own: the owner''s row is untouched');

-- Oz leaves the table; the companion who fell beside him stays on his wall.
reset role;
delete from public.campaign_members
 where campaign_id = '98200000-0000-4000-8000-0000000000c1' and user_id = '98200000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.as_user(4);
select isnt_empty($$ select 1 from public.character_memorials where party_member_id = '98200000-0000-4000-8000-0000000000e1' $$,
  'a player who has left still sees the companion who fell beside them');

select * from finish();
rollback;
