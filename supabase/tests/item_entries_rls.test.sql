begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

-- Fixtures: one DM owning two campaigns and two items (one writable document,
-- one locked), two players in campaign 1, Alice also in campaign 2 (for the
-- cross-campaign retarget case), and one outsider.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('77700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'entries-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('77700000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'entries-alice@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('77700000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'entries-bob@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('77700000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'entries-carol@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values
  ('77700000-0000-4000-8000-000000000010', '77700000-0000-4000-8000-000000000001', 'Ledger campaign'),
  ('77700000-0000-4000-8000-000000000011', '77700000-0000-4000-8000-000000000001', 'Second table');
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name) values
  ('77700000-0000-4000-8000-000000000020', '77700000-0000-4000-8000-000000000001', '77700000-0000-4000-8000-000000000002', '77700000-0000-4000-8000-000000000010', 'Alice''s hero'),
  ('77700000-0000-4000-8000-000000000021', '77700000-0000-4000-8000-000000000001', '77700000-0000-4000-8000-000000000003', '77700000-0000-4000-8000-000000000010', 'Bob''s hero');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('77700000-0000-4000-8000-000000000010', '77700000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('77700000-0000-4000-8000-000000000010', '77700000-0000-4000-8000-000000000002', 'player', 'Alice', '77700000-0000-4000-8000-000000000020'),
  ('77700000-0000-4000-8000-000000000010', '77700000-0000-4000-8000-000000000003', 'player', 'Bob', '77700000-0000-4000-8000-000000000021'),
  ('77700000-0000-4000-8000-000000000011', '77700000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('77700000-0000-4000-8000-000000000011', '77700000-0000-4000-8000-000000000002', 'player', 'Alice elsewhere', null)
on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.items (id, user_id, name, item_type, content, content_player_writable) values
  ('77700000-0000-4000-8000-000000000030', '77700000-0000-4000-8000-000000000001', 'Tavern Ledger', 'wondrous', '{"type":"doc"}', true),
  ('77700000-0000-4000-8000-000000000031', '77700000-0000-4000-8000-000000000001', 'Sealed Contract', 'wondrous', '{"type":"doc"}', false);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── Insert boundaries ───────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '77700000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$ insert into public.item_entries (id, item_id, campaign_id, user_id, party_member_id, content)
     values ('77700000-0000-4000-8000-000000000101', '77700000-0000-4000-8000-000000000030', '77700000-0000-4000-8000-000000000010', '77700000-0000-4000-8000-000000000002', '77700000-0000-4000-8000-000000000020', '{"type":"doc","v":1}') $$,
  'a member writes in a player-writable document');
select throws_ok(
  $$ insert into public.item_entries (item_id, campaign_id, user_id, party_member_id, content)
     values ('77700000-0000-4000-8000-000000000031', '77700000-0000-4000-8000-000000000010', '77700000-0000-4000-8000-000000000002', '77700000-0000-4000-8000-000000000020', '{"type":"doc"}') $$,
  '42501', null,
  'a player cannot write in a locked document');
select throws_ok(
  $$ insert into public.item_entries (item_id, campaign_id, user_id, party_member_id, content)
     values ('77700000-0000-4000-8000-000000000030', '77700000-0000-4000-8000-000000000010', '77700000-0000-4000-8000-000000000002', '77700000-0000-4000-8000-000000000021', '{"type":"doc"}') $$,
  '42501', null,
  'a player cannot sign another character''s name');

select set_config('request.jwt.claim.sub', '77700000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ insert into public.item_entries (id, item_id, campaign_id, user_id, party_member_id, content)
     values ('77700000-0000-4000-8000-000000000102', '77700000-0000-4000-8000-000000000031', '77700000-0000-4000-8000-000000000010', '77700000-0000-4000-8000-000000000001', null, '{"type":"doc"}') $$,
  'the DM writes regardless of the player flag');

-- ── The retarget hole the audit found: anchors are immutable ────────────────────
select set_config('request.jwt.claim.sub', '77700000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ update public.item_entries set item_id = '77700000-0000-4000-8000-000000000031'
     where id = '77700000-0000-4000-8000-000000000101' $$,
  '42501', null,
  'an author cannot move their entry onto a locked item');
select throws_ok(
  $$ update public.item_entries set campaign_id = '77700000-0000-4000-8000-000000000011'
     where id = '77700000-0000-4000-8000-000000000101' $$,
  '42501', null,
  'an author cannot move their entry into another campaign they belong to');
select lives_ok(
  $$ update public.item_entries set content = '{"type":"doc","v":2}'
     where id = '77700000-0000-4000-8000-000000000101' $$,
  'soft ink: an author revises their own words');

-- ── Other hands ─────────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '77700000-0000-4000-8000-000000000003', true);
update public.item_entries set content = '{"type":"doc","forged":true}' where id = '77700000-0000-4000-8000-000000000101';
select is(
  (select content from public.item_entries where id = '77700000-0000-4000-8000-000000000101'),
  '{"type":"doc","v":2}',
  'nobody rewrites someone else''s ink (0-row update)');
delete from public.item_entries where id = '77700000-0000-4000-8000-000000000101';
select is(
  (select count(*) from public.item_entries where id = '77700000-0000-4000-8000-000000000101'),
  1::bigint,
  'a peer cannot delete another author''s entry');

select set_config('request.jwt.claim.sub', '77700000-0000-4000-8000-000000000004', true);
select is(
  (select count(*) from public.item_entries where campaign_id = '77700000-0000-4000-8000-000000000010'),
  0::bigint,
  'a non-member reads nothing');

select set_config('request.jwt.claim.sub', '77700000-0000-4000-8000-000000000001', true);
delete from public.item_entries where id = '77700000-0000-4000-8000-000000000101';
select is(
  (select count(*) from public.item_entries where id = '77700000-0000-4000-8000-000000000101'),
  0::bigint,
  'the DM moderates: any entry at their table can be deleted');

-- ── The one legal anchor transition: party_member_id falls to null via FK ───────
-- ON DELETE SET NULL performs a real UPDATE that fires the guard trigger, so the
-- guard must allow it or deleting a character would start throwing.
reset role;
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
values ('77700000-0000-4000-8000-000000000022', '77700000-0000-4000-8000-000000000001', '77700000-0000-4000-8000-000000000002', '77700000-0000-4000-8000-000000000010', 'Departed hero');
insert into public.item_entries (id, item_id, campaign_id, user_id, party_member_id, content)
values ('77700000-0000-4000-8000-000000000103', '77700000-0000-4000-8000-000000000030', '77700000-0000-4000-8000-000000000010', '77700000-0000-4000-8000-000000000002', '77700000-0000-4000-8000-000000000022', '{"type":"doc"}');
delete from public.party_members where id = '77700000-0000-4000-8000-000000000022';
select is(
  (select count(*) from public.item_entries where id = '77700000-0000-4000-8000-000000000103'),
  1::bigint,
  'deleting the character keeps the ink');
select is(
  (select party_member_id from public.item_entries where id = '77700000-0000-4000-8000-000000000103'),
  null::uuid,
  'the departed hand falls to null, and the guard permits it');

select * from finish();
rollback;
