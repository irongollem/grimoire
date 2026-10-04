begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

-- A DM shares a Scriptorium handout with players (#970, 20261004105821).
--
-- Pins both halves: who may read a shared handout (a recipient, and nobody
-- else), and what sharing reveals (each linked entry's `reveal`, written into
-- the entity's own visibility, scoped to the handout's campaign). Also that
-- withdrawing a handout leaves what it revealed alone, that rescoping a
-- document withdraws it, and that the doorbell rings for shared documents only.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('97000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ho-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('97000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ho-p1@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('97000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ho-p2@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('97000000-0000-4000-8000-000000000010', '97000000-0000-4000-8000-000000000001', 'Ashmouth'),
  ('97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000001', 'Elsewhere');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('97000000-0000-4000-8000-000000000030', '97000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000010', 'Nessa', '2014'),
  ('97000000-0000-4000-8000-000000000031', '97000000-0000-4000-8000-000000000003', '97000000-0000-4000-8000-000000000010', 'Bram', '2014'),
  ('97000000-0000-4000-8000-000000000032', '97000000-0000-4000-8000-000000000003', '97000000-0000-4000-8000-000000000011', 'Bram elsewhere', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('97000000-0000-4000-8000-000000000010', '97000000-0000-4000-8000-000000000001', 'dm', 'The DM', null),
  ('97000000-0000-4000-8000-000000000011', '97000000-0000-4000-8000-000000000001', 'dm', 'The DM', null),
  ('97000000-0000-4000-8000-000000000010', '97000000-0000-4000-8000-000000000002', 'player', 'P1', '97000000-0000-4000-8000-000000000030'),
  ('97000000-0000-4000-8000-000000000010', '97000000-0000-4000-8000-000000000003', 'player', 'P2', '97000000-0000-4000-8000-000000000031')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

-- What the poster links to: a disguised NPC drawn wrong (art off), an NPC from
-- another campaign, a quest nobody has heard of, a monster, a location set not
-- to reveal, and an item.
insert into public.npcs (id, user_id, campaign_id, name, disguise_name, is_revealed, player_visible_to, player_visible_fields) values
  ('97000000-0000-4000-8000-000000000020', '97000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000010',
   'Ser Vallis', 'The Almoner', false, '{}'::uuid[], '{}'::text[]),
  ('97000000-0000-4000-8000-000000000021', '97000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000011',
   'Elsewhere NPC', null, true, '{}'::uuid[], '{}'::text[]);

insert into public.quests (id, user_id, campaign_id, title, status) values
  ('97000000-0000-4000-8000-000000000040', '97000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000010', 'The Bounty', 'undiscovered');
insert into public.quest_beats (id, quest_id, campaign_id, title, visibility) values
  ('97000000-0000-4000-8000-000000000041', '97000000-0000-4000-8000-000000000040', '97000000-0000-4000-8000-000000000010', 'Wanted', 'hidden');

insert into public.monsters (id, user_id, campaign_id, name, monster_type) values
  ('97000000-0000-4000-8000-000000000050', '97000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000010', 'Tithe Wraith', 'undead');

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('97000000-0000-4000-8000-000000000060', '97000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000010', 'Counting House', 'building');

insert into public.items (id, user_id, name, item_type) values
  ('97000000-0000-4000-8000-000000000070', '97000000-0000-4000-8000-000000000001', 'Tally-stick', 'wondrous');

insert into public.scriptorium_documents (id, user_id, campaign_id, title, content) values
  ('97000000-0000-4000-8000-000000000080', '97000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000010', 'Wanted poster',
   jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
     jsonb_build_object('type', 'paragraph'),
     jsonb_build_object('type', 'entityEmbed', 'attrs', jsonb_build_object('entityType', 'npc', 'entityId', '97000000-0000-4000-8000-000000000020', 'showArt', false, 'reveal', null)),
     jsonb_build_object('type', 'entityEmbed', 'attrs', jsonb_build_object('entityType', 'npc', 'entityId', '97000000-0000-4000-8000-000000000021', 'showArt', true, 'reveal', null)),
     jsonb_build_object('type', 'entityEmbed', 'attrs', jsonb_build_object('entityType', 'quest', 'entityId', '97000000-0000-4000-8000-000000000040', 'reveal', null)),
     jsonb_build_object('type', 'entityEmbed', 'attrs', jsonb_build_object('entityType', 'monster', 'entityId', '97000000-0000-4000-8000-000000000050', 'reveal', null)),
     jsonb_build_object('type', 'entityEmbed', 'attrs', jsonb_build_object('entityType', 'location', 'entityId', '97000000-0000-4000-8000-000000000060', 'reveal', jsonb_build_object('off', true))),
     jsonb_build_object('type', 'entityEmbed', 'attrs', jsonb_build_object('entityType', 'item', 'entityId', '97000000-0000-4000-8000-000000000070', 'reveal', null))
   ))::text),
  ('97000000-0000-4000-8000-000000000081', '97000000-0000-4000-8000-000000000001', '97000000-0000-4000-8000-000000000010', 'DM draft', '{"type":"doc"}'),
  ('97000000-0000-4000-8000-000000000082', '97000000-0000-4000-8000-000000000001', null, 'Account-wide', '{"type":"doc"}');

-- ── As the DM ──────────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temporary table dry on commit drop as
  select public.share_handout('97000000-0000-4000-8000-000000000080',
                              array['97000000-0000-4000-8000-000000000030']::uuid[], true) as r;

select is(
  (select jsonb_path_query_first(r, '$.revealed[*] ? (@.type == "npc")') from dry),
  jsonb_build_object('type', 'npc', 'id', '97000000-0000-4000-8000-000000000020', 'name', 'Ser Vallis',
                     'fields', jsonb_build_array('name'), 'seen_as', 'The Almoner'),
  'a dry run reports the NPC: name only (its art is off on the poster), seen as its disguise');

select is(
  (select jsonb_path_query_array(r, '$.withheld[*].reason') from dry),
  '["outside_campaign", "not_revealed", "found_only"]'::jsonb,
  'and withholds the other campaign''s NPC, the location set not to reveal, and the item');

select is(
  (select player_visible_to from public.npcs where id = '97000000-0000-4000-8000-000000000020'),
  '{}'::uuid[], 'a dry run writes nothing');

select lives_ok(
  $$ select public.share_handout('97000000-0000-4000-8000-000000000080',
                                 array['97000000-0000-4000-8000-000000000030']::uuid[]) $$,
  'the DM shares the poster with Nessa');

select is(
  (select player_visible_to from public.scriptorium_documents where id = '97000000-0000-4000-8000-000000000080'),
  array['97000000-0000-4000-8000-000000000030']::uuid[], 'Nessa holds the handout');

select is(
  (select row(player_visible_to, player_visible_fields)::text from public.npcs where id = '97000000-0000-4000-8000-000000000020'),
  row(array['97000000-0000-4000-8000-000000000030']::uuid[], array['name']::text[])::text,
  'the NPC is now known to Nessa by name, and the real portrait stays withheld');

select is(
  (select player_visible_to from public.npcs where id = '97000000-0000-4000-8000-000000000021'),
  '{}'::uuid[], 'an NPC from another campaign is never revealed, whatever the embed says');

select is(
  (select row(status, player_visible_to)::text from public.quests where id = '97000000-0000-4000-8000-000000000040'),
  row('active'::quest_status_enum, array['97000000-0000-4000-8000-000000000030']::uuid[])::text,
  'the handout starts the quest and shows it to Nessa');

select is(
  (select visibility from public.quest_beats where id = '97000000-0000-4000-8000-000000000041'),
  'rumored', 'its entry beat becomes the rumour');

select is(
  (select row(visible_to, reveal_stats)::text from public.discovered_monsters
    where campaign_id = '97000000-0000-4000-8000-000000000010' and monster_id = '97000000-0000-4000-8000-000000000050'),
  row(array['97000000-0000-4000-8000-000000000030']::uuid[], false)::text,
  'the monster is discovered by Nessa, stats still hidden');

select is(
  (select player_visible_to from public.locations where id = '97000000-0000-4000-8000-000000000060'),
  '{}'::uuid[], 'a location set not to reveal stays unshared');

select is(
  (select jsonb_array_length(public.share_handout('97000000-0000-4000-8000-000000000080',
                                 array['97000000-0000-4000-8000-000000000030']::uuid[], true) -> 'revealed')),
  0, 're-sharing to the same table reveals nothing new');

select throws_ok(
  $$ select public.share_handout('97000000-0000-4000-8000-000000000080',
                                 array['97000000-0000-4000-8000-000000000032']::uuid[]) $$,
  '22023', null, 'a recipient from another campaign is refused');

select throws_ok(
  $$ select public.share_handout('97000000-0000-4000-8000-000000000082',
                                 array['97000000-0000-4000-8000-000000000030']::uuid[]) $$,
  '22023', null, 'an account-wide document cannot be shared');

-- ── As Nessa, who holds it ─────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000002', true);

select is(
  (select array_agg(title order by title) from public.scriptorium_documents),
  array['Wanted poster'], 'Nessa reads the poster and nothing else of the DM''s');

select is(
  (select name from public.get_player_visible_npcs('97000000-0000-4000-8000-000000000010')
    where id = '97000000-0000-4000-8000-000000000020'),
  'The Almoner', 'and through the projection knows the NPC by the name on the poster');

select is_empty(
  $$ update public.scriptorium_documents set title = 'Defaced'
      where id = '97000000-0000-4000-8000-000000000080' returning id $$,
  'a holder cannot write the handout');

select throws_ok(
  $$ select public.share_handout('97000000-0000-4000-8000-000000000080',
                                 array['97000000-0000-4000-8000-000000000031']::uuid[]) $$,
  '42501', null, 'a player cannot share a handout (positive control: the DM could, above)');

-- ── As Bram, who does not ──────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000003', true);

select is_empty(
  $$ select id from public.scriptorium_documents $$,
  'Bram, at the same table but not given it, reads no handout');

-- ── Withdrawing, rescoping, and the doorbell ───────────────────────────────

select set_config('request.jwt.claim.sub', '97000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ select public.share_handout('97000000-0000-4000-8000-000000000080', '{}'::uuid[]) $$,
  'the DM takes the poster back');

select is(
  (select player_visible_to from public.npcs where id = '97000000-0000-4000-8000-000000000020'),
  array['97000000-0000-4000-8000-000000000030']::uuid[],
  'what it revealed stays revealed: knowledge is not taken back with the paper');

reset role;

delete from public.campaign_sync where campaign_id = '97000000-0000-4000-8000-000000000010';
update public.scriptorium_documents set title = 'DM draft, edited' where id = '97000000-0000-4000-8000-000000000081';
select is_empty(
  $$ select 1 from public.campaign_sync where campaign_id = '97000000-0000-4000-8000-000000000010' $$,
  'an autosave of an unshared draft rings nothing');

update public.scriptorium_documents
   set player_visible_to = array['97000000-0000-4000-8000-000000000031']::uuid[]
 where id = '97000000-0000-4000-8000-000000000081';
select is(
  (select changed_table from public.campaign_sync where campaign_id = '97000000-0000-4000-8000-000000000010'),
  'scriptorium_documents', 'sharing rings the campaign');

delete from public.campaign_sync where campaign_id = '97000000-0000-4000-8000-000000000010';
update public.scriptorium_documents
   set campaign_id = '97000000-0000-4000-8000-000000000011'
 where id = '97000000-0000-4000-8000-000000000081';
select is(
  (select player_visible_to from public.scriptorium_documents where id = '97000000-0000-4000-8000-000000000081'),
  '{}'::uuid[], 'moving a shared document to another campaign withdraws it');

select is(
  (select changed_table from public.campaign_sync where campaign_id = '97000000-0000-4000-8000-000000000010'),
  'scriptorium_documents', 'and rings the campaign it left');

update public.scriptorium_documents
   set campaign_id = '97000000-0000-4000-8000-000000000010',
       player_visible_to = array['97000000-0000-4000-8000-000000000031']::uuid[]
 where id = '97000000-0000-4000-8000-000000000081';
-- Monsters do not cascade with their campaign (delete_campaign_with_homebrew
-- disposes of them first), so clear this fixture's one before the delete.
delete from public.monsters where id = '97000000-0000-4000-8000-000000000050';
select lives_ok(
  $$ delete from public.campaigns where id = '97000000-0000-4000-8000-000000000010' $$,
  'deleting a campaign with a shared document in it still works (set null withdraws the share)');

select is(
  (select row(campaign_id, player_visible_to)::text from public.scriptorium_documents where id = '97000000-0000-4000-8000-000000000081'),
  row(null::uuid, '{}'::uuid[])::text, 'the document survives, account-wide and held by nobody');

select throws_ok(
  $$ update public.scriptorium_documents set player_visible_to = array['97000000-0000-4000-8000-000000000031']::uuid[]
      where id = '97000000-0000-4000-8000-000000000082' $$,
  '23514', null, 'an account-wide document cannot hold recipients');

select * from finish();
rollback;
