begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

-- Backstories written together (#1226 story 10): a character's player writes and edits their own passages of their
-- own character's backstory and nothing else of the canon; the DM edits every passage and writes untold ones; a
-- player reads only what they were told; open_backstory refuses anyone but the DM and that character's player.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12260000-0000-4000-8000-000000000501', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bs-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12260000-0000-4000-8000-000000000502', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bs-lotte@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12260000-0000-4000-8000-000000000503', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bs-bram@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12260000-0000-4000-8000-000000000510', '12260000-0000-4000-8000-000000000501', 'The Kind Country', 'dnd5e-2014');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('12260000-0000-4000-8000-000000000520', '12260000-0000-4000-8000-000000000502', '12260000-0000-4000-8000-000000000510', 'Tansy', '2014'),
  ('12260000-0000-4000-8000-000000000521', '12260000-0000-4000-8000-000000000503', '12260000-0000-4000-8000-000000000510', 'Bram', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('12260000-0000-4000-8000-000000000510', '12260000-0000-4000-8000-000000000501', 'dm', 'DM', null),
  ('12260000-0000-4000-8000-000000000510', '12260000-0000-4000-8000-000000000502', 'player', 'Lotte', '12260000-0000-4000-8000-000000000520'),
  ('12260000-0000-4000-8000-000000000510', '12260000-0000-4000-8000-000000000503', 'player', 'Bram', '12260000-0000-4000-8000-000000000521')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── Bram may not open Tansy's backstory ──────────────────────────────────────
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000503', true);
select throws_ok($$ select public.open_backstory('12260000-0000-4000-8000-000000000520') $$, '42501', null,
  'another player cannot open someone else''s backstory');

-- ── Lotte opens hers and writes a passage ────────────────────────────────────
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000502', true);
select isnt(public.open_backstory('12260000-0000-4000-8000-000000000520'), null, 'a player opens their own character''s backstory');
select is(public.open_backstory('12260000-0000-4000-8000-000000000520'),
          (select public.open_backstory('12260000-0000-4000-8000-000000000520')),
          'opening it twice gives the one backstory');

select lives_ok($$
  insert into public.canon_lore_passages (user_id, campaign_id, entry_id, title, author_id, player_visible_to)
  select '12260000-0000-4000-8000-000000000502', '12260000-0000-4000-8000-000000000510',
         public.open_backstory('12260000-0000-4000-8000-000000000520'), 'After the Mere',
         '12260000-0000-4000-8000-000000000502', array['12260000-0000-4000-8000-000000000520']::uuid[]
$$, 'a player adds a passage to their own backstory');

select throws_ok($$
  insert into public.canon_entries (user_id, campaign_id, part, knowledge, title) values
    ('12260000-0000-4000-8000-000000000502', '12260000-0000-4000-8000-000000000510', 'truth', 'all', 'I say so')
$$, '42501', null, 'writing their backstory gives a player no other canon to write');

select throws_ok($$
  update public.canon_lore_passages set location_id = null, npc_id = null,
    player_visible_to = array['12260000-0000-4000-8000-000000000599']::uuid[]
   where title = 'After the Mere'
$$, '42501', null, 'a player cannot tell their passage to someone outside their party');

-- ── The DM writes an untold passage and edits the player's ───────────────────
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000501', true);
select lives_ok($$
  insert into public.canon_lore_passages (user_id, campaign_id, entry_id, title, author_id)
  select '12260000-0000-4000-8000-000000000501', '12260000-0000-4000-8000-000000000510', e.id, 'What the coin is',
         '12260000-0000-4000-8000-000000000501'
    from public.canon_entries e where e.part = 'backstory' and e.party_member_id = '12260000-0000-4000-8000-000000000520';
  update public.canon_lore_passages set title = 'After the Mere, edited' where title = 'After the Mere'
$$, 'the DM writes their own passage and edits the player''s');

-- ── What Lotte reads ─────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000502', true);
select is(
  (select array_agg(title order by sort_order, written_at) from public.get_player_lore_passages('12260000-0000-4000-8000-000000000510')),
  array['After the Mere, edited'],
  'a player reads their own passage and never the DM''s untold one');
select is_empty($$ select id from public.canon_lore_passages where title = 'What the coin is' $$,
  'a player cannot read the DM''s untold passage from the table either');
select is_empty($$ update public.canon_lore_passages set title = 'mine now' where title = 'What the coin is' returning id $$,
  'a player cannot edit the DM''s passage: the update reaches no row');

-- ── Bram, who was told nothing of it ─────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000503', true);
select is_empty($$ select 1 from public.get_player_lore_passages('12260000-0000-4000-8000-000000000510') $$,
  'another player reads nothing of a backstory not shared with them');
select ok(not exists (select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000510') where part = 'backstory'),
  'nor the backstory entry itself');

-- ── Lotte shares a passage with the party; Bram now reads it ─────────────────
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000502', true);
update public.canon_lore_passages
   set player_visible_to = array['12260000-0000-4000-8000-000000000520', '12260000-0000-4000-8000-000000000521']::uuid[]
 where title = 'After the Mere, edited';
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000503', true);
select is(
  (select array_agg(title) from public.get_player_lore_passages('12260000-0000-4000-8000-000000000510')),
  array['After the Mere, edited'],
  'a passage the player shared with the party reaches another player, and the DM''s untold one still does not');

select * from finish();
rollback;
