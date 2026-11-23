begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

-- 20261123183722_canon_story_shape (#1258): arcs with a shape and a theme, quests in arcs, the session a secret came
-- out, a force's schedule, clues in items, questions tied to quests, what the players wonder, and a player telling
-- the party a truth their character knows.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12580000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shape-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12580000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shape-tansy@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12580000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shape-bram@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12580000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shape-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12580000-0000-4000-8000-000000000010', '12580000-0000-4000-8000-000000000001', 'The Salt Road', 'dnd5e-2014'),
  ('12580000-0000-4000-8000-000000000011', '12580000-0000-4000-8000-000000000004', 'Elsewhere', 'dnd5e-2014');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('12580000-0000-4000-8000-000000000020', '12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', 'Tansy', '2014'),
  ('12580000-0000-4000-8000-000000000021', '12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', 'Bram', '2014'),
  ('12580000-0000-4000-8000-000000000022', '12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', 'Mira', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('12580000-0000-4000-8000-000000000010', '12580000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('12580000-0000-4000-8000-000000000010', '12580000-0000-4000-8000-000000000002', 'player', 'Tansy', '12580000-0000-4000-8000-000000000020'),
  ('12580000-0000-4000-8000-000000000010', '12580000-0000-4000-8000-000000000003', 'player', 'Bram', '12580000-0000-4000-8000-000000000021'),
  ('12580000-0000-4000-8000-000000000011', '12580000-0000-4000-8000-000000000004', 'dm', 'Other DM', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.canon_entries (id, user_id, campaign_id, part, premise_kind, knowledge, title) values
  ('12580000-0000-4000-8000-000000000101', '12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', 'premise', 'theme', null, 'What the sea takes, it keeps'),
  ('12580000-0000-4000-8000-000000000102', '12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', 'truth', null, 'some', 'The tide answers to a name'),
  ('12580000-0000-4000-8000-000000000103', '12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', 'force', null, null, 'The summoning'),
  ('12580000-0000-4000-8000-000000000104', '12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', 'secret', null, null, 'Maren sold the bell'),
  ('12580000-0000-4000-8000-000000000105', '12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', 'truth', null, 'all', 'Salt keeps the dead quiet');
-- Tansy knows the tide's name; Bram and Mira do not.
insert into public.world_links (user_id, campaign_id, from_kind, from_canon_entry_id, to_kind, to_party_member_id, type) values
  ('12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', 'canon', '12580000-0000-4000-8000-000000000102', 'party_member', '12580000-0000-4000-8000-000000000020', 'known_to');
insert into public.campaign_sessions (id, user_id, campaign_id) values
  ('12580000-0000-4000-8000-000000000060', '12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010');
insert into public.quests (id, user_id, campaign_id, title) values
  ('12580000-0000-4000-8000-000000000070', '12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', 'Ring the bell'),
  ('12580000-0000-4000-8000-000000000071', '12580000-0000-4000-8000-000000000004', '12580000-0000-4000-8000-000000000011', 'Another table''s quest');
insert into public.items (id, user_id, campaign_id, name) values
  ('12580000-0000-4000-8000-000000000080', '12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', 'A water-stained letter');

-- ── Arcs ────────────────────────────────────────────────────────────────────────
insert into public.canon_arcs (id, user_id, campaign_id, name) values
  ('12580000-0000-4000-8000-000000000050', '12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', 'The drowned god'),
  ('12580000-0000-4000-8000-000000000051', '12580000-0000-4000-8000-000000000004', '12580000-0000-4000-8000-000000000011', 'Another table''s arc');

select lives_ok($$
  update public.canon_arcs set status = 'ended', question = 'Will the bell ring?', stakes = 'The harbour',
         ending = 'It rang, and the tide came in', theme_id = '12580000-0000-4000-8000-000000000101'
   where id = '12580000-0000-4000-8000-000000000050'
$$, 'an arc asks its question, names its stakes and theme, and says how it ended');
select throws_ok($$
  update public.canon_arcs set status = 'running' where id = '12580000-0000-4000-8000-000000000050'
$$, '23514', null, 'an arc that is running has no ending yet');
select throws_ok($$
  update public.canon_arcs set theme_id = '12580000-0000-4000-8000-000000000105' where id = '12580000-0000-4000-8000-000000000050'
$$, '23514', null, 'an arc''s theme is a line of the premise, never a truth');
select lives_ok($$
  update public.quests set arc_id = '12580000-0000-4000-8000-000000000050' where id = '12580000-0000-4000-8000-000000000070'
$$, 'a quest belongs to an arc');

-- ── A secret's session, a force's schedule, a clue in a letter ──────────────────
select throws_ok($$
  update public.canon_entries set revealed_session_id = '12580000-0000-4000-8000-000000000060' where id = '12580000-0000-4000-8000-000000000104'
$$, '23514', null, 'a secret has a reveal session only once it is revealed');
select lives_ok($$
  update public.canon_entries set revealed_at = now(), revealed_session_id = '12580000-0000-4000-8000-000000000060' where id = '12580000-0000-4000-8000-000000000104'
$$, 'a revealed secret records the session it came out in');
select throws_ok($$
  insert into public.canon_force_steps (user_id, campaign_id, force_id, title, due_day) values
    ('12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', '12580000-0000-4000-8000-000000000103', 'The bell is cast', 3)
$$, '23514', null, 'a step is never due on a day without its month');
select throws_ok($$
  update public.canon_entries set if_succeeds = 'The harbour drowns' where id = '12580000-0000-4000-8000-000000000105'
$$, '23514', null, 'only a force says what happens if nobody stops it');
select lives_ok($$
  insert into public.canon_clues (user_id, campaign_id, secret_id, title, item_id) values
    ('12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', '12580000-0000-4000-8000-000000000104', 'The bell-founder''s receipt', '12580000-0000-4000-8000-000000000080')
$$, 'a clue lies in an item the party can be handed');

-- ── As the DM, through RLS ──────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '12580000-0000-4000-8000-000000000001', true);
select throws_ok($$
  update public.quests set arc_id = '12580000-0000-4000-8000-000000000051' where id = '12580000-0000-4000-8000-000000000070'
$$, '23514', null, 'a quest cannot join another campaign''s arc');

-- ── What the players wonder ─────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12580000-0000-4000-8000-000000000002', true);
select lives_ok($$
  insert into public.canon_wonders (id, campaign_id, party_member_id, body) values
    ('12580000-0000-4000-8000-000000000090', '12580000-0000-4000-8000-000000000010', '12580000-0000-4000-8000-000000000020', 'Who rang the bell the night we arrived?')
$$, 'a player wonders aloud');
select throws_ok($$
  update public.canon_wonders set dismissed_at = now() where id = '12580000-0000-4000-8000-000000000090'
$$, '42501', null, 'a player cannot answer their own wonder');

select set_config('request.jwt.claim.sub', '12580000-0000-4000-8000-000000000003', true);
select is_empty($$ select id from public.canon_wonders $$, 'another player does not read what Tansy wondered');
select is_empty($$ update public.canon_wonders set body = 'mine now' returning id $$, 'nor rewrite it');

select set_config('request.jwt.claim.sub', '12580000-0000-4000-8000-000000000001', true);
select throws_ok($$
  update public.canon_wonders set body = 'Who rang it?' where id = '12580000-0000-4000-8000-000000000090'
$$, '42501', null, 'the DM answers a wonder but never rewrites it');
select lives_ok($$
  update public.canon_wonders set dismissed_at = now() where id = '12580000-0000-4000-8000-000000000090'
$$, 'the DM lets a wonder be');

-- ── Telling the party ───────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12580000-0000-4000-8000-000000000002', true);
select is(
  (select known_with from public.get_player_canon('12580000-0000-4000-8000-000000000010') where id = '12580000-0000-4000-8000-000000000102'),
  '{}'::text[],
  'a truth only Tansy knows names nobody else');

select set_config('request.jwt.claim.sub', '12580000-0000-4000-8000-000000000003', true);
select throws_ok($$ select public.tell_party_canon_truth('12580000-0000-4000-8000-000000000102') $$,
  '42501', null, 'a player whose character does not know a truth cannot tell it');

select set_config('request.jwt.claim.sub', '12580000-0000-4000-8000-000000000002', true);
select is(public.tell_party_canon_truth('12580000-0000-4000-8000-000000000102'), 2,
  'the player who knows it tells the rest of the party');
select is(
  (select known_with from public.get_player_canon('12580000-0000-4000-8000-000000000010') where id = '12580000-0000-4000-8000-000000000102'),
  array['Bram', 'Mira'],
  'and the journal then names who else knows it');

-- ── What the party has found ────────────────────────────────────────────────────
reset role;
insert into public.canon_clues (user_id, campaign_id, secret_id, title, found_at) values
  ('12580000-0000-4000-8000-000000000001', '12580000-0000-4000-8000-000000000010', '12580000-0000-4000-8000-000000000104', 'A bell-rope cut clean', now());
set local role authenticated;
select set_config('request.jwt.claim.sub', '12580000-0000-4000-8000-000000000003', true);
select is(
  (select array_agg(title) from public.get_player_found_clues('12580000-0000-4000-8000-000000000010')),
  array['A bell-rope cut clean'],
  'a player reads the clues the party has found, and never one still lying unfound');
select set_config('request.jwt.claim.sub', '12580000-0000-4000-8000-000000000004', true);
select is_empty($$ select 1 from public.get_player_found_clues('12580000-0000-4000-8000-000000000010') $$,
  'someone outside the campaign reads none of its clues');

select * from finish();
rollback;
