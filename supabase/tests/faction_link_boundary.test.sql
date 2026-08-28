begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- Only a faction's DM may link things to it.
--
-- `faction_party_members` gated writes on `(select auth.uid()) = user_id` alone, while
-- `factions_member_select`, `faction_npcs_shared_faction_member_select` and
-- `private.is_faction_pc_member` all admit rows on the strength of the very join that
-- table expresses — "a faction_party_members row links this faction to a campaign_members
-- row that is mine, with role 'player'" — without ever comparing the faction's campaign to
-- the caller's. So the read predicate was satisfiable by a row the reader could write.
--
-- Any player could therefore enrol themselves into any faction in any campaign and read
-- it, its NPCs and its PC roster. Fixed in 20260828211656.
--
-- The 20260828201935 sweep missed this because it enumerated tables having a
-- `campaign_id` column, and these junctions carry only `faction_id`.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('77740000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'faclink-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('77740000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'faclink-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- The DM owns both campaigns; the attacker is a player in ...10 only. The faction under
-- attack lives in ...11, where the attacker has no membership at all.
insert into public.campaigns (id, user_id, name) values
  ('77740000-0000-4000-8000-000000000010', '77740000-0000-4000-8000-000000000002', 'Where the player plays'),
  ('77740000-0000-4000-8000-000000000011', '77740000-0000-4000-8000-000000000002', 'Where the secret is');
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name) values
  ('77740000-0000-4000-8000-000000000020', '77740000-0000-4000-8000-000000000002', '77740000-0000-4000-8000-000000000001', '77740000-0000-4000-8000-000000000010', 'Their character');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('77740000-0000-4000-8000-000000000010', '77740000-0000-4000-8000-000000000001', 'player', 'Player', '77740000-0000-4000-8000-000000000020')
on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.factions (id, user_id, campaign_id, name) values
  ('77740000-0000-4000-8000-000000000030', '77740000-0000-4000-8000-000000000002', '77740000-0000-4000-8000-000000000011', 'Secret Cabal'),
  ('77740000-0000-4000-8000-000000000031', '77740000-0000-4000-8000-000000000002', '77740000-0000-4000-8000-000000000010', 'Local guild');
insert into public.npcs (id, user_id, campaign_id, name) values
  ('77740000-0000-4000-8000-000000000040', '77740000-0000-4000-8000-000000000002', '77740000-0000-4000-8000-000000000011', 'Cabal contact');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '77740000-0000-4000-8000-000000000001', true);

-- Baseline: the faction in the campaign they do not belong to is invisible.
select is(
  (select count(*) from public.factions where id = '77740000-0000-4000-8000-000000000030'),
  0::bigint,
  'a player cannot see a faction in a campaign they are not a member of');

-- The escalation itself: self-enrolment into someone else's faction.
select throws_ok(
  $$ insert into public.faction_party_members (user_id, faction_id, party_member_id)
     values ('77740000-0000-4000-8000-000000000001',
             '77740000-0000-4000-8000-000000000030',
             '77740000-0000-4000-8000-000000000020') $$,
  '42501', null,
  'a player cannot enrol their character into a faction they do not run');

-- ...and not into a faction in their OWN campaign either: they are a player there, not the DM.
select throws_ok(
  $$ insert into public.faction_party_members (user_id, faction_id, party_member_id)
     values ('77740000-0000-4000-8000-000000000001',
             '77740000-0000-4000-8000-000000000031',
             '77740000-0000-4000-8000-000000000020') $$,
  '42501', null,
  'a player cannot enrol themselves into a faction in their own campaign either');

select throws_ok(
  $$ insert into public.faction_npcs (user_id, faction_id, npc_id)
     values ('77740000-0000-4000-8000-000000000001',
             '77740000-0000-4000-8000-000000000030',
             '77740000-0000-4000-8000-000000000040') $$,
  '42501', null,
  'a player cannot attach an NPC to a faction they do not run');

-- The faction stayed invisible — the read path was the point of the attack.
select is(
  (select count(*) from public.factions where id = '77740000-0000-4000-8000-000000000030'),
  0::bigint,
  'the faction is still invisible after the attempts');

-- The DM's own workflow is untouched.
select set_config('request.jwt.claim.sub', '77740000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$ insert into public.faction_party_members (id, user_id, faction_id, party_member_id)
     values ('77740000-0000-4000-8000-000000000050',
             '77740000-0000-4000-8000-000000000002',
             '77740000-0000-4000-8000-000000000031',
             '77740000-0000-4000-8000-000000000020') $$,
  'the DM still links a character to a faction in their own campaign');

-- Structural guard: every faction_* junction must resolve the faction before allowing a
-- write. Checking the shape rather than the five rows above, because what made this
-- exploitable was a read arm added later to a table whose write side had always been
-- loose — the next such table should fail here, not in production.
select is(
  (select coalesce(string_agg(format('%s.%s', tablename, policyname), ', ' order by tablename, policyname), '')
     from pg_policies
    where schemaname = 'public'
      and tablename like 'faction\_%'
      and tablename <> 'faction_embeddings'
      and cmd in ('INSERT', 'UPDATE')
      and with_check is not null
      and with_check !~ 'can_edit_faction|is_campaign_dm|is_campaign_member'),
  '',
  'every faction junction write policy resolves the faction''s campaign');

select * from finish();
rollback;
