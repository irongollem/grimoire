-- #936: refusal proofs for the chat and loot definer RPCs.
--
-- Every claim RPC re-checks membership of the MESSAGE's campaign, so the
-- strongest attack is a legitimate user of a different campaign naming this
-- one's message. Each refusal has a positive control from the rightful caller
-- in the same fixture, so a refusal proves authorization and not a broken
-- fixture.
--
--   1 DM of c1   2 player in c1 (owns pm1)   3 player in c1 (owns pm2)
--   4 stranger   5 DM of c2 (a legitimate user of a campaign of their own)

begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93620000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'refusal-chat-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 5) as n;

insert into public.campaigns (id, user_id, name) values
  ('93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000001', 'Chat loot c1'),
  ('93620000-0000-4000-8000-0000000000c2', '93620000-0000-4000-8000-000000000005', 'Chat loot c2');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000001', 'dm', 'DM one'),
  ('93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000002', 'player', 'Player two'),
  ('93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000003', 'player', 'Player three'),
  ('93620000-0000-4000-8000-0000000000c2', '93620000-0000-4000-8000-000000000005', 'dm', 'DM two')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- pm1 belongs to player 2, pm2 to player 3 (with funds), both in c1.
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, gp) values
  ('93620000-0000-4000-8000-0000000000e1', '93620000-0000-4000-8000-000000000002', '93620000-0000-4000-8000-000000000002', '93620000-0000-4000-8000-0000000000c1', 'Pm one', 5),
  ('93620000-0000-4000-8000-0000000000e2', '93620000-0000-4000-8000-000000000003', '93620000-0000-4000-8000-000000000003', '93620000-0000-4000-8000-0000000000c1', 'Pm two', 5);

insert into public.party_inventory (id, campaign_id, user_id, name, quantity, carried_by) values
  ('93620000-0000-4000-8000-0000000000f1', '93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000002', 'Lantern', 1, '93620000-0000-4000-8000-0000000000e1');

-- Messages, one per RPC, all in c1.
insert into public.campaign_messages (id, campaign_id, user_id, message, type, metadata) values
  ('93620000-0000-4000-8000-0000000000a1', '93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000001', 'coins', 'currency_drop', '{"gp":3}'),
  ('93620000-0000-4000-8000-0000000000a2', '93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000001', 'item', 'item_drop', '{"item_name":"Rope","quantity":2}'),
  ('93620000-0000-4000-8000-0000000000a3', '93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000001', 'chest', 'loot_chest',
    '{"claims_total":1,"claims":[],"rolled_atoms":[{"atom_id":"atom-1"}]}'),
  ('93620000-0000-4000-8000-0000000000a4', '93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000002', 'offer', 'player_offer',
    '{"gp":1,"seller_party_member_id":"93620000-0000-4000-8000-0000000000e1","inventory_item_id":"93620000-0000-4000-8000-0000000000f1"}'),
  ('93620000-0000-4000-8000-0000000000a5', '93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000001', 'vendor', 'vendor_offer', '{}'),
  ('93620000-0000-4000-8000-0000000000a6', '93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000001', 'item', 'item_drop', '{"item_name":"Torch","quantity":3}'),
  ('93620000-0000-4000-8000-0000000000a7', '93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-000000000001', 'item', 'item_drop', '{"item_name":"Flint","quantity":1}');

insert into public.locations (id, user_id, campaign_id, name) values
  ('93620000-0000-4000-8000-0000000000b1', '93620000-0000-4000-8000-000000000001', '93620000-0000-4000-8000-0000000000c1', 'Crypt');
insert into public.loot_placements (id, campaign_id, location_id, kind, payload) values
  ('93620000-0000-4000-8000-0000000000d1', '93620000-0000-4000-8000-0000000000c1', '93620000-0000-4000-8000-0000000000b1', 'currency', '{"gp":5}');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"93620000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

set local role authenticated;

-- ── claim_currency_drop ─────────────────────────────────────────────────────
select pg_temp.as_user(4);
select throws_ok($$ select public.claim_currency_drop('93620000-0000-4000-8000-0000000000a1', 'Stranger', null) $$,
  'P0001', 'Not a campaign member', 'claim_currency_drop: a stranger cannot claim a drop');
select pg_temp.as_user(5);
select throws_ok($$ select public.claim_currency_drop('93620000-0000-4000-8000-0000000000a1', 'Other DM', null) $$,
  'P0001', 'Not a campaign member', 'claim_currency_drop: the DM of another campaign cannot claim this campaign''s drop');
