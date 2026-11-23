begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

-- What is moving (20261120033038, #1226 story 4): a force's steps, ticks and quests hang off a force and nothing else,
-- stay in their campaign, and only the campaign's DMs read them; a force never reaches a player.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12260000-0000-4000-8000-000000000301', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'force-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12260000-0000-4000-8000-000000000302', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'force-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12260000-0000-4000-8000-000000000303', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'force-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12260000-0000-4000-8000-000000000310', '12260000-0000-4000-8000-000000000301', 'The Kind Country', 'dnd5e-2014'),
  ('12260000-0000-4000-8000-000000000311', '12260000-0000-4000-8000-000000000303', 'Elsewhere', 'dnd5e-2014');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('12260000-0000-4000-8000-000000000320', '12260000-0000-4000-8000-000000000301', '12260000-0000-4000-8000-000000000310', 'Tansy', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('12260000-0000-4000-8000-000000000310', '12260000-0000-4000-8000-000000000301', 'dm', 'DM', null),
  ('12260000-0000-4000-8000-000000000310', '12260000-0000-4000-8000-000000000302', 'player', 'Tansy', '12260000-0000-4000-8000-000000000320'),
  ('12260000-0000-4000-8000-000000000311', '12260000-0000-4000-8000-000000000303', 'dm', 'Other DM', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.quests (id, user_id, campaign_id, title) values
  ('12260000-0000-4000-8000-000000000340', '12260000-0000-4000-8000-000000000301', '12260000-0000-4000-8000-000000000310', 'The Souring'),
  ('12260000-0000-4000-8000-000000000341', '12260000-0000-4000-8000-000000000303', '12260000-0000-4000-8000-000000000311', 'Elsewhere quest');

insert into public.canon_entries (id, user_id, campaign_id, part, knowledge, title, wants, clock_size, player_visible_to) values
  ('12260000-0000-4000-8000-000000000330', '12260000-0000-4000-8000-000000000301', '12260000-0000-4000-8000-000000000310',
   'force', null, 'The Ferrymen', 'The bridge, and the toll with it.', 6, array['12260000-0000-4000-8000-000000000320']::uuid[]),
  ('12260000-0000-4000-8000-000000000331', '12260000-0000-4000-8000-000000000301', '12260000-0000-4000-8000-000000000310',
   'truth', 'all', 'Magic leaves a taste on the tongue.', null, null, '{}');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000301', true);

select lives_ok($$
  insert into public.canon_force_steps (user_id, campaign_id, force_id, title, sort_order) values
    ('12260000-0000-4000-8000-000000000301', '12260000-0000-4000-8000-000000000310', '12260000-0000-4000-8000-000000000330', 'They buy the bridge.', 0);
  insert into public.canon_force_ticks (user_id, campaign_id, force_id, delta, note) values
    ('12260000-0000-4000-8000-000000000301', '12260000-0000-4000-8000-000000000310', '12260000-0000-4000-8000-000000000330', 1, 'A week passed.');
  insert into public.canon_entry_quests (user_id, campaign_id, entry_id, quest_id) values
    ('12260000-0000-4000-8000-000000000301', '12260000-0000-4000-8000-000000000310', '12260000-0000-4000-8000-000000000330', '12260000-0000-4000-8000-000000000340')
$$, 'the DM gives a force a step, a tick and a quest');

select throws_ok($$
  insert into public.canon_force_steps (user_id, campaign_id, force_id, title) values
    ('12260000-0000-4000-8000-000000000301', '12260000-0000-4000-8000-000000000310', '12260000-0000-4000-8000-000000000331', 'A step on a truth')
$$, '23514', null, 'a step cannot hang off a truth, so a truth never grows a clock');

select throws_ok($$
  insert into public.canon_entry_quests (user_id, campaign_id, entry_id, quest_id) values
    ('12260000-0000-4000-8000-000000000301', '12260000-0000-4000-8000-000000000310', '12260000-0000-4000-8000-000000000330', '12260000-0000-4000-8000-000000000341')
$$, null, null, 'a force cannot be met in another campaign''s quest');

-- #1255: any entry that a quest can turn on may be tied to it, not only a force. 331 is a truth of this campaign.
select lives_ok($$
  insert into public.canon_entry_quests (user_id, campaign_id, entry_id, quest_id) values
    ('12260000-0000-4000-8000-000000000301', '12260000-0000-4000-8000-000000000310', '12260000-0000-4000-8000-000000000331', '12260000-0000-4000-8000-000000000340')
$$, 'a truth is tied to the quest that turns on it');
select throws_ok($$
  with q as (
    insert into public.canon_entries (user_id, campaign_id, part, title) values
      ('12260000-0000-4000-8000-000000000301', '12260000-0000-4000-8000-000000000310', 'question', 'Who cast the bell?')
    returning id)
  insert into public.canon_entry_quests (user_id, campaign_id, entry_id, quest_id)
  select '12260000-0000-4000-8000-000000000301', '12260000-0000-4000-8000-000000000310', q.id, '12260000-0000-4000-8000-000000000340' from q
$$, '23514', null, 'an open question is not tied to a quest: answered, it becomes a truth or a secret that can be');

select throws_ok($$
  insert into public.canon_force_ticks (user_id, campaign_id, force_id, delta) values
    ('12260000-0000-4000-8000-000000000301', '12260000-0000-4000-8000-000000000310', '12260000-0000-4000-8000-000000000330', 0)
$$, '23514', null, 'a tick moves the clock; a tick of nothing is refused');

select throws_ok($$
  update public.canon_entries set wants = 'Everything' where id = '12260000-0000-4000-8000-000000000331'
$$, '23514', null, 'only a force wants something');

-- ── The player, and someone else ──────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000302', true);
select is_empty($$ select id from public.canon_force_steps union all select id from public.canon_force_ticks $$,
  'a player reads no step and no tick of a force');
select ok(
  not exists (select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000310') where part = 'force'),
  'a force never reaches a player, even with the reveal list set');

select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000303', true);
select is_empty($$ select id from public.canon_entry_quests $$, 'another campaign''s DM reads none of this force''s quests');

select * from finish();
rollback;
