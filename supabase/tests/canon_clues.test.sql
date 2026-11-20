begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

-- canon_clues and secrets (20261119231628, #1226 story 3): a clue belongs to a secret and lies at one place, person or
-- beat of the same campaign; only the campaign's DMs read clues; a secret reaches the party only once the DM reveals
-- it, and only the members it was revealed to.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12260000-0000-4000-8000-000000000201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'clue-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12260000-0000-4000-8000-000000000202', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'clue-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12260000-0000-4000-8000-000000000203', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'clue-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12260000-0000-4000-8000-000000000210', '12260000-0000-4000-8000-000000000201', 'The Kind Country', 'dnd5e-2014'),
  ('12260000-0000-4000-8000-000000000211', '12260000-0000-4000-8000-000000000203', 'Elsewhere', 'dnd5e-2014');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('12260000-0000-4000-8000-000000000220', '12260000-0000-4000-8000-000000000201', '12260000-0000-4000-8000-000000000210', 'Tansy', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('12260000-0000-4000-8000-000000000210', '12260000-0000-4000-8000-000000000201', 'dm', 'DM', null),
  ('12260000-0000-4000-8000-000000000210', '12260000-0000-4000-8000-000000000202', 'player', 'Tansy', '12260000-0000-4000-8000-000000000220'),
  ('12260000-0000-4000-8000-000000000211', '12260000-0000-4000-8000-000000000203', 'dm', 'Other DM', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.locations (id, user_id, campaign_id, name) values
  ('12260000-0000-4000-8000-000000000250', '12260000-0000-4000-8000-000000000201', '12260000-0000-4000-8000-000000000210', 'The Sugar Vault'),
  ('12260000-0000-4000-8000-000000000251', '12260000-0000-4000-8000-000000000203', '12260000-0000-4000-8000-000000000211', 'Somewhere else');

insert into public.npcs (id, user_id, campaign_id, name) values
  ('12260000-0000-4000-8000-000000000240', '12260000-0000-4000-8000-000000000201', '12260000-0000-4000-8000-000000000210', 'Miss Pellam');

insert into public.canon_entries (id, user_id, campaign_id, part, knowledge, title) values
  ('12260000-0000-4000-8000-000000000230', '12260000-0000-4000-8000-000000000201', '12260000-0000-4000-8000-000000000210',
   'secret', null, 'Sift is the guild master''s daughter.'),
  ('12260000-0000-4000-8000-000000000231', '12260000-0000-4000-8000-000000000201', '12260000-0000-4000-8000-000000000210',
   'truth', 'all', 'Magic leaves a taste on the tongue.');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000201', true);

select lives_ok($$
  insert into public.canon_clues (user_id, campaign_id, secret_id, title, location_id) values
    ('12260000-0000-4000-8000-000000000201', '12260000-0000-4000-8000-000000000210', '12260000-0000-4000-8000-000000000230',
     'A locket in the dust, stamped with the guild''s sheaf.', '12260000-0000-4000-8000-000000000250')
$$, 'the DM places a clue to a secret at a place');

select throws_ok($$
  insert into public.canon_clues (user_id, campaign_id, secret_id, title) values
    ('12260000-0000-4000-8000-000000000201', '12260000-0000-4000-8000-000000000210', '12260000-0000-4000-8000-000000000231', 'A clue to a truth')
$$, '23514', 'A clue belongs to a secret', 'a clue cannot hang off a truth, or a truth would hide behind clues');

select throws_ok($$
  insert into public.canon_clues (user_id, campaign_id, secret_id, title, location_id, npc_id) values
    ('12260000-0000-4000-8000-000000000201', '12260000-0000-4000-8000-000000000210', '12260000-0000-4000-8000-000000000230', 'Two places',
     '12260000-0000-4000-8000-000000000250', '12260000-0000-4000-8000-000000000240')
$$, '23514', null, 'a clue lies in one place at most, so the party knows where to look');

select throws_ok($$
  insert into public.canon_clues (user_id, campaign_id, secret_id, title, location_id) values
    ('12260000-0000-4000-8000-000000000201', '12260000-0000-4000-8000-000000000210', '12260000-0000-4000-8000-000000000230',
     'Elsewhere', '12260000-0000-4000-8000-000000000251')
$$, null, null, 'a clue cannot lie at another campaign''s place');

select throws_ok($$
  update public.canon_entries set revealed_at = now() where id = '12260000-0000-4000-8000-000000000231'
$$, '23514', null, 'only a secret can be revealed');

-- ── The player, before and after the reveal ───────────────────────────────────
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000202', true);

select is_empty($$ select id from public.canon_clues $$, 'a player never reads a clue as an entry');
select ok(
  not exists (select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000210') where part = 'secret'),
  'an unrevealed secret never reaches the player');

select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000201', true);
update public.canon_entries set player_visible_to = array['12260000-0000-4000-8000-000000000220']::uuid[]
 where id = '12260000-0000-4000-8000-000000000230';
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000202', true);
select ok(
  not exists (select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000210') where part = 'secret'),
  'sharing a secret without revealing it still keeps it from the player');

select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000201', true);
update public.canon_entries set revealed_at = now() where id = '12260000-0000-4000-8000-000000000230';
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000202', true);
select ok(
  exists (select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000210') where part = 'secret'),
  'a revealed secret reaches the members it was revealed to');

select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000203', true);
select is_empty($$ select id from public.canon_clues $$, 'another campaign''s DM reads no clue of this one');

select * from finish();
rollback;
