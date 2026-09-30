-- #936: claim_player_offer must not trust the ids inside an offer message.
--
-- Any campaign member can insert a player_offer message with arbitrary
-- metadata, so the claim has to re-derive who sells what. Every forged offer
-- below is posted by a real member through the normal INSERT policy, claimed
-- by a real buyer, refused with the rule's own message, and followed by a
-- check that no coin and no item moved. One legitimate sale is the positive
-- control.
--
--   1 DM of c1   2 seller (owns pm1)   3 buyer (owns pm2, 50 gp)
--   4 DM of c2 (owns pmc2, which carries an item in c2)
--   pmx3: owned by user 3 but in c2 (a buyer from another campaign)

begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93680000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'refusal-offer-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name) values
  ('93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000001', 'Offer c1'),
  ('93680000-0000-4000-8000-0000000000c2', '93680000-0000-4000-8000-000000000004', 'Offer c2');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000001', 'dm', 'DM one'),
  ('93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000002', 'player', 'Seller'),
  ('93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000003', 'player', 'Buyer'),
  ('93680000-0000-4000-8000-0000000000c2', '93680000-0000-4000-8000-000000000004', 'dm', 'DM two')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, gp) values
  ('93680000-0000-4000-8000-0000000000e1', '93680000-0000-4000-8000-000000000002', '93680000-0000-4000-8000-000000000002', '93680000-0000-4000-8000-0000000000c1', 'Pm one', 0),
  ('93680000-0000-4000-8000-0000000000e2', '93680000-0000-4000-8000-000000000003', '93680000-0000-4000-8000-000000000003', '93680000-0000-4000-8000-0000000000c1', 'Pm two', 50),
  ('93680000-0000-4000-8000-0000000000e3', '93680000-0000-4000-8000-000000000004', '93680000-0000-4000-8000-000000000004', '93680000-0000-4000-8000-0000000000c2', 'Pm c2', 0),
  ('93680000-0000-4000-8000-0000000000e4', '93680000-0000-4000-8000-000000000003', '93680000-0000-4000-8000-000000000003', '93680000-0000-4000-8000-0000000000c2', 'Pm x3', 50);
-- e5 is DM-managed and unclaimed: owner_user_id is NULL, the case that would
-- make an uncoalesced "owner = author or ..." guard NULL and let it through.
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, gp, is_dm_managed) values
  ('93680000-0000-4000-8000-0000000000e5', '93680000-0000-4000-8000-000000000001', null, '93680000-0000-4000-8000-0000000000c1', 'Pm unowned', 0, true);

-- f1 sold by pm1; f2 is pm2's own item; f3 lives in c2, carried by pmc2.
insert into public.party_inventory (id, campaign_id, user_id, name, quantity, carried_by) values
  ('93680000-0000-4000-8000-0000000000f1', '93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000002', 'Lantern', 1, '93680000-0000-4000-8000-0000000000e1'),
  ('93680000-0000-4000-8000-0000000000f2', '93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000003', 'Rope', 1, '93680000-0000-4000-8000-0000000000e2'),
  ('93680000-0000-4000-8000-0000000000f3', '93680000-0000-4000-8000-0000000000c2', '93680000-0000-4000-8000-000000000004', 'Relic', 1, '93680000-0000-4000-8000-0000000000e3'),
  ('93680000-0000-4000-8000-0000000000f5', '93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000001', 'Idol', 1, '93680000-0000-4000-8000-0000000000e5');

-- Every wallet and item owner involved, read past RLS so a failed claim can
-- be shown to have changed nothing.
create function pg_temp.state() returns text language sql security definer as $$
  select (select string_agg(id::text || ':' || pp || '/' || gp || '/' || ep || '/' || sp || '/' || cp, ',' order by id)
            from public.party_members where id::text like '93680000-%')
      || '|' ||
         (select string_agg(id::text || ':' || coalesce(carried_by::text, '-') || '/' || user_id, ',' order by id)
            from public.party_inventory where id::text like '93680000-%');
$$;

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"93680000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

