begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- Tracker values follow their rule's visibility (migration
-- 20260926142743). A player reaches a character's tracker value only for a
-- built-in optional rule or a custom rule marked player-visible; a DM-only
-- rule's values (the demo campaign's Lucidity, say) stay the DM's.

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('91500000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tracker-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('91500000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tracker-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('91500000-0000-4000-8000-000000000010', '91500000-0000-4000-8000-000000000001', 'Tracker campaign');

insert into public.party_members (id, user_id, campaign_id, name)
values ('91500000-0000-4000-8000-000000000020', '91500000-0000-4000-8000-000000000001', '91500000-0000-4000-8000-000000000010', 'Toddy');

-- The campaign's own insert trigger already made its owner the DM member.
insert into public.campaign_members (campaign_id, user_id, role, party_member_id)
values ('91500000-0000-4000-8000-000000000010', '91500000-0000-4000-8000-000000000002', 'player', '91500000-0000-4000-8000-000000000020');

insert into public.rules (id, user_id, campaign_id, title, is_player_visible)
values
  ('91500000-0000-4000-8000-000000000030', '91500000-0000-4000-8000-000000000001', '91500000-0000-4000-8000-000000000010', 'Corruption', true),
  ('91500000-0000-4000-8000-000000000031', '91500000-0000-4000-8000-000000000001', '91500000-0000-4000-8000-000000000010', 'Lucidity', false);

insert into public.party_member_tracker_state (id, party_member_id, campaign_id, rule_id, rule_key, value)
values
  ('91500000-0000-4000-8000-000000000040', '91500000-0000-4000-8000-000000000020', '91500000-0000-4000-8000-000000000010', '91500000-0000-4000-8000-000000000030', null, 3),
  ('91500000-0000-4000-8000-000000000041', '91500000-0000-4000-8000-000000000020', '91500000-0000-4000-8000-000000000010', '91500000-0000-4000-8000-000000000031', null, 8),
  ('91500000-0000-4000-8000-000000000042', '91500000-0000-4000-8000-000000000020', '91500000-0000-4000-8000-000000000010', null, 'exhaustion', 1);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The player ───────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '91500000-0000-4000-8000-000000000002', true);

select is(
  (select count(*) from public.party_member_tracker_state where campaign_id = '91500000-0000-4000-8000-000000000010'),
  2::bigint,
  'a player sees the player-visible rule''s value and the built-in rule''s value');

select is(
  (select count(*) from public.party_member_tracker_state where id = '91500000-0000-4000-8000-000000000041'),
  0::bigint,
  'a player cannot read a DM-only rule''s value for their own character');

update public.party_member_tracker_state set value = 0 where id = '91500000-0000-4000-8000-000000000041';

select lives_ok(
  $$ update public.party_member_tracker_state set value = 4 where id = '91500000-0000-4000-8000-000000000040' $$,
  'a player still updates a player-visible tracker on their own character');

select throws_ok(
  $$ insert into public.party_member_tracker_state (party_member_id, campaign_id, rule_id, value)
     values ('91500000-0000-4000-8000-000000000020', '91500000-0000-4000-8000-000000000010', '91500000-0000-4000-8000-000000000031', 10)
     on conflict do nothing $$,
  '42501',
  null,
  'a player cannot write a value for a DM-only rule');

-- ── The DM ───────────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '91500000-0000-4000-8000-000000000001', true);

select is(
  (select value from public.party_member_tracker_state where id = '91500000-0000-4000-8000-000000000041'),
  8,
  'the player''s update of the DM-only value changed nothing');

select is(
  (select value from public.party_member_tracker_state where id = '91500000-0000-4000-8000-000000000040'),
  4,
  'the player''s update of the visible value landed');

select is(
  (select count(*) from public.party_member_tracker_state where campaign_id = '91500000-0000-4000-8000-000000000010'),
  3::bigint,
  'the DM sees every tracker value, DM-only included');

select lives_ok(
  $$ update public.party_member_tracker_state set value = 7 where id = '91500000-0000-4000-8000-000000000041' $$,
  'the DM updates a DM-only value');

select * from finish();
rollback;
