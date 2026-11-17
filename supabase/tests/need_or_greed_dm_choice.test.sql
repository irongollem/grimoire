begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

-- Need or Greed asks the DM at every drop (20261117234419): roll, free to grab, or
-- give to one character. These hold the server to the three answers, and hold the
-- new DM-may-give paths to the DM alone.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('a7710000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nogc-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('a7710000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nogc-p1@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('a7710000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nogc-p2@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000001', 'Choosing table', 'dnd5e-2014'),
  ('a7710000-0000-4000-8000-000000000011', 'a7710000-0000-4000-8000-000000000003', 'Another table', 'dnd5e-2014');
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('a7710000-0000-4000-8000-000000000021', 'a7710000-0000-4000-8000-000000000001', 'a7710000-0000-4000-8000-000000000002', 'a7710000-0000-4000-8000-000000000010', 'Mira', '2014'),
  ('a7710000-0000-4000-8000-000000000022', 'a7710000-0000-4000-8000-000000000001', 'a7710000-0000-4000-8000-000000000003', 'a7710000-0000-4000-8000-000000000010', 'Bram', '2014'),
  ('a7710000-0000-4000-8000-000000000029', 'a7710000-0000-4000-8000-000000000003', 'a7710000-0000-4000-8000-000000000003', 'a7710000-0000-4000-8000-000000000011', 'Stranger', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000002', 'player', 'P1', 'a7710000-0000-4000-8000-000000000021'),
  ('a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000003', 'player', 'P2', 'a7710000-0000-4000-8000-000000000022')
on conflict (campaign_id, user_id) do update
set role = excluded.role, display_name = excluded.display_name, party_member_id = excluded.party_member_id;
insert into public.campaign_rules (campaign_id, rule_key, enabled, config)
values ('a7710000-0000-4000-8000-000000000010', 'need_or_greed', true, '{"seconds": 30}');

create temporary table drop_meta (meta jsonb) on commit drop;
insert into drop_meta values ('{"item_id":null,"item_name":"Ruby","item_rarity":"rare","quantity":1,"quantity_remaining":1,"claims":[],"claimed_by_user_id":null,"claimed_by_name":null,"claimed_party_member_id":null}');
grant select on drop_meta to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a7710000-0000-4000-8000-000000000001', true);

-- ── Which drops roll ─────────────────────────────────────────────────────────
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7710000-0000-4000-8000-000000000100', 'a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000001', 'DM', 'dropped Ruby', 'item_drop', meta || '{"roll_mode":"free"}' from drop_meta;
select ok(not (select metadata ? 'roll' from public.campaign_messages where id = 'a7710000-0000-4000-8000-000000000100'),
  'a drop the DM set free to grab does not roll, with the rule on');
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7710000-0000-4000-8000-000000000101', 'a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000001', 'DM', 'dropped Ruby', 'item_drop', meta || '{"roll_mode":"roll"}' from drop_meta;
select ok((select metadata ? 'roll' from public.campaign_messages where id = 'a7710000-0000-4000-8000-000000000101'),
  'a drop the DM chose to roll does roll');

-- ── The DM may claim a drop for any character ─────────────────────────────────
select lives_ok($$ select public.claim_item_drop('a7710000-0000-4000-8000-000000000100', 'Bram', 'a7710000-0000-4000-8000-000000000022', null) $$,
  'the DM claims a free drop for a character who is not theirs');
select is((select metadata->'claims'->0->>'name' from public.campaign_messages where id = 'a7710000-0000-4000-8000-000000000100'),
  'Bram', 'a claim on a stacked drop names who got it, as a grab does');

-- A player still claims only for their own character.
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata)
select 'a7710000-0000-4000-8000-000000000102', 'a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000001', 'DM', 'dropped Ruby', 'item_drop', meta || '{"roll_mode":"free"}' from drop_meta;
select set_config('request.jwt.claim.sub', 'a7710000-0000-4000-8000-000000000002', true);
select throws_ok($$ select public.claim_item_drop('a7710000-0000-4000-8000-000000000102', 'Bram', 'a7710000-0000-4000-8000-000000000022', null) $$,
  'P0001', 'Cannot claim an item to a member you do not control', 'a player cannot claim a drop into another player''s pack');

-- ── give_item_drop ───────────────────────────────────────────────────────────
select throws_ok($$ select public.give_item_drop('a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000021', 'P1', 'dropped Ruby', (select meta from drop_meta)) $$,
  '42501', 'Only the DM can give a drop', 'a player cannot give a drop, even to their own character');

select set_config('request.jwt.claim.sub', 'a7710000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.give_item_drop('a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000029', 'DM', 'dropped Ruby', (select meta from drop_meta)) $$,
  '22023', 'That character is not in this campaign', 'the DM cannot give into a character at another table');
select throws_ok($$ select public.give_item_drop('a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000021', 'DM', 'dropped Ruby', (select meta || '{"quantity":0}' from drop_meta)) $$,
  '22023', 'Give at least one', 'a give of nothing is refused');

create temporary table given (id uuid) on commit drop;
grant insert, select on given to authenticated;
insert into given select (public.give_item_drop('a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000021', 'DM', 'dropped Ruby',
  (select meta || '{"roll":{"seconds":1,"closes_at":"2000-01-01T00:00:00Z","entries":[],"resolved_at":null,"outcome":null}}' from drop_meta))).id;
select ok(not (select metadata ? 'roll' from public.campaign_messages where id = (select id from given)),
  'a given drop never rolls, even when the client sent a roll');
select is((select metadata->>'claimed_party_member_id' from public.campaign_messages where id = (select id from given)),
  'a7710000-0000-4000-8000-000000000021', 'a given drop is claimed for the character in the same call');
select is((select metadata->>'quantity_remaining' from public.campaign_messages where id = (select id from given)),
  '0', 'nothing is left of a given drop for anyone else to grab');
reset role;
select is((select count(*)::int from public.party_inventory
           where carried_by = 'a7710000-0000-4000-8000-000000000021' and name = 'Ruby'),
  1, 'the given item is in the character''s pack');

select * from finish();
rollback;