create temp table before_state (s text);
grant all on before_state to authenticated;
grant execute on function pg_temp.state() to authenticated;

set local role authenticated;

-- The seller (user 2) posts every offer through the normal INSERT policy.
select pg_temp.as_user(2);
insert into public.campaign_messages (id, campaign_id, user_id, message, type, metadata) values
  -- a1 legitimate: pm1 sells its own Lantern for 10 gp
  ('93680000-0000-4000-8000-0000000000a1', '93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000002', 'offer', 'player_offer',
    '{"gp":10,"seller_party_member_id":"93680000-0000-4000-8000-0000000000e1","inventory_item_id":"93680000-0000-4000-8000-0000000000f1"}'),
  -- a2 forged: a seller from another campaign
  ('93680000-0000-4000-8000-0000000000a2', '93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000002', 'offer', 'player_offer',
    '{"gp":10,"seller_party_member_id":"93680000-0000-4000-8000-0000000000e3","inventory_item_id":"93680000-0000-4000-8000-0000000000f3"}'),
  -- a3 forged: a seller in this campaign that the author does not control
  ('93680000-0000-4000-8000-0000000000a3', '93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000002', 'offer', 'player_offer',
    '{"gp":10,"seller_party_member_id":"93680000-0000-4000-8000-0000000000e2","inventory_item_id":"93680000-0000-4000-8000-0000000000f2"}'),
  -- a4 forged: an inventory row from another campaign
  ('93680000-0000-4000-8000-0000000000a4', '93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000002', 'offer', 'player_offer',
    '{"gp":10,"seller_party_member_id":"93680000-0000-4000-8000-0000000000e1","inventory_item_id":"93680000-0000-4000-8000-0000000000f3"}'),
  -- a5 forged: an inventory row in this campaign that the seller does not carry
  ('93680000-0000-4000-8000-0000000000a5', '93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000002', 'offer', 'player_offer',
    '{"gp":10,"seller_party_member_id":"93680000-0000-4000-8000-0000000000e1","inventory_item_id":"93680000-0000-4000-8000-0000000000f2"}'),
  -- a6 forged: a negative price
  ('93680000-0000-4000-8000-0000000000a6', '93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000002', 'offer', 'player_offer',
    '{"gp":-5,"seller_party_member_id":"93680000-0000-4000-8000-0000000000e1","inventory_item_id":"93680000-0000-4000-8000-0000000000f1"}'),
  -- a7 forged: a fractional price
  ('93680000-0000-4000-8000-0000000000a7', '93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000002', 'offer', 'player_offer',
    '{"gp":1.5,"seller_party_member_id":"93680000-0000-4000-8000-0000000000e1","inventory_item_id":"93680000-0000-4000-8000-0000000000f1"}'),
  -- a9 forged: the item of a DM-managed character nobody owns
  ('93680000-0000-4000-8000-0000000000a9', '93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000002', 'offer', 'player_offer',
    '{"gp":0,"seller_party_member_id":"93680000-0000-4000-8000-0000000000e5","inventory_item_id":"93680000-0000-4000-8000-0000000000f5"}');

-- ── Forged offers, each claimed by the real buyer (user 3, pm2) ────────────
select pg_temp.as_user(3);
insert into before_state select pg_temp.state();

select throws_ok($$ select public.claim_player_offer('93680000-0000-4000-8000-0000000000a2', 'Buyer', '93680000-0000-4000-8000-0000000000e2') $$,
  'P0001', 'Seller is not in this campaign', 'a seller from another campaign cannot be credited');
select throws_ok($$ select public.claim_player_offer('93680000-0000-4000-8000-0000000000a3', 'Buyer', '93680000-0000-4000-8000-0000000000e2') $$,
  'P0001', 'Seller is not controlled by the offer author', 'a seller the offer author does not control cannot be credited');
select throws_ok($$ select public.claim_player_offer('93680000-0000-4000-8000-0000000000a9', 'Buyer', '93680000-0000-4000-8000-0000000000e2') $$,
  'P0001', 'Seller is not controlled by the offer author', 'an unowned DM-managed character cannot be sold by a player');