select pg_temp.as_user(3);
select throws_ok($$ select public.claim_currency_drop('93620000-0000-4000-8000-0000000000a1', 'Thief', '93620000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Cannot claim currency to a member you do not control', 'claim_currency_drop: a player cannot credit another player''s character');
select pg_temp.as_user(2);
select is(public.claim_currency_drop('93620000-0000-4000-8000-0000000000a1', 'Player two', '93620000-0000-4000-8000-0000000000e1') ->> 'claimed_by_user_id',
  '93620000-0000-4000-8000-000000000002', 'claim_currency_drop: the rightful player claims to their own character');

-- ── claim_item_drop ─────────────────────────────────────────────────────────
select pg_temp.as_user(4);
select throws_ok($$ select public.claim_item_drop('93620000-0000-4000-8000-0000000000a2', 'Stranger', null, null) $$,
  'P0001', 'Not a campaign member', 'claim_item_drop: a stranger cannot claim a drop');
select pg_temp.as_user(5);
select throws_ok($$ select public.claim_item_drop('93620000-0000-4000-8000-0000000000a2', 'Other DM', null, null) $$,
  'P0001', 'Not a campaign member', 'claim_item_drop: the DM of another campaign cannot claim this campaign''s drop');
select pg_temp.as_user(3);
select throws_ok($$ select public.claim_item_drop('93620000-0000-4000-8000-0000000000a2', 'Thief', '93620000-0000-4000-8000-0000000000e1', null) $$,
  'P0001', 'Cannot claim an item to a member you do not control', 'claim_item_drop: a player cannot deliver an item to another player''s character');
select pg_temp.as_user(2);
select is(public.claim_item_drop('93620000-0000-4000-8000-0000000000a2', 'Player two', '93620000-0000-4000-8000-0000000000e1', null) ->> 'claimed_by_user_id',
  '93620000-0000-4000-8000-000000000002', 'claim_item_drop: the rightful player claims to their own character');

-- ── claim_loot_chest_atom ───────────────────────────────────────────────────
select pg_temp.as_user(4);
select throws_ok($$ select public.claim_loot_chest_atom('93620000-0000-4000-8000-0000000000a3', 'atom-1', 'Stranger') $$,
  'P0001', 'Not a campaign member', 'claim_loot_chest_atom: a stranger cannot take from a chest');
select pg_temp.as_user(5);
select throws_ok($$ select public.claim_loot_chest_atom('93620000-0000-4000-8000-0000000000a3', 'atom-1', 'Other DM') $$,
  'P0001', 'Not a campaign member', 'claim_loot_chest_atom: the DM of another campaign cannot take from this campaign''s chest');
select pg_temp.as_user(2);
select is(jsonb_array_length(public.claim_loot_chest_atom('93620000-0000-4000-8000-0000000000a3', 'atom-1', 'Player two') -> 'claims'),
  1, 'claim_loot_chest_atom: a member takes the atom (so the refusals above were about authorization)');

-- ── claim_player_offer ──────────────────────────────────────────────────────
select pg_temp.as_user(4);
select throws_ok($$ select public.claim_player_offer('93620000-0000-4000-8000-0000000000a4', 'Stranger', null) $$,
  'P0001', 'Not a campaign member', 'claim_player_offer: a stranger cannot buy');
select pg_temp.as_user(5);
select throws_ok($$ select public.claim_player_offer('93620000-0000-4000-8000-0000000000a4', 'Other DM', null) $$,
  'P0001', 'Not a campaign member', 'claim_player_offer: the DM of another campaign cannot buy in this campaign');
select pg_temp.as_user(3);
select throws_ok($$ select public.claim_player_offer('93620000-0000-4000-8000-0000000000a4', 'Thief', null) $$,
  'P0001', 'Only the DM can buy without a character', 'claim_player_offer: a player cannot buy for free by passing no character');
select throws_ok($$ select public.claim_player_offer('93620000-0000-4000-8000-0000000000a4', 'Thief', '93620000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Cannot spend from a character you do not own', 'claim_player_offer: a player cannot spend another player''s money');
select is(public.claim_player_offer('93620000-0000-4000-8000-0000000000a4', 'Player three', '93620000-0000-4000-8000-0000000000e2') ->> 'sold_to_user_id',
  '93620000-0000-4000-8000-000000000003', 'claim_player_offer: the rightful buyer pays from their own character');

-- ── claim_vendor_offer ──────────────────────────────────────────────────────
-- The RPC stamps who paid; the purse debit happens in the client, through RLS.
-- Membership, and the payer being the caller's own character, are its checks.
select pg_temp.as_user(4);
select throws_ok($$ select public.claim_vendor_offer('93620000-0000-4000-8000-0000000000a5', 'Stranger', null) $$,
  'P0001', 'Not a campaign member', 'claim_vendor_offer: a stranger cannot pay a vendor offer');
select pg_temp.as_user(5);
select throws_ok($$ select public.claim_vendor_offer('93620000-0000-4000-8000-0000000000a5', 'Other DM', null) $$,
  'P0001', 'Not a campaign member', 'claim_vendor_offer: the DM of another campaign cannot pay this campaign''s vendor offer');
select pg_temp.as_user(3);
select throws_ok($$ select public.claim_vendor_offer('93620000-0000-4000-8000-0000000000a5', 'Player three', '93620000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Cannot spend from a character you do not own', 'claim_vendor_offer: a player cannot name another player''s character as the payer');
select pg_temp.as_user(2);
select is(public.claim_vendor_offer('93620000-0000-4000-8000-0000000000a5', 'Player two', '93620000-0000-4000-8000-0000000000e1') ->> 'paid_by_user_id',
  '93620000-0000-4000-8000-000000000002', 'claim_vendor_offer: a member pays');

-- ── grab_item_drop ──────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$ select public.grab_item_drop('93620000-0000-4000-8000-0000000000a6', 1, null, 'Nobody', null) $$,
  'P0001', 'Authentication required', 'grab_item_drop: a caller with no identity is refused');
select pg_temp.as_user(4);
select throws_ok($$ select public.grab_item_drop('93620000-0000-4000-8000-0000000000a6', 1, '93620000-0000-4000-8000-000000000004', 'Stranger', null) $$,
  'P0001', 'Not a campaign member', 'grab_item_drop: a stranger cannot grab');
select pg_temp.as_user(5);
select throws_ok($$ select public.grab_item_drop('93620000-0000-4000-8000-0000000000a6', 1, '93620000-0000-4000-8000-000000000005', 'Other DM', null) $$,
  'P0001', 'Not a campaign member', 'grab_item_drop: the DM of another campaign cannot grab from this campaign''s stack');
select pg_temp.as_user(3);
select throws_ok($$ select public.grab_item_drop('93620000-0000-4000-8000-0000000000a6', 1, '93620000-0000-4000-8000-000000000003', 'Thief', '93620000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Cannot grab an item to a member you do not control', 'grab_item_drop: a player cannot grab into another player''s character');
select pg_temp.as_user(2);
select is(public.grab_item_drop('93620000-0000-4000-8000-0000000000a6', 1, '93620000-0000-4000-8000-000000000003', 'Player two', '93620000-0000-4000-8000-0000000000e1') ->> 'qty_grabbed',
  '1', 'grab_item_drop: the rightful player grabs into their own character');
select is((select (claim ->> 'user_id') from public.campaign_messages m, jsonb_array_elements(m.metadata -> 'claims') claim
            where m.id = '93620000-0000-4000-8000-0000000000a6'),
  '93620000-0000-4000-8000-000000000002', 'grab_item_drop: the claim carries the JWT identity, not the caller-supplied p_claimer_user_id');

-- ── get_loot_placements ─────────────────────────────────────────────────────
select pg_temp.as_user(4);
select is_empty($$ select * from public.get_loot_placements('93620000-0000-4000-8000-0000000000c1') $$,
  'get_loot_placements: a stranger sees nothing');
select pg_temp.as_user(5);
select is_empty($$ select * from public.get_loot_placements('93620000-0000-4000-8000-0000000000c1') $$,
  'get_loot_placements: the DM of another campaign sees nothing of this campaign''s loot');
select pg_temp.as_user(2);
select is_empty($$ select * from public.get_loot_placements('93620000-0000-4000-8000-0000000000c1') $$,
  'get_loot_placements: a player in the campaign sees nothing (the loot ledger is DM-only)');
select pg_temp.as_user(1);
select isnt_empty($$ select * from public.get_loot_placements('93620000-0000-4000-8000-0000000000c1') $$,
  'get_loot_placements: the campaign''s DM sees the placement');

select * from finish();
rollback;
