begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

-- canon_entries (20261119214935, #1226): the campaign's canon. Only the campaign's DMs read or write the table; a
-- player reads get_player_canon, which applies each part's audience (a truth's knowledge mark, the premise's reveal
-- minus the AI's voice and look, never a force); a canon entry is a world-web end like any other.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12260000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'canon-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12260000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'canon-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12260000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'canon-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12260000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'canon-seatless@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12260000-0000-4000-8000-000000000010', '12260000-0000-4000-8000-000000000001', 'The Kind Country', 'dnd5e-2014'),
  ('12260000-0000-4000-8000-000000000011', '12260000-0000-4000-8000-000000000003', 'Elsewhere', 'dnd5e-2014');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('12260000-0000-4000-8000-000000000020', '12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010', 'Tansy', '2014'),
  ('12260000-0000-4000-8000-000000000021', '12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010', 'Bram', '2014'),
  ('12260000-0000-4000-8000-000000000022', '12260000-0000-4000-8000-000000000003', '12260000-0000-4000-8000-000000000011', 'Wren', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('12260000-0000-4000-8000-000000000010', '12260000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('12260000-0000-4000-8000-000000000010', '12260000-0000-4000-8000-000000000002', 'player', 'Tansy', '12260000-0000-4000-8000-000000000020'),
  ('12260000-0000-4000-8000-000000000011', '12260000-0000-4000-8000-000000000003', 'dm', 'Other DM', null),
  ('12260000-0000-4000-8000-000000000010', '12260000-0000-4000-8000-000000000004', 'player', 'Seatless', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

-- Tansy runs with the Ferrymen; Bram does not.
insert into public.factions (id, user_id, campaign_id, name) values
  ('12260000-0000-4000-8000-000000000040', '12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010', 'The Ferrymen');
insert into public.faction_party_members (user_id, faction_id, party_member_id, role) values
  ('12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000040', '12260000-0000-4000-8000-000000000020', 'Oar');

insert into public.npcs (id, user_id, campaign_id, name) values
  ('12260000-0000-4000-8000-000000000030', '12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010', 'Miss Pellam'),
  ('12260000-0000-4000-8000-000000000031', '12260000-0000-4000-8000-000000000003', '12260000-0000-4000-8000-000000000011', 'A stranger');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The DM writes the canon ────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000001', true);

select lives_ok($$
  insert into public.canon_entries (id, user_id, campaign_id, part, knowledge, premise_kind, title, player_visible_to) values
    ('12260000-0000-4000-8000-000000000101', '12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010',
     'truth', 'all', null, 'Magic leaves a taste on the tongue.', '{}'),
    ('12260000-0000-4000-8000-000000000102', '12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010',
     'truth', 'some', null, 'The river gives back whatever is thrown into it.', '{}'),
    ('12260000-0000-4000-8000-000000000103', '12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010',
     'truth', 'some', null, 'The bridge toll was never the Ferrymen''s idea.', '{}'),
    ('12260000-0000-4000-8000-000000000104', '12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010',
     'truth', 'secret', null, 'The Stain is a wound in the dream.', array['12260000-0000-4000-8000-000000000020']::uuid[]),
    ('12260000-0000-4000-8000-000000000105', '12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010',
     'premise', null, 'theme', 'Kindness is a kind of courage.', array['12260000-0000-4000-8000-000000000020']::uuid[]),
    ('12260000-0000-4000-8000-000000000106', '12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010',
     'premise', null, 'voice', 'Wonder first, menace underneath.', array['12260000-0000-4000-8000-000000000020']::uuid[]),
    ('12260000-0000-4000-8000-000000000107', '12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010',
     'force', null, null, 'The Ferrymen want the bridge.', array['12260000-0000-4000-8000-000000000020']::uuid[])
$$, 'the DM writes truths, premise and a force');

select throws_ok($$
  insert into public.canon_entries (user_id, campaign_id, part, title) values
    ('12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010', 'truth', 'Unmarked')
$$, '23514', null, 'a truth without a knowledge mark is refused, so nobody can be unsure who knows it');

-- The river truth is known to Tansy herself; the toll truth to the Ferrymen, whom Tansy runs with.
select lives_ok($$
  insert into public.world_links (user_id, campaign_id, from_kind, from_canon_entry_id, to_kind, to_party_member_id, type) values
    ('12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010', 'canon',
     '12260000-0000-4000-8000-000000000102', 'party_member', '12260000-0000-4000-8000-000000000020', 'known_to');
  insert into public.world_links (user_id, campaign_id, from_kind, from_canon_entry_id, to_kind, to_faction_id, type) values
    ('12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010', 'canon',
     '12260000-0000-4000-8000-000000000103', 'faction', '12260000-0000-4000-8000-000000000040', 'known_to');
  insert into public.world_links (user_id, campaign_id, from_kind, from_canon_entry_id, to_kind, to_npc_id, type) values
    ('12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010', 'canon',
     '12260000-0000-4000-8000-000000000102', 'npc', '12260000-0000-4000-8000-000000000030', 'about')
$$, 'a canon entry links to a person, a faction and an NPC');

select throws_ok($$
  insert into public.world_links (user_id, campaign_id, from_kind, from_canon_entry_id, to_kind, to_npc_id, type) values
    ('12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010', 'canon',
     '12260000-0000-4000-8000-000000000101', 'npc', '12260000-0000-4000-8000-000000000030', 'took_place_at')
$$, '23503', null, 'a type outside the canon-person pair is refused by the catalogue');

select throws_ok($$
  insert into public.world_links (user_id, campaign_id, from_kind, from_canon_entry_id, to_kind, to_npc_id, type) values
    ('12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010', 'canon',
     '12260000-0000-4000-8000-000000000101', 'npc', '12260000-0000-4000-8000-000000000031', 'about')
$$, null, null, 'a canon entry cannot be tied to another campaign''s NPC');

select ok(
  exists (select 1 from public.get_connections('npc', '12260000-0000-4000-8000-000000000030')
           where other_kind = 'canon' and other_name = 'The river gives back whatever is thrown into it.'),
  'an NPC''s sheet lists the canon entry that is about them, by its title');

select is(
  (select count(*)::int from public.get_player_canon('12260000-0000-4000-8000-000000000010', '12260000-0000-4000-8000-000000000021')),
  1,
  'previewing Bram, the DM sees only the truth known to all');

select is_empty(
  $$ select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000010', '12260000-0000-4000-8000-000000000022') $$,
  'the DM cannot preview this canon as a character of another campaign');

-- An AI-written entry is marked edited when its words change, and only then.
select lives_ok($$
  insert into public.canon_entries (id, user_id, campaign_id, part, knowledge, title, ai_provenance) values
    ('12260000-0000-4000-8000-000000000108', '12260000-0000-4000-8000-000000000001', '12260000-0000-4000-8000-000000000010',
     'truth', 'all', 'Bells keep the mist back.', '{"provider": "openai", "model": "m", "edited": false}'::jsonb);
  update public.canon_entries set sort_order = 5 where id = '12260000-0000-4000-8000-000000000108'
$$, 'an AI-written truth is reordered');
select is(
  (select ai_provenance ->> 'edited' from public.canon_entries where id = '12260000-0000-4000-8000-000000000108'),
  'false',
  'moving an AI-written truth does not mark it edited');
update public.canon_entries set title = 'Bells keep the mist away.' where id = '12260000-0000-4000-8000-000000000108';
select is(
  (select ai_provenance ->> 'edited' from public.canon_entries where id = '12260000-0000-4000-8000-000000000108'),
  'true',
  'changing an AI-written truth''s words marks it edited, so its AI label says the DM changed it');

select throws_ok($$
  update public.canon_entries set part = 'lore' where id = '12260000-0000-4000-8000-000000000104'
$$, '23514', null, 'an entry''s part never changes, so a secret cannot become lore its clues then hang off');

-- ── The player reads ───────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000002', true);

select is_empty($$ select id from public.canon_entries $$, 'a player reads nothing of the table itself');

select is_empty(
  $$ select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000010', '12260000-0000-4000-8000-000000000020') $$,
  'a player cannot use the preview to read as a character, even their own');

select throws_ok($$
  insert into public.canon_entries (user_id, campaign_id, part, knowledge, title) values
    ('12260000-0000-4000-8000-000000000002', '12260000-0000-4000-8000-000000000010', 'truth', 'all', 'I say so')
$$, '42501', null, 'a player cannot write the canon');

select ok(
  exists (select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000010') where id = '12260000-0000-4000-8000-000000000101'),
  'a truth known to all reaches the player');
select ok(
  exists (select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000010') where id = '12260000-0000-4000-8000-000000000102'),
  'a truth known to their own character reaches the player');
select ok(
  exists (select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000010') where id = '12260000-0000-4000-8000-000000000103'),
  'a truth known to a faction reaches a player whose character is in it');
select ok(
  not exists (select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000010') where id = '12260000-0000-4000-8000-000000000104'),
  'a secret truth never reaches a player, even with the reveal list set');
select ok(
  exists (select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000010') where id = '12260000-0000-4000-8000-000000000105')
  and not exists (select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000010') where id = '12260000-0000-4000-8000-000000000106'),
  'a shared theme reaches the player, the AI''s voice never does');
select ok(
  not exists (select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000010') where part = 'force'),
  'what is moving never reaches a player');
select ok(
  not exists (select 1 from pg_proc p, unnest(p.proargnames) as n
               where p.proname = 'get_player_canon' and n in ('player_visible_to', 'user_id')),
  'the players'' read never hands out who else was told, or who wrote it');

-- ── Someone else ───────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000004', true);

select is_empty(
  $$ select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000010') $$,
  'a member with no character reads nothing, not everything');

select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000003', true);

select is_empty(
  $$ select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000010', '12260000-0000-4000-8000-000000000020') $$,
  'another campaign''s DM cannot read this canon, even naming one of its characters to preview');

select * from finish();
rollback;