select throws_ok($$ select public.claim_player_offer('93680000-0000-4000-8000-0000000000a4', 'Buyer', '93680000-0000-4000-8000-0000000000e2') $$,
  'P0001', 'Item is not carried by the seller', 'an inventory row from another campaign cannot be taken');
select throws_ok($$ select public.claim_player_offer('93680000-0000-4000-8000-0000000000a5', 'Buyer', '93680000-0000-4000-8000-0000000000e2') $$,
  'P0001', 'Item is not carried by the seller', 'an inventory row the seller does not carry cannot be taken');
select throws_ok($$ select public.claim_player_offer('93680000-0000-4000-8000-0000000000a6', 'Buyer', '93680000-0000-4000-8000-0000000000e2') $$,
  'P0001', 'Invalid offer price', 'a negative price is refused');
select throws_ok($$ select public.claim_player_offer('93680000-0000-4000-8000-0000000000a7', 'Buyer', '93680000-0000-4000-8000-0000000000e2') $$,
  'P0001', 'Invalid offer price', 'a fractional price is refused');
select throws_ok($$ select public.claim_player_offer('93680000-0000-4000-8000-0000000000a1', 'Buyer', '93680000-0000-4000-8000-0000000000e4') $$,
  'P0001', 'Buyer is not in this campaign', 'a buyer character from another campaign is refused');
select pg_temp.as_user(2);
select throws_ok($$ select public.claim_player_offer('93680000-0000-4000-8000-0000000000a1', 'Seller', '93680000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Cannot buy from yourself', 'the seller character cannot buy its own offer');

select pg_temp.as_user(3);
select is(pg_temp.state(), (select s from before_state), 'no coin and no item moved during any refused claim');

-- ── Positive control: the legitimate sale ───────────────────────────────────
select is(public.claim_player_offer('93680000-0000-4000-8000-0000000000a1', 'Buyer', '93680000-0000-4000-8000-0000000000e2') ->> 'sold_to_user_id',
  '93680000-0000-4000-8000-000000000003', 'the legitimate sale succeeds for the rightful buyer');
select is((select pp * 10 + gp from public.party_members where id = '93680000-0000-4000-8000-0000000000e2'), 40,
  'the buyer was debited 10 gp');
select pg_temp.as_user(2);
select is((select pp * 10 + gp from public.party_members where id = '93680000-0000-4000-8000-0000000000e1'), 10,
  'the seller was credited 10 gp');
select is((select carried_by from public.party_inventory where id = '93680000-0000-4000-8000-0000000000f1'),
  '93680000-0000-4000-8000-0000000000e2'::uuid, 'the item moved to the buyer');
select is((select user_id from public.party_inventory where id = '93680000-0000-4000-8000-0000000000f1'),
  '93680000-0000-4000-8000-000000000003'::uuid, 'the item is now owned by the buyer');

-- The DM may still buy without a character: money appears, item leaves play.
reset role;
insert into public.campaign_messages (id, campaign_id, user_id, message, type, metadata) values
  ('93680000-0000-4000-8000-0000000000a8', '93680000-0000-4000-8000-0000000000c1', '93680000-0000-4000-8000-000000000003', 'offer', 'player_offer',
    '{"gp":2,"seller_party_member_id":"93680000-0000-4000-8000-0000000000e2","inventory_item_id":"93680000-0000-4000-8000-0000000000f2"}');
set local role authenticated;
select pg_temp.as_user(1);
select is(public.claim_player_offer('93680000-0000-4000-8000-0000000000a8', 'DM', null) ->> 'sold_to_user_id',
  '93680000-0000-4000-8000-000000000001', 'the DM can still buy a legitimate offer without a character');
select ok(not exists (select 1 from public.party_inventory where id = '93680000-0000-4000-8000-0000000000f2'),
  'the DM purchase removed the item from play');
select is((select pp * 10 + gp from public.party_members where id = '93680000-0000-4000-8000-0000000000e2'), 42,
  'the DM purchase credited the seller');

select * from finish();
rollback;
