-- #954: shared library content is referenced, not cloned. Covers the migration
-- 20261003083553: beat attachments, loot placements, encounter item_ids and
-- downtime reward ids all accept a library (text) id, and each refusal sits
-- beside a positive control so a broken fixture cannot pass as a refusal.
--
--   u1 DM of c1      u2 player in c1

begin;

create extension if not exists pgtap with schema extensions;
select plan(23);

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('95400000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'libref-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;

insert into public.campaigns (id, user_id, name)
values ('95400000-0000-4000-8000-0000000000c1', '95400000-0000-4000-8000-000000000001', 'Library refs table');
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset)
values ('95400000-0000-4000-8000-0000000000e1', '95400000-0000-4000-8000-000000000002',
        '95400000-0000-4000-8000-000000000002', null, 'Libref ranger', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('95400000-0000-4000-8000-0000000000c1', '95400000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('95400000-0000-4000-8000-0000000000c1', '95400000-0000-4000-8000-000000000002', 'player', 'Player', '95400000-0000-4000-8000-0000000000e1')
on conflict (campaign_id, user_id) do update
  set role = excluded.role, party_member_id = excluded.party_member_id;

-- Our own library rows, so the test does not depend on what a stack happens
-- to have seeded.
insert into public.library_items (id, name, rarity, source_document_key, source_record_key)
values ('libref_test_item', 'Libref Moonblade', 'rare', 'libref-test', 'libref-test-item'),
       ('libref_test_item_b', 'Libref Sunblade', 'rare', 'libref-test', 'libref-test-item-b');
insert into public.library_monsters (id, name, monster_type, ruleset, conceptual_key, source_document_key, source_record_key, stat_block)
values ('libref_test_monster', 'Libref Wyrm', 'dragon', '2014', 'libref-test-monster', 'libref-test', 'libref-test-monster', '{}'::jsonb);

insert into public.quests (id, user_id, campaign_id, title)
values ('95400000-0000-4000-8000-000000000020', '95400000-0000-4000-8000-000000000001', '95400000-0000-4000-8000-0000000000c1', 'Libref quest');
insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('95400000-0000-4000-8000-000000000030', '95400000-0000-4000-8000-000000000020', '95400000-0000-4000-8000-0000000000c1', 'Libref beat');
insert into public.monsters (id, user_id, campaign_id, name)
values ('95400000-0000-4000-8000-000000000050', '95400000-0000-4000-8000-000000000001', '95400000-0000-4000-8000-0000000000c1', 'Vault monster');

insert into public.downtime_grants (campaign_id, party_member_id, amount)
values ('95400000-0000-4000-8000-0000000000c1', '95400000-0000-4000-8000-0000000000e1', 2);
insert into public.downtime_draws (id, campaign_id, party_member_id, activity_key) values
  ('95400000-0000-4000-8000-0000000000d1', '95400000-0000-4000-8000-0000000000c1', '95400000-0000-4000-8000-0000000000e1', 'carousing');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"95400000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

set local role authenticated;
select pg_temp.as_user(1);

-- ── Beat attachments ─────────────────────────────────────────────────────────

select lives_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('95400000-0000-4000-8000-000000000030', '95400000-0000-4000-8000-000000000020', '95400000-0000-4000-8000-0000000000c1', 'item', 'libref_test_item')
$$, 'a library item can be placed on a beat by reference');

select throws_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('95400000-0000-4000-8000-000000000030', '95400000-0000-4000-8000-000000000020', '95400000-0000-4000-8000-0000000000c1', 'item', 'libref_no_such_item')
$$, '23514', null, 'a nonexistent library item id is refused');

select lives_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('95400000-0000-4000-8000-000000000030', '95400000-0000-4000-8000-000000000020', '95400000-0000-4000-8000-0000000000c1', 'monster', 'libref_test_monster')
$$, 'a library monster can be placed on a beat by reference');

select throws_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('95400000-0000-4000-8000-000000000030', '95400000-0000-4000-8000-000000000020', '95400000-0000-4000-8000-0000000000c1', 'monster', 'libref_no_such_monster')
$$, '23514', null, 'a nonexistent library monster id is refused');

select lives_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('95400000-0000-4000-8000-000000000030', '95400000-0000-4000-8000-000000000020', '95400000-0000-4000-8000-0000000000c1', 'monster', '95400000-0000-4000-8000-000000000050')
$$, 'a uuid monster attachment still resolves against the vault');

select throws_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('95400000-0000-4000-8000-000000000030', '95400000-0000-4000-8000-000000000020', '95400000-0000-4000-8000-0000000000c1', 'monster', '95400000-0000-4000-8000-0000000000ff')
$$, '23514', null, 'a uuid monster that is not in the vault is still refused');

-- ── Loot placements ──────────────────────────────────────────────────────────

select lives_ok($$
  insert into public.loot_placements (id, beat_id, quest_id, campaign_id, kind, library_item_id, quantity, label, payload, source_type, sort_order)
  values ('95400000-0000-4000-8000-000000000061', '95400000-0000-4000-8000-000000000030', '95400000-0000-4000-8000-000000000020', '95400000-0000-4000-8000-0000000000c1', 'item', 'libref_test_item', 2, '', '{}', 'prepared', 1)
$$, 'item loot may hold a library item alone');

