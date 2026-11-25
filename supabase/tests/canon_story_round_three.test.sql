begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

-- 20261125202721_canon_story_round_three (#1279 wave 2): cover stories, Tonight's pins and plan, "Leave it", cultures,
-- a told truth's moment, lines and veils asked for privately, and a DM's edit of a player's passage.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12790000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r3-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12790000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r3-tansy@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12790000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r3-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12790000-0000-4000-8000-000000000010', '12790000-0000-4000-8000-000000000001', 'The Salt Road', 'dnd5e-2014'),
  ('12790000-0000-4000-8000-000000000011', '12790000-0000-4000-8000-000000000004', 'Elsewhere', 'dnd5e-2014');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('12790000-0000-4000-8000-000000000020', '12790000-0000-4000-8000-000000000001', '12790000-0000-4000-8000-000000000010', 'Tansy', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('12790000-0000-4000-8000-000000000010', '12790000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('12790000-0000-4000-8000-000000000010', '12790000-0000-4000-8000-000000000002', 'player', 'Tansy', '12790000-0000-4000-8000-000000000020'),
  ('12790000-0000-4000-8000-000000000011', '12790000-0000-4000-8000-000000000004', 'dm', 'Other DM', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.canon_entries (id, user_id, campaign_id, part, knowledge, title, cover_story, party_member_id) values
  ('12790000-0000-4000-8000-000000000101', '12790000-0000-4000-8000-000000000001', '12790000-0000-4000-8000-000000000010', 'secret', null, 'The king was poisoned', 'The king died of fever', null),
  ('12790000-0000-4000-8000-000000000102', '12790000-0000-4000-8000-000000000001', '12790000-0000-4000-8000-000000000010', 'truth', 'all', 'Salt keeps the dead quiet', null, null),
  ('12790000-0000-4000-8000-000000000103', '12790000-0000-4000-8000-000000000001', '12790000-0000-4000-8000-000000000010', 'backstory', null, 'Tansy''s past', null, '12790000-0000-4000-8000-000000000020');
insert into public.canon_lore_passages (id, user_id, campaign_id, entry_id, title, body, author_id) values
  ('12790000-0000-4000-8000-000000000201', '12790000-0000-4000-8000-000000000002', '12790000-0000-4000-8000-000000000010', '12790000-0000-4000-8000-000000000103', 'The fire', 'I lit it.', '12790000-0000-4000-8000-000000000002');
insert into public.species (id, user_id, campaign_id, name) values
  ('12790000-0000-4000-8000-000000000301', '12790000-0000-4000-8000-000000000001', '12790000-0000-4000-8000-000000000010', 'Human');

-- ── Shape (as the owner) ────────────────────────────────────────────────────────
select throws_ok($$
  update public.canon_entries set cover_story = 'Nothing happened' where id = '12790000-0000-4000-8000-000000000102'
$$, '23514', null, 'only a secret has a cover story');
select lives_ok($$
  update public.canon_entries set revealed_at = now() where id = '12790000-0000-4000-8000-000000000102'
$$, 'a truth can be told at a moment, as a secret is revealed');
select lives_ok($$
  insert into public.campaign_peoples (user_id, campaign_id, species_id, name, percent) values
    ('12790000-0000-4000-8000-000000000001', '12790000-0000-4000-8000-000000000010', '12790000-0000-4000-8000-000000000301', 'The Vell', 30),
    ('12790000-0000-4000-8000-000000000001', '12790000-0000-4000-8000-000000000010', '12790000-0000-4000-8000-000000000301', 'The Orrin', 20)
$$, 'two cultures of one species are two peoples');
select throws_ok($$
  insert into public.campaign_peoples (user_id, campaign_id, species_id, name, percent) values
    ('12790000-0000-4000-8000-000000000001', '12790000-0000-4000-8000-000000000010', '12790000-0000-4000-8000-000000000301', ' the vell ', 5)
$$, '23505', null, 'the same people cannot be listed twice under one name');
select is((select name from public.campaign_peoples_named where own_name = 'The Vell'), 'The Vell',
  'the view names a people by its own name');
select is((select record_name from public.campaign_peoples_named where own_name = 'The Vell'), 'Human',
  'and still says what stands behind it');

-- ── The player ──────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '12790000-0000-4000-8000-000000000002', true);

select is((select array_agg(belief) from public.get_player_common_beliefs('12790000-0000-4000-8000-000000000010')),
  array['The king died of fever'], 'a player believes the cover story of a secret not revealed to them');
select is((select revealed_at is not null from public.get_player_canon('12790000-0000-4000-8000-000000000010')
            where id = '12790000-0000-4000-8000-000000000102'), true,
  'the player''s read carries when a truth was told');
select isnt(public.ask_for_line_or_veil('12790000-0000-4000-8000-000000000010', 'veil', 'No spiders, please'), null,
  'a player asks for a veil');
select lives_ok($$ select public.ask_for_line_or_veil('12790000-0000-4000-8000-000000000010', 'line', 'Nothing about drowning', true) $$,
  'and may sign a request');
select is_empty($$ select 1 from public.canon_line_requests $$, 'a player never reads the requests, their own included');
select is_empty($$ select 1 from public.canon_tonight_pins $$, 'a player never reads the DM''s pins');
select throws_ok($$
  insert into public.canon_tonight_plans (user_id, campaign_id, body)
  values ('12790000-0000-4000-8000-000000000002', '12790000-0000-4000-8000-000000000010', 'I plan the session now')
$$, '42501', null, 'a player cannot write the DM''s plan');
select lives_ok($$ update public.canon_lore_passages set body = 'I lit it, and I would again.' where id = '12790000-0000-4000-8000-000000000201' $$,
  'the player edits their own passage');

-- ── The DM ──────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12790000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.ask_for_line_or_veil('12790000-0000-4000-8000-000000000010', 'line', 'A DM line') $$,
  '42501', null, 'the DM does not ask through the players'' box');
select is((select count(*)::int from public.canon_line_requests where asked_by is null), 1,
  'the DM reads the unsigned request with nothing naming its asker');
select is((select asked_by from public.canon_line_requests where kind = 'line'), '12790000-0000-4000-8000-000000000020'::uuid,
  'and the signed one names its character');
select throws_ok($$ update public.canon_line_requests set body = 'Something else' where kind = 'veil' $$,
  '42501', null, 'the DM answers a request but never rewrites it');
select lives_ok($$
  insert into public.canon_tonight_pins (campaign_id, entry_id) values ('12790000-0000-4000-8000-000000000010', '12790000-0000-4000-8000-000000000101')
$$, 'the DM pins a secret for the next session');
select lives_ok($$
  update public.canon_lore_passages set body = 'She lit it by accident.' where id = '12790000-0000-4000-8000-000000000201'
$$, 'the DM edits the player''s passage');
select is((select body_before_dm_edit from public.canon_lore_passages where id = '12790000-0000-4000-8000-000000000201'),
  'I lit it, and I would again.', 'the passage keeps what the player had written');
update public.canon_lore_passages set body = 'She lit it, mostly by accident.' where id = '12790000-0000-4000-8000-000000000201';
select is((select body_before_dm_edit from public.canon_lore_passages where id = '12790000-0000-4000-8000-000000000201'),
  'I lit it, and I would again.', 'a second DM edit keeps the player''s words, not the DM''s first draft');

-- ── Another table ───────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12790000-0000-4000-8000-000000000004', true);
select is_empty($$ select * from public.get_player_common_beliefs('12790000-0000-4000-8000-000000000010') $$,
  'another table''s DM learns no cover story');
select throws_ok($$ select public.ask_for_line_or_veil('12790000-0000-4000-8000-000000000010', 'veil', 'Not my table') $$,
  '42501', null, 'and cannot ask at a table they do not play at');

-- ── The player again ────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12790000-0000-4000-8000-000000000002', true);
update public.canon_lore_passages set body = 'Fine. By accident.' where id = '12790000-0000-4000-8000-000000000201';
select ok((select dm_edited_at is null and body_before_dm_edit is null from public.canon_lore_passages
            where id = '12790000-0000-4000-8000-000000000201'),
  'the player''s own next edit makes the words theirs again');

select * from finish();
rollback;
