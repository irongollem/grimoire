begin;

create extension if not exists pgtap with schema extensions;
select plan(52);

select has_table('public', 'loot_placements', 'beat loot has a dedicated orchestration table');
select has_function('public', 'dispatch_loot', array['uuid[]'], 'loot has an atomic dispatch RPC, home-agnostic');
select has_function('public', 'get_loot_placements', array['uuid', 'uuid', 'uuid'], 'loot has a batched status RPC, filterable by quest or room');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'loot_placements'), 'beat loot dispatch changes publish to Run mode');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'campaign_messages'), 'chat claim changes publish to Run mode');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('66100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue661-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('66100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue661-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('66100000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue661-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('66100000-0000-4000-8000-000000000010', '66100000-0000-4000-8000-000000000001', 'Beat loot campaign');
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
values ('66100000-0000-4000-8000-000000000020', '66100000-0000-4000-8000-000000000001', '66100000-0000-4000-8000-000000000002', '66100000-0000-4000-8000-000000000010', 'Claiming hero');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('66100000-0000-4000-8000-000000000010', '66100000-0000-4000-8000-000000000001', 'dm', 'Loot DM', null),
  ('66100000-0000-4000-8000-000000000010', '66100000-0000-4000-8000-000000000002', 'player', 'Loot player', '66100000-0000-4000-8000-000000000020')
on conflict (campaign_id, user_id) do update
set role = excluded.role, display_name = excluded.display_name, party_member_id = excluded.party_member_id;

insert into public.items (id, user_id, campaign_id, name, item_type, rarity, tags)
values ('66100000-0000-4000-8000-000000000030', '66100000-0000-4000-8000-000000000001', '66100000-0000-4000-8000-000000000010', 'Moon key', 'gear', 'mundane', array['container']::text[]);
insert into public.quests (id, user_id, campaign_id, title)
values ('66100000-0000-4000-8000-000000000040', '66100000-0000-4000-8000-000000000001', '66100000-0000-4000-8000-000000000010', 'Vault quest');
insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000040', '66100000-0000-4000-8000-000000000010', 'Open the vault');
insert into public.quest_beat_transitions (
  campaign_id, to_quest_id, to_beat_id, transition_kind, runtime_version, created_at
) values (
  '66100000-0000-4000-8000-000000000010', '66100000-0000-4000-8000-000000000040',
  '66100000-0000-4000-8000-000000000050', 'enter', 1, now() - interval '1 minute'
);

select throws_ok($$
  insert into public.loot_placements (beat_id, quest_id, campaign_id, kind, payload)
  values ('66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000040', '66100000-0000-4000-8000-000000000010', 'currency', '{"gp":0}')
$$, '23514', null, 'empty currency cannot become a misleading drop');

select lives_ok($$
  insert into public.loot_placements (id, beat_id, quest_id, campaign_id, kind, item_id, quantity, label, payload, source_type, source_id, sort_order) values
    ('66100000-0000-4000-8000-000000000061', '66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000040', '66100000-0000-4000-8000-000000000010', 'item', '66100000-0000-4000-8000-000000000030', 2, 'Moon keys', '{}', 'quest_reward', '66100000-0000-4000-8000-000000000040', 1),
    ('66100000-0000-4000-8000-000000000062', '66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000040', '66100000-0000-4000-8000-000000000010', 'currency', null, 1, 'Vault purse', '{"gp":12,"sp":3}', 'prepared', null, 2),
    ('66100000-0000-4000-8000-000000000063', '66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000040', '66100000-0000-4000-8000-000000000010', 'loot_chest', null, 1, '', '{"loot_table_id":null,"loot_table_name":"Vault cache","chest_image_url":null,"rolled_atoms":[{"atom_id":"atom-1","type":"currency","gp":1}],"claims_total":1}', 'encounter_loot', null, 3)
$$, 'item, currency, and encounter chest placements share the beat without cloning inventory');

set local role authenticated;
select set_config('request.jwt.claim.sub', '66100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::integer from public.loot_placements), 3, 'the DM can read prepared beat loot');
select is((select delivery_state from public.dispatch_loot(array['66100000-0000-4000-8000-000000000061']::uuid[])), 'chat', 'one entry dispatches to chat');
select is((select type from public.campaign_messages limit 1), 'item_drop', 'item dispatch uses the existing item drop message type');
select is((select metadata->>'quest_loot_entry_id' from public.campaign_messages limit 1), '66100000-0000-4000-8000-000000000061', 'chat carries durable quest loot provenance');
select is(
  (select message_id from public.dispatch_loot(array['66100000-0000-4000-8000-000000000061']::uuid[])),
  (select dispatch_message_id from public.loot_placements where id = '66100000-0000-4000-8000-000000000061'),
  'repeated per-entry dispatch returns the original message'
);
select is((select count(*)::integer from public.campaign_messages), 1, 'idempotent dispatch creates no duplicate message');
select is((select count(*)::integer from public.dispatch_loot(array['66100000-0000-4000-8000-000000000061', '66100000-0000-4000-8000-000000000062', '66100000-0000-4000-8000-000000000063']::uuid[])), 3, 'drop-all returns every entry consistently');
select is((select count(*)::integer from public.campaign_messages), 3, 'drop-all creates only the two remaining messages');
select is((select count(*)::integer from public.get_loot_placements('66100000-0000-4000-8000-000000000010') where delivery_state = 'chat'), 3, 'batched status reports all fresh messages as claimable chat');
select is((select quantity_remaining from public.get_loot_placements('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000061'), 2, 'Run status reports the authoritative remaining item quantity');
select ok((select handed_out_this_session from public.get_loot_placements('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000061'), 'session handout status is derived from transition and message time');
select throws_ok($$
  update public.loot_placements set quantity = 99 where id = '66100000-0000-4000-8000-000000000061'
$$, '23514', null, 'dispatched payload provenance is immutable');
delete from public.loot_placements where id = '66100000-0000-4000-8000-000000000061';
select is((select count(*)::integer from public.loot_placements where id = '66100000-0000-4000-8000-000000000061'), 1, 'a dispatched provenance row cannot be deleted directly');

select set_config('request.jwt.claim.sub', '66100000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.loot_placements), 0, 'players cannot read DM preparation rows');
select is((select count(*)::integer from public.get_loot_placements('66100000-0000-4000-8000-000000000010')), 0, 'players cannot use the DM status projection');
select throws_ok($$
  select * from public.dispatch_loot(array['66100000-0000-4000-8000-000000000061', '66100000-0000-4000-8000-000000000062', '66100000-0000-4000-8000-000000000063']::uuid[])
$$, 'P0001', null, 'players cannot dispatch prepared beat loot');
select lives_ok($$
  select public.grab_item_drop(
    (select id from public.campaign_messages where metadata->>'quest_loot_entry_id' = '66100000-0000-4000-8000-000000000061'),
    1, '66100000-0000-4000-8000-000000000003', 'Claiming hero', '66100000-0000-4000-8000-000000000020'
  )
$$, 'existing atomic item claim ignores the legacy caller-supplied user id');
select is(
  (select metadata->'claims'->0->>'user_id' from public.campaign_messages where metadata->>'quest_loot_entry_id' = '66100000-0000-4000-8000-000000000061'),
  '66100000-0000-4000-8000-000000000002',
  'item claims derive the claimant from auth.uid rather than the compatibility parameter'
);
select lives_ok($$
  select public.claim_currency_drop(
    (select id from public.campaign_messages where metadata->>'quest_loot_entry_id' = '66100000-0000-4000-8000-000000000062'),
    'Claiming hero', '66100000-0000-4000-8000-000000000020'
  )
$$, 'existing atomic currency claim delivers beat loot');

select set_config('request.jwt.claim.sub', '66100000-0000-4000-8000-000000000001', true);
select is((select delivery_state from public.get_loot_placements('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000061'), 'partially_claimed', 'partial stack claims are reflected in Run status');
select is((select quantity_remaining from public.get_loot_placements('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000061'), 1, 'partial claim quantity is reflected in Run status');
select is((select claimed_by_names[1] from public.get_loot_placements('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000061'), 'Claiming hero', 'item claimant is reflected in Run status');
select is((select delivery_state from public.get_loot_placements('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000062'), 'claimed', 'currency claim is reflected in Run status');
select is((select claimed_by_names[1] from public.get_loot_placements('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000062'), 'Claiming hero', 'currency claimant is reflected in Run status');

delete from public.campaign_messages
where id = (select dispatch_message_id from public.loot_placements where id = '66100000-0000-4000-8000-000000000061');
select is((select delivery_state from public.get_loot_placements('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000061'), 'message_removed', 'deleted chat degrades provenance without becoming held again');
select is((select delivery_state from public.dispatch_loot(array['66100000-0000-4000-8000-000000000061']::uuid[])), 'message_removed', 'deleted chat cannot be accidentally redispatched');

delete from public.quest_beats where id = '66100000-0000-4000-8000-000000000050';
select is((select count(*)::integer from public.campaign_messages), 2, 'deleting a beat does not delete dispatched chat or claimed inventory');
select is((select metadata->>'quest_id' from public.campaign_messages order by created_at limit 1), '66100000-0000-4000-8000-000000000040', 'orphaned chat retains degraded quest provenance');

select set_config('request.jwt.claim.sub', '66100000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.get_loot_placements('66100000-0000-4000-8000-000000000010')), 0, 'outsiders receive no beat loot status');

reset role;
select ok(
  position('for update' in lower(pg_get_functiondef('public.dispatch_loot(uuid[])'::regprocedure))) > 0,
  'dispatch locks rows so concurrent requests serialize'
);
select ok(
  position('for update' in lower(pg_get_functiondef('public.grab_item_drop(uuid,integer,uuid,text,uuid)'::regprocedure))) > 0,
  'stacked item claim races serialize on the existing chat row lock'
);
select ok(
  position('for update' in lower(pg_get_functiondef('public.claim_currency_drop(uuid,text,uuid)'::regprocedure))) > 0,
  'currency claim races serialize on the existing chat row lock'
);
select ok(
  position('for update' in lower(pg_get_functiondef('public.claim_loot_chest_atom(uuid,text,text)'::regprocedure))) > 0,
  'loot chest claim races serialize on the existing chat row lock'
);

-- ── A room holds loot too (#830) ───────────────────────────────────────────
--
-- Everything above is the beat home, unchanged by the rename. These are the
-- second home, plus a regression case for each finding the security audit of
-- migration 20260906225258 raised.

reset role;
insert into public.campaigns (id, user_id, name)
values ('66100000-0000-4000-8000-000000000070', '66100000-0000-4000-8000-000000000001'::uuid, 'Other campaign')
on conflict (id) do nothing;
insert into public.locations (id, user_id, campaign_id, name)
values
  ('66100000-0000-4000-8000-000000000071', '66100000-0000-4000-8000-000000000001'::uuid, '66100000-0000-4000-8000-000000000010', 'The gem mine'),
  ('66100000-0000-4000-8000-000000000072', '66100000-0000-4000-8000-000000000001'::uuid, '66100000-0000-4000-8000-000000000070', 'A room elsewhere');

select throws_ok($$
  insert into public.loot_placements (campaign_id, kind, quantity, label, payload, source_type, sort_order)
  values ('66100000-0000-4000-8000-000000000010', 'currency', 1, 'homeless', '{"gp":1}', 'prepared', 9)
$$, '23514', null, 'loot with no home is refused');

select throws_ok($$
  insert into public.loot_placements (beat_id, quest_id, location_id, campaign_id, kind, quantity, label, payload, source_type, sort_order)
  values ('66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000040', '66100000-0000-4000-8000-000000000071', '66100000-0000-4000-8000-000000000010', 'currency', 1, 'two homes', '{"gp":1}', 'prepared', 9)
$$, '23514', null, 'loot cannot hang on a beat and a room at once');

-- The composite FK, not the validator: a room in another campaign has no
-- (id, campaign_id) pair matching this loot row.
select throws_ok($$
  insert into public.loot_placements (location_id, campaign_id, kind, quantity, label, payload, source_type, sort_order)
  values ('66100000-0000-4000-8000-000000000072', '66100000-0000-4000-8000-000000000010', 'currency', 1, 'trespass', '{"gp":1}', 'prepared', 9)
$$, '23503', null, 'a room from another campaign cannot hold this campaign''s loot');

select lives_ok($$
  insert into public.loot_placements (id, location_id, campaign_id, kind, quantity, label, payload, source_type, sort_order)
  values ('66100000-0000-4000-8000-000000000080', '66100000-0000-4000-8000-000000000071', '66100000-0000-4000-8000-000000000010', 'currency', 1, 'Chest by the door', '{"gp":50}', 'loot_table', 1)
$$, 'a room holds loot with no quest and no beat');

-- Re-homing to a foreign room is refused on UPDATE too, not just INSERT — the
-- constraint holds continuously where the old trigger check only fired on write.
select throws_ok($$
  update public.loot_placements set location_id = '66100000-0000-4000-8000-000000000072' where id = '66100000-0000-4000-8000-000000000080'
$$, '23503', null, 'held room loot cannot be moved to another campaign''s room');

set local role authenticated;
select set_config('request.jwt.claim.sub', '66100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.get_loot_placements('66100000-0000-4000-8000-000000000010', null, '66100000-0000-4000-8000-000000000071')),
  1, 'the status RPC filters by room as well as by quest'
);

-- Finding 3: a "drop all" list plus a per-row button legitimately repeats an id.
select is(
  (select delivery_state from public.dispatch_loot(array['66100000-0000-4000-8000-000000000080', '66100000-0000-4000-8000-000000000080']::uuid[])),
  'chat', 'a repeated id in one call still drops once'
);
select is(
  (select count(*)::integer from public.campaign_messages where metadata->>'quest_loot_entry_id' = '66100000-0000-4000-8000-000000000080'),
  1, 'a repeated id mints exactly one message'
);

-- The drop and the fact are one act, one way only.
select ok(
  (select value from public.location_state where location_id = '66100000-0000-4000-8000-000000000071' and fact = 'looted'),
  'dropping a room''s loot records that the room was looted'
);

-- Finding 5: the room's uuid must not reach the players' chat metadata.
select ok(
  (select metadata->>'location_id' is null from public.campaign_messages where metadata->>'quest_loot_entry_id' = '66100000-0000-4000-8000-000000000080'),
  'a room drop does not leak the room id to every player in the campaign'
);

-- Finding 2: one message, so the error cannot distinguish "not yours" from
-- "does not exist" and become an existence oracle over the whole table.
select set_config('request.jwt.claim.sub', '66100000-0000-4000-8000-000000000003', true);
select throws_ok(
  format($$select * from public.dispatch_loot(array[%L]::uuid[])$$, '66100000-0000-4000-8000-000000000080'),
  'One or more loot entries are not yours to drop',
  'an outsider cannot drop a stranger''s loot'
);
select throws_ok(
  $$select * from public.dispatch_loot(array['deadbeef-0000-4000-8000-00000000dead']::uuid[])$$,
  'One or more loot entries are not yours to drop',
  'a nonexistent id fails with the same message, revealing nothing'
);

select * from finish();
rollback;
