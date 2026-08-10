begin;

create extension if not exists pgtap with schema extensions;
select plan(41);

select has_table('public', 'quest_beat_loot', 'beat loot has a dedicated orchestration table');
select has_function('public', 'dispatch_quest_beat_loot', array['uuid', 'uuid'], 'beat loot has an atomic dispatch RPC');
select has_function('public', 'get_quest_beat_loot', array['uuid', 'uuid'], 'beat loot has a batched status RPC');
select ok(exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'quest_beat_loot'), 'beat loot dispatch changes publish to Run mode');
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
insert into public.quests (id, user_id, campaign_id, title, reward_item_ids)
values ('66100000-0000-4000-8000-000000000040', '66100000-0000-4000-8000-000000000001', '66100000-0000-4000-8000-000000000010', 'Vault quest', array['66100000-0000-4000-8000-000000000030']::uuid[]);
insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000040', '66100000-0000-4000-8000-000000000010', 'Open the vault');
insert into public.quest_beat_transitions (
  campaign_id, to_quest_id, to_beat_id, transition_kind, runtime_version, created_at
) values (
  '66100000-0000-4000-8000-000000000010', '66100000-0000-4000-8000-000000000040',
  '66100000-0000-4000-8000-000000000050', 'enter', 1, now() - interval '1 minute'
);

select throws_ok($$
  insert into public.quest_beat_loot (beat_id, quest_id, campaign_id, kind, payload)
  values ('66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000040', '66100000-0000-4000-8000-000000000010', 'currency', '{"gp":0}')
$$, '23514', null, 'empty currency cannot become a misleading drop');

select lives_ok($$
  insert into public.quest_beat_loot (id, beat_id, quest_id, campaign_id, kind, item_id, quantity, label, payload, source_type, source_id, sort_order) values
    ('66100000-0000-4000-8000-000000000061', '66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000040', '66100000-0000-4000-8000-000000000010', 'item', '66100000-0000-4000-8000-000000000030', 2, 'Moon keys', '{}', 'quest_reward', '66100000-0000-4000-8000-000000000040', 1),
    ('66100000-0000-4000-8000-000000000062', '66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000040', '66100000-0000-4000-8000-000000000010', 'currency', null, 1, 'Vault purse', '{"gp":12,"sp":3}', 'prepared', null, 2),
    ('66100000-0000-4000-8000-000000000063', '66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000040', '66100000-0000-4000-8000-000000000010', 'loot_chest', null, 1, '', '{"loot_table_id":null,"loot_table_name":"Vault cache","chest_image_url":null,"rolled_atoms":[{"atom_id":"atom-1","type":"currency","gp":1}],"claims_total":1}', 'encounter_loot', null, 3)
$$, 'item, currency, and encounter chest placements share the beat without cloning inventory');

select is((select cardinality(reward_item_ids) from public.quests where id = '66100000-0000-4000-8000-000000000040'), 1, 'existing top-level quest rewards remain intact');

set local role authenticated;
select set_config('request.jwt.claim.sub', '66100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::integer from public.quest_beat_loot), 3, 'the DM can read prepared beat loot');
select is((select delivery_state from public.dispatch_quest_beat_loot('66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000061')), 'chat', 'one entry dispatches to chat');
select is((select type from public.campaign_messages limit 1), 'item_drop', 'item dispatch uses the existing item drop message type');
select is((select metadata->>'quest_loot_entry_id' from public.campaign_messages limit 1), '66100000-0000-4000-8000-000000000061', 'chat carries durable quest loot provenance');
select is(
  (select message_id from public.dispatch_quest_beat_loot('66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000061')),
  (select dispatch_message_id from public.quest_beat_loot where id = '66100000-0000-4000-8000-000000000061'),
  'repeated per-entry dispatch returns the original message'
);
select is((select count(*)::integer from public.campaign_messages), 1, 'idempotent dispatch creates no duplicate message');
select is((select count(*)::integer from public.dispatch_quest_beat_loot('66100000-0000-4000-8000-000000000050')), 3, 'drop-all returns every entry consistently');
select is((select count(*)::integer from public.campaign_messages), 3, 'drop-all creates only the two remaining messages');
select is((select count(*)::integer from public.get_quest_beat_loot('66100000-0000-4000-8000-000000000010') where delivery_state = 'chat'), 3, 'batched status reports all fresh messages as claimable chat');
select is((select quantity_remaining from public.get_quest_beat_loot('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000061'), 2, 'Run status reports the authoritative remaining item quantity');
select ok((select handed_out_this_session from public.get_quest_beat_loot('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000061'), 'session handout status is derived from transition and message time');
select throws_ok($$
  update public.quest_beat_loot set quantity = 99 where id = '66100000-0000-4000-8000-000000000061'
$$, '23514', null, 'dispatched payload provenance is immutable');
delete from public.quest_beat_loot where id = '66100000-0000-4000-8000-000000000061';
select is((select count(*)::integer from public.quest_beat_loot where id = '66100000-0000-4000-8000-000000000061'), 1, 'a dispatched provenance row cannot be deleted directly');

select set_config('request.jwt.claim.sub', '66100000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.quest_beat_loot), 0, 'players cannot read DM preparation rows');
select is((select count(*)::integer from public.get_quest_beat_loot('66100000-0000-4000-8000-000000000010')), 0, 'players cannot use the DM status projection');
select throws_ok($$
  select * from public.dispatch_quest_beat_loot('66100000-0000-4000-8000-000000000050')
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
select is((select delivery_state from public.get_quest_beat_loot('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000061'), 'partially_claimed', 'partial stack claims are reflected in Run status');
select is((select quantity_remaining from public.get_quest_beat_loot('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000061'), 1, 'partial claim quantity is reflected in Run status');
select is((select claimed_by_names[1] from public.get_quest_beat_loot('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000061'), 'Claiming hero', 'item claimant is reflected in Run status');
select is((select delivery_state from public.get_quest_beat_loot('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000062'), 'claimed', 'currency claim is reflected in Run status');
select is((select claimed_by_names[1] from public.get_quest_beat_loot('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000062'), 'Claiming hero', 'currency claimant is reflected in Run status');

delete from public.campaign_messages
where id = (select dispatch_message_id from public.quest_beat_loot where id = '66100000-0000-4000-8000-000000000061');
select is((select delivery_state from public.get_quest_beat_loot('66100000-0000-4000-8000-000000000010') where id = '66100000-0000-4000-8000-000000000061'), 'message_removed', 'deleted chat degrades provenance without becoming held again');
select is((select delivery_state from public.dispatch_quest_beat_loot('66100000-0000-4000-8000-000000000050', '66100000-0000-4000-8000-000000000061')), 'message_removed', 'deleted chat cannot be accidentally redispatched');

delete from public.quest_beats where id = '66100000-0000-4000-8000-000000000050';
select is((select count(*)::integer from public.campaign_messages), 2, 'deleting a beat does not delete dispatched chat or claimed inventory');
select is((select metadata->>'quest_id' from public.campaign_messages order by created_at limit 1), '66100000-0000-4000-8000-000000000040', 'orphaned chat retains degraded quest provenance');

select set_config('request.jwt.claim.sub', '66100000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.get_quest_beat_loot('66100000-0000-4000-8000-000000000010')), 0, 'outsiders receive no beat loot status');

reset role;
select ok(
  position('for update' in lower(pg_get_functiondef('public.dispatch_quest_beat_loot(uuid,uuid)'::regprocedure))) > 0,
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

select * from finish();
rollback;
