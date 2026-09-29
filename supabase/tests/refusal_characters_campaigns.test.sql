-- #936: refusal cover for the character and campaign definers. Each function
-- is asked by someone who must not be let through, in the same fixture where
-- the rightful caller succeeds, so a refusal proves authorization rather than
-- a broken fixture. Where an argument names a row, the attacker is a real
-- user of their own table naming someone else's row.
--
--   1 Dana   DM of table c1 (also owns c3)   4 Piet  player of c2 only
--   2 Pia    player of c1                    5 Ed    DM of table c2
--   3 Sam    stranger, no membership
-- consume_app_invite is different by design: the token is the credential, so
-- its refusals are an invalid, expired or spent token, not a caller identity.

begin;

create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93630000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'refusal-cc-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 5) as n;

insert into public.campaigns (id, user_id, name) values
  ('93630000-0000-4000-8000-0000000000c1', '93630000-0000-4000-8000-000000000001', 'Dana table'),
  ('93630000-0000-4000-8000-0000000000c2', '93630000-0000-4000-8000-000000000005', 'Ed table'),
  ('93630000-0000-4000-8000-0000000000c3', '93630000-0000-4000-8000-000000000001', 'Dana spare table');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('93630000-0000-4000-8000-0000000000c1', '93630000-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('93630000-0000-4000-8000-0000000000c2', '93630000-0000-4000-8000-000000000005', 'dm', 'Ed'),
  ('93630000-0000-4000-8000-0000000000c3', '93630000-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('93630000-0000-4000-8000-0000000000c1', '93630000-0000-4000-8000-000000000002', 'player', 'Pia'),
  ('93630000-0000-4000-8000-0000000000c2', '93630000-0000-4000-8000-000000000004', 'player', 'Piet')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- e1 unclaimed DM-managed NPC-like character in c1; e2 Pia's free character;
-- e3 and e6 Pia's characters in c1; e5 Piet's free character.
insert into public.party_members (id, user_id, owner_user_id, is_dm_managed, campaign_id, name) values
  ('93630000-0000-4000-8000-0000000000e1', '93630000-0000-4000-8000-000000000001', null, true, '93630000-0000-4000-8000-0000000000c1', 'Unclaimed knight'),
  ('93630000-0000-4000-8000-0000000000e2', '93630000-0000-4000-8000-000000000002', '93630000-0000-4000-8000-000000000002', false, null, 'Pia free'),
  ('93630000-0000-4000-8000-0000000000e3', '93630000-0000-4000-8000-000000000002', '93630000-0000-4000-8000-000000000002', false, '93630000-0000-4000-8000-0000000000c1', 'Pia seated'),
  ('93630000-0000-4000-8000-0000000000e5', '93630000-0000-4000-8000-000000000004', '93630000-0000-4000-8000-000000000004', false, null, 'Piet free'),
  ('93630000-0000-4000-8000-0000000000e6', '93630000-0000-4000-8000-000000000002', '93630000-0000-4000-8000-000000000002', false, '93630000-0000-4000-8000-0000000000c1', 'Pia second');

insert into public.ruleset_reviews (campaign_id, party_member_id, flag_type) values
  ('93630000-0000-4000-8000-0000000000c1', '93630000-0000-4000-8000-0000000000e3', 'background');

insert into public.app_invites (token, expires_at, max_uses, use_count) values
  ('93630000-0000-4000-8000-0000000000a1', now() + interval '1 day', 5, 0),
  ('93630000-0000-4000-8000-0000000000a2', now() - interval '1 day', 5, 0),
  ('93630000-0000-4000-8000-0000000000a3', null, 1, 1);

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"93630000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

create function pg_temp.pm_campaign(p_id text) returns uuid language sql security definer as $$
  select campaign_id from public.party_members where id = ('93630000-0000-4000-8000-0000000000' || p_id)::uuid;
$$;
create function pg_temp.campaign_exists(p_id text) returns boolean language sql security definer as $$
  select exists (select 1 from public.campaigns where id = ('93630000-0000-4000-8000-0000000000' || p_id)::uuid);
$$;
create function pg_temp.review_count() returns bigint language sql security definer as $$
  select count(*) from public.ruleset_reviews where party_member_id = '93630000-0000-4000-8000-0000000000e3';
$$;

set local role authenticated;

-- ── assume_character ────────────────────────────────────────────────────────
select pg_temp.as_user(3);
select throws_ok($$ select public.assume_character('93630000-0000-4000-8000-0000000000e1') $$, 'Not a campaign player',
  'assume_character: a stranger cannot take over another table''s unclaimed character');
select pg_temp.as_user(1);
select throws_ok($$ select public.assume_character('93630000-0000-4000-8000-0000000000e1') $$, 'Not a campaign player',
  'assume_character: the DM is not a player and cannot assume it either');
select pg_temp.as_user(4);
select throws_ok($$ select public.assume_character('93630000-0000-4000-8000-0000000000e1') $$, 'Not a campaign player',
  'assume_character: a player of a different campaign cannot assume it');
select pg_temp.as_user(2);
select throws_ok($$ select public.assume_character('93630000-0000-4000-8000-0000000000e3') $$, 'Character is not available for assumption',
  'assume_character: a claimed character is not available, even to a player at the table');
select isnt(public.assume_character('93630000-0000-4000-8000-0000000000e1'), null,
  'assume_character: control, a player at the table assumes the unclaimed character');

-- ── attach_party_member_to_campaign ─────────────────────────────────────────
select pg_temp.as_user(3);
select throws_ok($$ select public.attach_party_member_to_campaign('93630000-0000-4000-8000-0000000000e2', '93630000-0000-4000-8000-0000000000c1') $$,
  'Only the character''s owner can attach it',
  'attach: a stranger cannot attach someone else''s character');
select pg_temp.as_user(4);
select throws_ok($$ select public.attach_party_member_to_campaign('93630000-0000-4000-8000-0000000000e5', '93630000-0000-4000-8000-0000000000c1') $$,
  'You are not a member of that campaign',
  'attach: an owner cannot attach their own character to a table they are not in');
select pg_temp.as_user(2);
select lives_ok($$ select public.attach_party_member_to_campaign('93630000-0000-4000-8000-0000000000e2', '93630000-0000-4000-8000-0000000000c1') $$,
  'attach: control, the owner attaches to a table they belong to');
select is(pg_temp.pm_campaign('e2'), '93630000-0000-4000-8000-0000000000c1'::uuid,
  'attach: the control call did attach it');

-- ── clone_party_member ──────────────────────────────────────────────────────
select pg_temp.as_user(3);
select throws_ok($$ select public.clone_party_member('93630000-0000-4000-8000-0000000000e3') $$,
  'Only the character''s owner can clone it',
  'clone: a stranger cannot copy someone else''s sheet');
select pg_temp.as_user(1);
select throws_ok($$ select public.clone_party_member('93630000-0000-4000-8000-0000000000e3') $$,
  'Only the character''s owner can clone it',
  'clone: the campaign DM cannot copy a claimed character either');
select pg_temp.as_user(2);
select isnt(public.clone_party_member('93630000-0000-4000-8000-0000000000e3'), null,
  'clone: control, the owner clones their own character');

-- ── detach_party_member_from_campaign ───────────────────────────────────────
select pg_temp.as_user(3);
select throws_ok($$ select public.detach_party_member_from_campaign('93630000-0000-4000-8000-0000000000e3') $$,
  'Only the character''s owner or the campaign DM can detach it',
  'detach: a stranger cannot pull a character out of a table');
select pg_temp.as_user(5);
select throws_ok($$ select public.detach_party_member_from_campaign('93630000-0000-4000-8000-0000000000e3') $$,
  'Only the character''s owner or the campaign DM can detach it',
  'detach: the DM of a different table cannot detach it');
select is(pg_temp.pm_campaign('e3'), '93630000-0000-4000-8000-0000000000c1'::uuid,
  'detach: the refused calls left the character seated');
select pg_temp.as_user(1);
select lives_ok($$ select public.detach_party_member_from_campaign('93630000-0000-4000-8000-0000000000e3') $$,
  'detach: control, the campaign DM detaches');
select pg_temp.as_user(2);
select lives_ok($$ select public.detach_party_member_from_campaign('93630000-0000-4000-8000-0000000000e6') $$,
  'detach: control, the owner detaches their own character');

-- ── acknowledge_ruleset_reviews ─────────────────────────────────────────────
select pg_temp.as_user(3);
select throws_ok($$ select public.acknowledge_ruleset_reviews('93630000-0000-4000-8000-0000000000e3') $$, '42501', 'Party member not found or not authorized',
  'ack: a stranger cannot clear another character''s reviews');
select pg_temp.as_user(5);
select throws_ok($$ select public.acknowledge_ruleset_reviews('93630000-0000-4000-8000-0000000000e3') $$, '42501', 'Party member not found or not authorized',
  'ack: the DM of a different table cannot clear them');
select is(pg_temp.review_count(), 1::bigint, 'ack: the refused calls left the review in place');
select pg_temp.as_user(2);
select lives_ok($$ select public.acknowledge_ruleset_reviews('93630000-0000-4000-8000-0000000000e3') $$,
  'ack: control, the owner acknowledges');
select is(pg_temp.review_count(), 0::bigint, 'ack: the control call did clear it');

-- ── delete_campaign_with_homebrew ───────────────────────────────────────────
select pg_temp.as_user(3);
select throws_ok($$ select public.delete_campaign_with_homebrew('93630000-0000-4000-8000-0000000000c1', 'delete') $$,
  'Not authorized to delete this campaign',
  'delete: a stranger cannot delete someone else''s campaign');
select pg_temp.as_user(2);
select throws_ok($$ select public.delete_campaign_with_homebrew('93630000-0000-4000-8000-0000000000c1', 'promote') $$,
  'Not authorized to delete this campaign',
  'delete: a player at the table cannot delete it');
select ok(pg_temp.campaign_exists('c1'), 'delete: the refused calls left the campaign standing');
select pg_temp.as_user(1);
select lives_ok($$ select public.delete_campaign_with_homebrew('93630000-0000-4000-8000-0000000000c3', 'delete') $$,
  'delete: control, the owner deletes their own campaign');
select ok(not pg_temp.campaign_exists('c3'), 'delete: the control call did delete it');

-- ── consume_app_invite ──────────────────────────────────────────────────────
-- The token is the credential, so the refusals are the token's, not the caller's.
select pg_temp.as_user(3);
select throws_ok($$ select public.consume_app_invite('93630000-0000-4000-8000-0000000000ff') $$, 'Invalid or expired invite',
  'consume_app_invite: an unknown token is refused');
select throws_ok($$ select public.consume_app_invite('93630000-0000-4000-8000-0000000000a2') $$, 'Invalid or expired invite',
  'consume_app_invite: an expired token is refused');
select throws_ok($$ select public.consume_app_invite('93630000-0000-4000-8000-0000000000a3') $$, 'Invalid or expired invite',
  'consume_app_invite: a spent token is refused');
select is(public.consume_app_invite('93630000-0000-4000-8000-0000000000a1'), true,
  'consume_app_invite: control, a live token is accepted');

select * from finish();
rollback;
