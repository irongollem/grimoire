begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

-- Need or Greed (20261030230842): a DM's chat drop opens a roll when the rule is on;
-- seated characters choose once; the server rolls, resolves and delivers.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('a7700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nog-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('a7700000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nog-p1@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('a7700000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nog-p2@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('a7700000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nog-out@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000001', 'Need or greed');
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('a7700000-0000-4000-8000-000000000021', 'a7700000-0000-4000-8000-000000000001', 'a7700000-0000-4000-8000-000000000002', 'a7700000-0000-4000-8000-000000000010', 'Mira', '2014'),
  ('a7700000-0000-4000-8000-000000000022', 'a7700000-0000-4000-8000-000000000001', 'a7700000-0000-4000-8000-000000000003', 'a7700000-0000-4000-8000-000000000010', 'Bram', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000002', 'player', 'P1', 'a7700000-0000-4000-8000-000000000021'),
  ('a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000003', 'player', 'P2', 'a7700000-0000-4000-8000-000000000022')
on conflict (campaign_id, user_id) do update
set role = excluded.role, display_name = excluded.display_name, party_member_id = excluded.party_member_id;

create temporary table drop_meta (meta jsonb) on commit drop;
insert into drop_meta values ('{"item_id":null,"item_name":"Ruby","item_rarity":"rare","quantity":1,"quantity_remaining":1,"claims":[],"claimed_by_user_id":null,"claimed_by_name":null,"claimed_party_member_id":null}');
grant select on drop_meta to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── Which drops roll ─────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000001', true);
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7700000-0000-4000-8000-000000000100', 'a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000001', 'DM', 'dropped Ruby', 'item_drop', meta from drop_meta;
select ok(not (select metadata ? 'roll' from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000100'),
  'with the rule off, a DM drop is first-come');

reset role;
insert into public.campaign_rules (campaign_id, rule_key, enabled, config)
values ('a7700000-0000-4000-8000-000000000010', 'need_or_greed', true, '{"seconds": 45}');
set local role authenticated;

insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7700000-0000-4000-8000-000000000101', 'a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000001', 'DM', 'dropped Ruby', 'item_drop',
  meta || '{"roll":{"seconds":1,"closes_at":"2000-01-01T00:00:00Z","entries":[{"party_member_id":"a7700000-0000-4000-8000-000000000021","user_id":"a7700000-0000-4000-8000-000000000002","name":"Mira","choice":"need","roll":100,"at":"2000-01-01T00:00:00Z"}],"resolved_at":null,"outcome":null}}'
from drop_meta;
select is((select (metadata->'roll'->>'seconds')::int from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000101'),
  45, 'with the rule on, a DM drop opens a roll for the configured window');
select is((select (metadata->'roll'->>'closes_at')::timestamptz from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000101'),
  date_trunc('milliseconds', now() + interval '45 seconds'), 'the deadline comes from the server clock');
select is((select jsonb_array_length(metadata->'roll'->'entries') from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000101'),
  0, 'a roll the client wrote, with a forged winning entry, is replaced by an empty one');

-- Bug: the window was cast to integer before it was clamped, so a huge stored
-- number raised "integer out of range" and failed every drop the DM posted.
reset role;
update public.campaign_rules set config = '{"seconds": 1e12}'
where campaign_id = 'a7700000-0000-4000-8000-000000000010' and rule_key = 'need_or_greed';
set local role authenticated;
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7700000-0000-4000-8000-000000000190', 'a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000001', 'DM', 'dropped Ruby', 'item_drop', meta from drop_meta;
select is((select (metadata->'roll'->>'seconds')::int from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000190'),
  300, 'an oversized window is clamped to five minutes, not an error');
reset role;
update public.campaign_rules set config = '{"seconds": 45}'
where campaign_id = 'a7700000-0000-4000-8000-000000000010' and rule_key = 'need_or_greed';
set local role authenticated;

insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7700000-0000-4000-8000-000000000102', 'a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000001', 'DM', 'dropped Javelin', 'item_drop', meta || '{"thrown":true}' from drop_meta;
select ok(not (select metadata ? 'roll' from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000102'),
  'a thrown weapon never rolls');

select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000002', true);
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7700000-0000-4000-8000-000000000103', 'a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000002', 'Mira', 'dropped Ruby', 'item_drop',
  meta || '{"roll":{"seconds":30,"closes_at":"2999-01-01T00:00:00Z","entries":[],"resolved_at":null,"outcome":null}}' from drop_meta;
select ok(not (select metadata ? 'roll' from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000103'),
  'a player''s drop never rolls, even one that asks to');

-- ── Nothing jumps the roll ───────────────────────────────────────────────────
select throws_ok($$ select public.grab_item_drop('a7700000-0000-4000-8000-000000000101', -1, null, 'Mira', 'a7700000-0000-4000-8000-000000000021') $$,
  'P0001', 'This drop is being rolled for', 'an open roll cannot be grabbed');
select throws_ok($$ select public.claim_item_drop('a7700000-0000-4000-8000-000000000101', 'Mira', 'a7700000-0000-4000-8000-000000000021', null) $$,
  'P0001', 'This drop is being rolled for', 'nor claimed');
select lives_ok($$ select public.grab_item_drop('a7700000-0000-4000-8000-000000000103', -1, null, 'Mira', 'a7700000-0000-4000-8000-000000000021') $$,
  'positive control: a drop with no roll grabs as before');
select is((select sum(quantity)::int from public.party_inventory where campaign_id = 'a7700000-0000-4000-8000-000000000010' and name = 'Ruby' and carried_by = 'a7700000-0000-4000-8000-000000000021'),
  1, 'the grab still delivers through the shared delivery');

-- ── Who may choose ───────────────────────────────────────────────────────────
select throws_ok($$ select public.choose_loot_roll('a7700000-0000-4000-8000-000000000101', 'a7700000-0000-4000-8000-000000000022', 'need') $$,
  'P0001', 'Cannot roll for a character you do not control', 'a player cannot roll for someone else''s character');
select throws_ok($$ select public.choose_loot_roll('a7700000-0000-4000-8000-000000000101', 'a7700000-0000-4000-8000-000000000021', 'mine') $$,
  'P0001', 'Choose need, greed or pass', 'only need, greed or pass');
select throws_ok($$ select public.choose_loot_roll('a7700000-0000-4000-8000-000000000102', 'a7700000-0000-4000-8000-000000000021', 'need') $$,
  'P0001', 'This drop has no open roll', 'a drop without a roll cannot be rolled for');

select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000004', true);
select throws_ok($$ select public.choose_loot_roll('a7700000-0000-4000-8000-000000000101', 'a7700000-0000-4000-8000-000000000021', 'need') $$,
  'P0001', 'Not a campaign member', 'an outsider cannot roll on the drop');
select throws_ok($$ select public.resolve_loot_roll('a7700000-0000-4000-8000-000000000101') $$,
  'P0001', 'Not a campaign member', 'nor close it');

select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.choose_loot_roll('a7700000-0000-4000-8000-000000000101', 'a7700000-0000-4000-8000-000000000021', 'need') $$,
  'P0001', 'Cannot roll for a character you do not control', 'the DM holds no seat, so cannot roll');

-- ── Choosing and resolving ───────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000002', true);
select lives_ok($$ select public.choose_loot_roll('a7700000-0000-4000-8000-000000000101', 'a7700000-0000-4000-8000-000000000021', 'greed') $$,
  'a seated player chooses for their own character');
select ok((select (metadata->'roll'->'entries'->0->>'roll')::int between 1 and 100 from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000101'),
  'greed rolls a d100 on the server');
select throws_ok($$ select public.choose_loot_roll('a7700000-0000-4000-8000-000000000101', 'a7700000-0000-4000-8000-000000000021', 'need') $$,
  'P0001', 'This character has already chosen', 'a character chooses once');
select ok((select public.resolve_loot_roll('a7700000-0000-4000-8000-000000000101')->'roll'->>'resolved_at' is null),
  'a player closing it before the deadline changes nothing');

select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000003', true);
select lives_ok($$ select public.choose_loot_roll('a7700000-0000-4000-8000-000000000101', 'a7700000-0000-4000-8000-000000000022', 'need') $$,
  'the last seated character chooses');
select is((select metadata->'roll'->>'outcome' from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000101'),
  'won', 'once everyone seated has chosen, the roll resolves without waiting');
select is((select metadata->'claims'->0->>'party_member_id' from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000101'),
  'a7700000-0000-4000-8000-000000000022', 'need beats greed, whatever the dice');

select is((select metadata->'roll'->'entries'->0->>'name' from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000101'),
  'Mira', 'an entry carries the character''s own name');

reset role;
select is((select user_id from public.party_inventory where campaign_id = 'a7700000-0000-4000-8000-000000000010' and carried_by = 'a7700000-0000-4000-8000-000000000022'),
  'a7700000-0000-4000-8000-000000000003'::uuid, 'the item lands in the winner''s pack, owned by the winner');
set local role authenticated;

-- The loser cannot take a copy through the single-claim path.
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000002', true);
select throws_ok($$ select public.claim_item_drop('a7700000-0000-4000-8000-000000000101', 'Mira', 'a7700000-0000-4000-8000-000000000021', null) $$,
  'P0001', 'Already claimed', 'a won drop cannot be claimed again by the loser');
reset role;
select is((select count(*)::int from public.party_inventory where campaign_id = 'a7700000-0000-4000-8000-000000000010' and name = 'Ruby' and carried_by = 'a7700000-0000-4000-8000-000000000021'),
  1, 'the loser still holds only the ruby she grabbed earlier');
set local role authenticated;

-- A stack is dealt among the winning tier: 3 rubies, two Needs.
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000001', true);
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7700000-0000-4000-8000-000000000104', 'a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000001', 'DM', 'dropped 3x Opal', 'item_drop',
  meta || '{"item_name":"Opal","quantity":3,"quantity_remaining":3}' from drop_meta;
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000002', true);
select public.choose_loot_roll('a7700000-0000-4000-8000-000000000104', 'a7700000-0000-4000-8000-000000000021', 'need');
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000003', true);
select public.choose_loot_roll('a7700000-0000-4000-8000-000000000104', 'a7700000-0000-4000-8000-000000000022', 'need');
select is((select array_agg((c->>'qty')::int order by (c->>'qty')::int desc) from public.campaign_messages m, jsonb_array_elements(m.metadata->'claims') c where m.id = 'a7700000-0000-4000-8000-000000000104'),
  array[2, 1], 'two Needs on three: the higher roll takes two, the other one');
select is((select metadata->'claims'->0->>'party_member_id' from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000104'),
  (select e->>'party_member_id' from public.campaign_messages m, jsonb_array_elements(m.metadata->'roll'->'entries') e
    where m.id = 'a7700000-0000-4000-8000-000000000104' order by (e->>'roll')::int desc limit 1),
  'the bigger share goes to the higher roll');
select is((select metadata->>'quantity_remaining' from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000104'),
  '0', 'nothing is left on the floor');

-- Everyone passes: the drop is anyone's.
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000001', true);
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7700000-0000-4000-8000-000000000105', 'a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000001', 'DM', 'dropped Rope', 'item_drop',
  meta || '{"item_name":"Rope"}' from drop_meta;
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000002', true);
select public.choose_loot_roll('a7700000-0000-4000-8000-000000000105', 'a7700000-0000-4000-8000-000000000021', 'pass');
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000003', true);
select public.choose_loot_roll('a7700000-0000-4000-8000-000000000105', 'a7700000-0000-4000-8000-000000000022', 'pass');
select is((select metadata->'roll'->>'outcome' from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000105'),
  'unclaimed', 'everyone passing leaves it unclaimed');
select lives_ok($$ select public.grab_item_drop('a7700000-0000-4000-8000-000000000105', -1, null, 'Bram', 'a7700000-0000-4000-8000-000000000022') $$,
  'and then it grabs like any drop');

-- The DM ends a roll early; a player closes one after its deadline.
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000001', true);
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7700000-0000-4000-8000-000000000106', 'a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000001', 'DM', 'dropped Lamp', 'item_drop',
  meta || '{"item_name":"Lamp"}' from drop_meta;
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7700000-0000-4000-8000-000000000107', 'a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000001', 'DM', 'dropped Map', 'item_drop',
  meta || '{"item_name":"Map"}' from drop_meta;
select is((select public.resolve_loot_roll('a7700000-0000-4000-8000-000000000106')->'roll'->>'outcome'),
  'unclaimed', 'the DM can end a roll before its deadline');

reset role;
update public.campaign_messages
set metadata = jsonb_set(metadata, '{roll,closes_at}', to_jsonb(to_char((now() - interval '1 second') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
where id = 'a7700000-0000-4000-8000-000000000107';
set local role authenticated;

select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000002', true);
select throws_ok($$ select public.choose_loot_roll('a7700000-0000-4000-8000-000000000107', 'a7700000-0000-4000-8000-000000000021', 'need') $$,
  'P0001', 'The roll has closed', 'nobody chooses after the deadline');
select is((select public.resolve_loot_roll('a7700000-0000-4000-8000-000000000107')->'roll'->>'outcome'),
  'unclaimed', 'any member closes a roll whose deadline has passed');

-- A roll without a deadline is not open: nothing could ever close it.
reset role;
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7700000-0000-4000-8000-000000000108', 'a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000001', 'DM', 'dropped Bell', 'item_drop',
  meta || '{"item_name":"Bell","roll":{"seconds":30,"entries":[],"resolved_at":null,"outcome":null}}' from drop_meta;
set local role authenticated;
select throws_ok($$ select public.choose_loot_roll('a7700000-0000-4000-8000-000000000108', 'a7700000-0000-4000-8000-000000000021', 'need') $$,
  'P0001', 'This drop has no open roll', 'a roll with no deadline takes no choices');
select lives_ok($$ select public.grab_item_drop('a7700000-0000-4000-8000-000000000108', -1, null, 'Mira', 'a7700000-0000-4000-8000-000000000021') $$,
  'and does not hold the drop hostage');

-- A winner who left before the roll closed does not jam it: the next in line wins.
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000001', true);
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7700000-0000-4000-8000-000000000109', 'a7700000-0000-4000-8000-000000000010', 'a7700000-0000-4000-8000-000000000001', 'DM', 'dropped Crown', 'item_drop',
  meta || '{"item_name":"Crown"}' from drop_meta;
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000003', true);
select public.choose_loot_roll('a7700000-0000-4000-8000-000000000109', 'a7700000-0000-4000-8000-000000000022', 'need');
reset role;
delete from public.party_members where id = 'a7700000-0000-4000-8000-000000000022';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7700000-0000-4000-8000-000000000002', true);
select lives_ok($$ select public.choose_loot_roll('a7700000-0000-4000-8000-000000000109', 'a7700000-0000-4000-8000-000000000021', 'greed') $$,
  'the last seated character chooses after the Need roller''s character is gone');
select is((select metadata->'claims'->0->>'party_member_id' from public.campaign_messages where id = 'a7700000-0000-4000-8000-000000000109'),
  'a7700000-0000-4000-8000-000000000021', 'the departed character is passed over and Greed wins');

select * from finish();
rollback;
