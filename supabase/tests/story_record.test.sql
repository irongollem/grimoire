begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

-- The record of what is true in a story (#1021). What goes wrong silently here: a player reading a fact the party
-- has not learned (or learning who it is about from its ties), a fact quietly rewritten so the story no longer
-- adds up, and a fact tied to another campaign's people.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12170000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'record-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12170000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'record-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12170000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'record-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12170000-0000-4000-8000-000000000010', '12170000-0000-4000-8000-000000000001', 'Record campaign', 'dnd5e-2024'),
  ('12170000-0000-4000-8000-000000000011', '12170000-0000-4000-8000-000000000001', 'The DM''s other campaign', 'dnd5e-2024');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('12170000-0000-4000-8000-000000000010', '12170000-0000-4000-8000-000000000001', 'dm', 'The DM'),
  ('12170000-0000-4000-8000-000000000010', '12170000-0000-4000-8000-000000000002', 'player', 'The player')
on conflict (campaign_id, user_id) do update set role = excluded.role, display_name = excluded.display_name;

insert into public.npcs (id, user_id, campaign_id, name) values
  ('12170000-0000-4000-8000-000000000020', '12170000-0000-4000-8000-000000000001', '12170000-0000-4000-8000-000000000010', 'Honeycomb'),
  ('12170000-0000-4000-8000-000000000021', '12170000-0000-4000-8000-000000000001', '12170000-0000-4000-8000-000000000011', 'Someone in the other campaign');

-- ── The DM files facts ───────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '12170000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.story_facts (id, campaign_id, body, known_to_player, source) values
  ('12170000-0000-4000-8000-000000000030', '12170000-0000-4000-8000-000000000010', 'The party holds the brass key.', true, 'table'),
  ('12170000-0000-4000-8000-000000000031', '12170000-0000-4000-8000-000000000010', 'Honeycomb is not the heir.', false, 'table');

insert into public.story_fact_links (fact_id, campaign_id, kind, npc_id) values
  ('12170000-0000-4000-8000-000000000030', '12170000-0000-4000-8000-000000000010', 'npc', '12170000-0000-4000-8000-000000000020'),
  ('12170000-0000-4000-8000-000000000031', '12170000-0000-4000-8000-000000000010', 'npc', '12170000-0000-4000-8000-000000000020');

select is((select count(*)::integer from public.story_facts), 2, 'the DM reads every fact, hidden ones too');

select throws_ok(
  $$ update public.story_facts set body = 'The party never had a key.' where id = '12170000-0000-4000-8000-000000000030' $$,
  '23514',
  null,
  'a fact on record cannot be rewritten, even by the DM'
);

-- Positive control for the guard above: the one thing that may change does change.
select lives_ok(
  $$ update public.story_facts set known_to_player = false where id = '12170000-0000-4000-8000-000000000030';
     update public.story_facts set known_to_player = true where id = '12170000-0000-4000-8000-000000000030' $$,
  'whether the party knows a fact may change'
);

select lives_ok(
  $$ insert into public.story_facts (campaign_id, body, supersedes_id, source)
     values ('12170000-0000-4000-8000-000000000010', 'The party gave the brass key to Honeycomb.',
             '12170000-0000-4000-8000-000000000030', 'table') $$,
  'a later fact overtakes an earlier one, and both stay'
);

select throws_ok(
  $$ insert into public.story_fact_links (fact_id, campaign_id, kind, npc_id)
     values ('12170000-0000-4000-8000-000000000030', '12170000-0000-4000-8000-000000000010', 'npc',
             '12170000-0000-4000-8000-000000000021') $$,
  '23514',
  null,
  'a fact cannot be tied to someone in another campaign, even one the same DM runs'
);

-- ── The player ───────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12170000-0000-4000-8000-000000000002', true);

select results_eq(
  $$ select body from public.story_facts order by created_at, body $$,
  $$ values ('The party gave the brass key to Honeycomb.'), ('The party holds the brass key.') $$,
  'a player reads what the party knows and not the hidden fact'
);

select is(
  (select count(*)::integer from public.story_fact_links where fact_id = '12170000-0000-4000-8000-000000000031'),
  0,
  'the ties of a hidden fact are hidden too, or they would say who it is about'
);

select is(
  (select count(*)::integer from public.story_fact_links where fact_id = '12170000-0000-4000-8000-000000000030'),
  1,
  'the ties of a known fact are readable'
);

select throws_ok(
  $$ insert into public.story_facts (campaign_id, body)
     values ('12170000-0000-4000-8000-000000000010', 'The player owns a holy avenger.') $$,
  '42501',
  null,
  'a player cannot put a fact on record by writing the table'
);

select is_empty(
  $$ update public.story_facts set known_to_player = true where id = '12170000-0000-4000-8000-000000000031' returning id $$,
  'a player cannot reveal a hidden fact to themselves'
);

-- ── Someone outside the campaign ─────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12170000-0000-4000-8000-000000000003', true);

select is((select count(*)::integer from public.story_facts), 0, 'someone outside the campaign reads nothing of its record');
select is((select count(*)::integer from public.story_fact_links), 0, 'nor what its facts are about');

reset role;

-- ── The campaign changes hands (20261119121114) ────────────────────────────
-- Bug caught: the record left with the outgoing owner, whose account deletion would erase it; and, once the move
-- named this table, the whole transfer failing on the trigger that keeps a fact from being rewritten.
select lives_ok(
  $$ select private.move_campaign_content('12170000-0000-4000-8000-000000000010', '12170000-0000-4000-8000-000000000001', '12170000-0000-4000-8000-000000000002', false, false) $$,
  'a campaign''s record can be handed to a new owner'
);
select is(
  (select count(*)::integer from public.story_facts where campaign_id = '12170000-0000-4000-8000-000000000010' and user_id is distinct from '12170000-0000-4000-8000-000000000002'),
  0, 'and every fact of it then belongs to them'
);
-- Bug caught: the exception for the hand-over opening the keeper of a fact to any update.
select throws_ok(
  $$ update public.story_facts set user_id = '12170000-0000-4000-8000-000000000001' where campaign_id = '12170000-0000-4000-8000-000000000010' $$,
  '23514', null, 'outside a hand-over a fact''s keeper is still not rewritten'
);


-- ── The DM strikes a fact (#1226 story 9): it never happened, so the players stop reading it ──
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '12170000-0000-4000-8000-000000000001', true);
update public.story_facts set struck_at = now() where id = '12170000-0000-4000-8000-000000000030';
select throws_ok($$
  update public.story_facts set kept_at = now() where id = '12170000-0000-4000-8000-000000000030'
$$, '23514', null, 'a struck fact cannot also be kept');
select set_config('request.jwt.claim.sub', '12170000-0000-4000-8000-000000000002', true);
select is_empty($$ select id from public.story_facts where id = '12170000-0000-4000-8000-000000000030' $$,
  'a player no longer reads a fact the DM struck, though it was known to them');
select is_empty($$ select id from public.story_fact_links where fact_id = '12170000-0000-4000-8000-000000000030' $$,
  'nor whom a struck fact was about');

select * from finish();
rollback;