select throws_ok($$
  insert into public.loot_placements (beat_id, quest_id, campaign_id, kind, item_id, library_item_id, quantity, payload, source_type)
  values ('95400000-0000-4000-8000-000000000030', '95400000-0000-4000-8000-000000000020', '95400000-0000-4000-8000-0000000000c1', 'item', gen_random_uuid(), 'libref_test_item', 1, '{}', 'prepared')
$$, '23514', null, 'item loot naming both a vault and a library item is refused');

select throws_ok($$
  insert into public.loot_placements (beat_id, quest_id, campaign_id, kind, quantity, payload, source_type)
  values ('95400000-0000-4000-8000-000000000030', '95400000-0000-4000-8000-000000000020', '95400000-0000-4000-8000-0000000000c1', 'item', 1, '{}', 'prepared')
$$, '23514', null, 'item loot naming neither is refused');

select throws_ok($$
  insert into public.loot_placements (beat_id, quest_id, campaign_id, kind, library_item_id, quantity, payload, source_type)
  values ('95400000-0000-4000-8000-000000000030', '95400000-0000-4000-8000-000000000020', '95400000-0000-4000-8000-0000000000c1', 'currency', 'libref_test_item', 1, '{"gp":5}', 'prepared')
$$, '23514', null, 'currency loot cannot carry a library item');

select throws_ok($$
  insert into public.loot_placements (beat_id, quest_id, campaign_id, kind, library_item_id, quantity, payload, source_type)
  values ('95400000-0000-4000-8000-000000000030', '95400000-0000-4000-8000-000000000020', '95400000-0000-4000-8000-0000000000c1', 'item', 'libref_no_such_item', 1, '{}', 'prepared')
$$, '23503', null, 'a nonexistent library item id fails the foreign key');

select is(
  (select library_item_id from public.get_loot_placements('95400000-0000-4000-8000-0000000000c1') where id = '95400000-0000-4000-8000-000000000061'),
  'libref_test_item',
  'get_loot_placements returns the library item id');
select is(
  (select label from public.get_loot_placements('95400000-0000-4000-8000-0000000000c1') where id = '95400000-0000-4000-8000-000000000061'),
  'Libref Moonblade',
  'an empty placement label falls back to the library item''s name');

-- A player is still refused, with a positive control (the DM) just above.
select pg_temp.as_user(2);
select throws_ok($$
  select * from public.dispatch_loot(array['95400000-0000-4000-8000-000000000061']::uuid[])
$$, 'P0001', 'One or more loot entries are not yours to drop', 'a player cannot dispatch library loot');
select pg_temp.as_user(1);

select is(
  (select delivery_state from public.dispatch_loot(array['95400000-0000-4000-8000-000000000061']::uuid[])),
  'chat', 'the DM dispatches library loot');
select is(
  (select metadata->>'library_item_id' from public.campaign_messages where metadata->>'quest_loot_entry_id' = '95400000-0000-4000-8000-000000000061'),
  'libref_test_item', 'the drop carries the library item id');
select ok(
  (select metadata->>'item_id' is null from public.campaign_messages where metadata->>'quest_loot_entry_id' = '95400000-0000-4000-8000-000000000061'),
  'the drop carries no vault item id');
select is(
  (select metadata->>'item_name' from public.campaign_messages where metadata->>'quest_loot_entry_id' = '95400000-0000-4000-8000-000000000061'),
  'Libref Moonblade', 'the drop is named after the library item');
select throws_ok($$
  update public.loot_placements set library_item_id = 'libref_test_item_b'
  where id = '95400000-0000-4000-8000-000000000061'
$$, '23514', null, 'a dispatched placement''s library item is immutable');

-- ── Encounter item_ids ───────────────────────────────────────────────────────

select lives_ok($$
  insert into public.encounters (id, user_id, campaign_id, name, item_ids)
  values ('95400000-0000-4000-8000-000000000070', '95400000-0000-4000-8000-000000000001', '95400000-0000-4000-8000-0000000000c1', 'Libref fight',
          array['libref_test_item', '95400000-0000-4000-8000-000000000099'])
$$, 'an encounter holds a library id and a vault uuid in item_ids');
select is(
  (select item_ids[1] from public.encounters where id = '95400000-0000-4000-8000-000000000070'),
  'libref_test_item', 'the library id round-trips through encounters.item_ids');

-- ── Downtime ─────────────────────────────────────────────────────────────────

select pg_temp.as_user(2);
select throws_ok($$
  select public.resolve_downtime_draw('95400000-0000-4000-8000-0000000000d1', 'Found', 'A vignette', 'item', 'libref_test_item', '[]'::jsonb, null)
$$, 'P0002', 'Draw not found', 'a player cannot resolve a draw with a library reward');
select pg_temp.as_user(1);
select is(
  (public.resolve_downtime_draw('95400000-0000-4000-8000-0000000000d1', 'Found', 'A vignette', 'item', 'libref_test_item', '[]'::jsonb, null)).reward_id,
  'libref_test_item', 'the DM resolves a draw with a text library reward id');

select * from finish();
rollback;
