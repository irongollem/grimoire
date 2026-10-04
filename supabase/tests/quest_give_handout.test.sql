begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- A quest gives the party a handout: `give_handout` (#970, 20261004110516).
--
-- Fires on the edge like any verb, hands the document to the whole party
-- through the same reveal path as the DM's own share_handout, and `previous`
-- withdraws exactly the recipients that event added, leaving a recipient the
-- DM gave it to by hand, and everything it revealed, where they were. A rule
-- can only name a handout from the quest's own campaign.

set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('97100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gh-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('97100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gh-p1@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('97100000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gh-p2@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('97100000-0000-4000-8000-000000000010', '97100000-0000-4000-8000-000000000001', 'Given'),
  ('97100000-0000-4000-8000-000000000011', '97100000-0000-4000-8000-000000000001', 'Other table');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('97100000-0000-4000-8000-000000000030', '97100000-0000-4000-8000-000000000002', '97100000-0000-4000-8000-000000000010', 'Nessa', '2014'),
  ('97100000-0000-4000-8000-000000000031', '97100000-0000-4000-8000-000000000003', '97100000-0000-4000-8000-000000000010', 'Bram', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('97100000-0000-4000-8000-000000000010', '97100000-0000-4000-8000-000000000001', 'dm', 'The DM', null),
  ('97100000-0000-4000-8000-000000000011', '97100000-0000-4000-8000-000000000001', 'dm', 'The DM', null),
  ('97100000-0000-4000-8000-000000000010', '97100000-0000-4000-8000-000000000002', 'player', 'P1', '97100000-0000-4000-8000-000000000030'),
  ('97100000-0000-4000-8000-000000000010', '97100000-0000-4000-8000-000000000003', 'player', 'P2', '97100000-0000-4000-8000-000000000031')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.npcs (id, user_id, campaign_id, name, player_visible_to, player_visible_fields) values
  ('97100000-0000-4000-8000-000000000020', '97100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000010',
   'The widow', '{}'::uuid[], '{}'::text[]);

-- Nessa already holds the letter, given by hand; Bram does not.
insert into public.scriptorium_documents (id, user_id, campaign_id, title, content, player_visible_to) values
  ('97100000-0000-4000-8000-000000000080', '97100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000010', 'The widow''s letter',
   jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
     jsonb_build_object('type', 'entityEmbed', 'attrs', jsonb_build_object('entityType', 'npc', 'entityId', '97100000-0000-4000-8000-000000000020', 'showArt', true, 'reveal', null))
   ))::text,
   array['97100000-0000-4000-8000-000000000030']::uuid[]),
  ('97100000-0000-4000-8000-000000000081', '97100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000011', 'Another table''s note', '{"type":"doc"}', '{}'::uuid[]);

insert into public.quests (id, user_id, campaign_id, title)
values ('97100000-0000-4000-8000-000000000040', '97100000-0000-4000-8000-000000000001', '97100000-0000-4000-8000-000000000010', 'The petition');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('97100000-0000-4000-8000-000000000041', '97100000-0000-4000-8000-000000000040', '97100000-0000-4000-8000-000000000010', 'At the door'),
  ('97100000-0000-4000-8000-000000000042', '97100000-0000-4000-8000-000000000040', '97100000-0000-4000-8000-000000000010', 'She hands it over');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id) values
  ('97100000-0000-4000-8000-000000000050', '97100000-0000-4000-8000-000000000040', '97100000-0000-4000-8000-000000000010',
   '97100000-0000-4000-8000-000000000041', '97100000-0000-4000-8000-000000000042');

set local role authenticated;
select set_config('request.jwt.claim.sub', '97100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ insert into public.quest_consequences (quest_id, on_edge_id, action, target_document_id)
     values ('97100000-0000-4000-8000-000000000040', '97100000-0000-4000-8000-000000000050',
             'give_handout', '97100000-0000-4000-8000-000000000081') $$,
  '23514', null, 'a rule cannot give another campaign''s document');

select throws_ok(
  $$ insert into public.quest_consequences (quest_id, on_edge_id, action)
     values ('97100000-0000-4000-8000-000000000040', '97100000-0000-4000-8000-000000000050', 'give_handout') $$,
  '23514', null, 'give_handout names its handout');

select lives_ok(
  $$ insert into public.quest_consequences (quest_id, on_edge_id, action, target_document_id)
     values ('97100000-0000-4000-8000-000000000040', '97100000-0000-4000-8000-000000000050',
             'give_handout', '97100000-0000-4000-8000-000000000080') $$,
  'the DM writes a rule giving the letter on the edge (positive control)');

select lives_ok($$
  select public.transition_quest_runtime(
    '97100000-0000-4000-8000-000000000010', '97100000-0000-4000-8000-000000000040',
    (select id from public.quest_threads where quest_id = '97100000-0000-4000-8000-000000000040' and label = 'Main'),
    'start', 0, '97100000-0000-4000-8000-000000000041')
$$, 'the quest starts at the door');

select lives_ok($$
  select public.transition_quest_runtime(
    '97100000-0000-4000-8000-000000000010', '97100000-0000-4000-8000-000000000040',
    (select id from public.quest_threads where quest_id = '97100000-0000-4000-8000-000000000040' and label = 'Main'),
    'advance', 1, null, '97100000-0000-4000-8000-000000000050')
$$, 'and advances along the edge that gives the letter');

select is(
  (select array(select x from unnest(player_visible_to) x order by x)
     from public.scriptorium_documents where id = '97100000-0000-4000-8000-000000000080'),
  array['97100000-0000-4000-8000-000000000030', '97100000-0000-4000-8000-000000000031']::uuid[],
  'the whole party now holds the letter');

select is(
  (select handout_member_ids from public.quest_consequence_events
    where target_document_id = '97100000-0000-4000-8000-000000000080'),
  array['97100000-0000-4000-8000-000000000031']::uuid[],
  'the event remembers only the recipient it added');

select is(
  (select row(array(select x from unnest(player_visible_to) x order by x), player_visible_fields)::text
     from public.npcs where id = '97100000-0000-4000-8000-000000000020'),
  row(array['97100000-0000-4000-8000-000000000030', '97100000-0000-4000-8000-000000000031']::uuid[],
      array['name', 'portrait']::text[])::text,
  'and it revealed the widow it names, to everyone who holds it');

select lives_ok($$
  select public.transition_quest_runtime(
    '97100000-0000-4000-8000-000000000010', '97100000-0000-4000-8000-000000000040',
    (select id from public.quest_threads where quest_id = '97100000-0000-4000-8000-000000000040' and label = 'Main'),
    'previous', 2)
$$, 'stepping back undoes the arrival');

select is(
  (select player_visible_to from public.scriptorium_documents where id = '97100000-0000-4000-8000-000000000080'),
  array['97100000-0000-4000-8000-000000000030']::uuid[],
  'undo takes the letter back from Bram and leaves Nessa''s hand-given copy');

select is(
  (select cardinality(player_visible_to) from public.npcs where id = '97100000-0000-4000-8000-000000000020'),
  2, 'what the letter revealed stays revealed');

select * from finish();
rollback;
