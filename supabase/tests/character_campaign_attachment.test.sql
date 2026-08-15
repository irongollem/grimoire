-- Durable characters (#730, migration 20260814221409): a character is OF a
-- player and *links* to at most one campaign. These tests pin the three gated
-- doors (attach / detach / join-with-character), the RPC-only transition
-- guard, the detach-never-delete policy shape, and the two detach triggers
-- (member removal, campaign deletion).
--
-- The whole file runs in one transaction, which matters for ordering: the
-- RPCs set the transaction-local grimoire.pm_campaign_transition flag, and
-- once any RPC has run, the guard trigger is open for the rest of the
-- transaction. Every assertion that a *client* write is blocked therefore
-- runs BEFORE the first RPC call. (In production each PostgREST call is its
-- own transaction, so the flag never outlives the RPC that set it.)

begin;

create extension if not exists pgtap with schema extensions;
select plan(51);

-- ---------------------------------------------------------------------------
-- Structural: the doors exist, exactly once, and anon cannot open them.
-- ---------------------------------------------------------------------------

select has_function('public', 'attach_party_member_to_campaign', array['uuid', 'uuid', 'boolean'],
  'attach RPC exists');
select has_function('public', 'detach_party_member_from_campaign', array['uuid'],
  'detach RPC exists');
select has_function('public', 'clone_party_member', array['uuid'],
  'clone RPC exists');
select has_function('public', 'join_campaign_via_invite', array['uuid', 'uuid'],
  'join RPC takes an optional character');
select is(
  (select count(*)::integer from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'join_campaign_via_invite'),
  1,
  'join_campaign_via_invite has exactly one signature — no overload ambiguity');

select ok(not has_function_privilege('anon', 'public.attach_party_member_to_campaign(uuid,uuid,boolean)', 'EXECUTE'),
  'anon cannot attach');
select ok(not has_function_privilege('anon', 'public.detach_party_member_from_campaign(uuid)', 'EXECUTE'),
  'anon cannot detach');
select ok(not has_function_privilege('anon', 'public.clone_party_member(uuid)', 'EXECUTE'),
  'anon cannot clone');
select ok(not has_function_privilege('anon', 'public.join_campaign_via_invite(uuid,uuid)', 'EXECUTE'),
  'anon cannot join');
select ok(has_function_privilege('authenticated', 'public.attach_party_member_to_campaign(uuid,uuid,boolean)', 'EXECUTE'),
  'authenticated users can attach');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('73000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue730-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('73000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue730-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('73000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue730-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('73000000-0000-4000-8000-000000000010', '73000000-0000-4000-8000-000000000001', 'Durable Characters');

-- u3 is a member (so their failures below are authorization failures, not
-- membership failures).
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('73000000-0000-4000-8000-000000000010', '73000000-0000-4000-8000-000000000003', 'player', 'Other Player');

insert into public.campaign_invites (campaign_id, token, role, created_by)
values ('73000000-0000-4000-8000-000000000010', '73000000-0000-4000-8000-0000000000aa', 'player', '73000000-0000-4000-8000-000000000001');

-- NULL-totality fixtures: these are deliberately unclaimed, so a bare
-- owner_user_id = auth.uid() expression evaluates to NULL for another user.
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, is_dm_managed)
values
  ('73000000-0000-4000-8000-000000000023', '73000000-0000-4000-8000-000000000001', null, '73000000-0000-4000-8000-000000000010', 'Private Hireling', true),
  ('73000000-0000-4000-8000-000000000024', '73000000-0000-4000-8000-000000000001', null, null, 'Benched Hireling', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000003', true);

select throws_like(
  $$select public.attach_party_member_to_campaign('73000000-0000-4000-8000-000000000024', '73000000-0000-4000-8000-000000000010', true)$$,
  '%owner%',
  'a non-owner cannot attach an unclaimed DM-managed character');
select throws_like(
  $$select public.detach_party_member_from_campaign('73000000-0000-4000-8000-000000000023')$$,
  '%owner%',
  'a non-owner cannot detach an unclaimed DM-managed character');
select throws_like(
  $$select public.clone_party_member('73000000-0000-4000-8000-000000000023')$$,
  '%owner%',
  'a non-owner cannot clone an unclaimed DM-managed character');

reset role;

-- ---------------------------------------------------------------------------
-- A player builds a character with no campaign at all, and cannot push one
-- into a campaign they were not invited to. (Must run before any RPC — see
-- the header note about the transaction-local flag.)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
    values ('73000000-0000-4000-8000-000000000020', '73000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000002', null, 'Vael')$$,
  'an unattached character can be created with no membership anywhere');

select throws_ok(
  $$insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
    values ('73000000-0000-4000-8000-000000000029', '73000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000010', 'Gatecrasher')$$,
  '42501',
  'new row violates row-level security policy for table "party_members"',
  'a character cannot be inserted into a campaign the writer is not a member of');

select throws_like(
  $$update public.party_members set campaign_id = '73000000-0000-4000-8000-000000000010'
     where id = '73000000-0000-4000-8000-000000000020'$$,
  '%attach_party_member_to_campaign%',
  'campaign_id cannot be changed by a client-side update');

-- ---------------------------------------------------------------------------
-- Join with a character: the invite binds it and links it active.
-- ---------------------------------------------------------------------------

select is(
  public.join_campaign_via_invite('73000000-0000-4000-8000-0000000000aa', '73000000-0000-4000-8000-000000000020'),
  '73000000-0000-4000-8000-000000000010'::uuid,
  'joining with a character returns the campaign id');

select isnt(
  current_setting('grimoire.pm_campaign_transition', true),
  'on',
  'join restores the campaign-transition flag');

reset role;

select is(
  (select campaign_id from public.party_members where id = '73000000-0000-4000-8000-000000000020'),
  '73000000-0000-4000-8000-000000000010'::uuid,
  'the character travelled into the campaign');

select is(
  (select party_member_id from public.campaign_members
    where campaign_id = '73000000-0000-4000-8000-000000000010'
      and user_id = '73000000-0000-4000-8000-000000000002'),
  '73000000-0000-4000-8000-000000000020'::uuid,
  'the membership links the character as active');

set local role authenticated;
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$select public.join_campaign_via_invite('73000000-0000-4000-8000-0000000000aa', '73000000-0000-4000-8000-000000000020')$$,
  're-joining with the same character is idempotent');

-- ---------------------------------------------------------------------------
-- Attach (benched) and detach, by the owner.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
    values ('73000000-0000-4000-8000-000000000021', '73000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000002', null, 'Backup Bard')$$,
  'a second unattached character can be created');

select lives_ok(
  $$select public.attach_party_member_to_campaign('73000000-0000-4000-8000-000000000021', '73000000-0000-4000-8000-000000000010', false)$$,
  'attach with p_set_active=false brings the character in benched');

select isnt(
  current_setting('grimoire.pm_campaign_transition', true),
  'on',
  'attach restores the campaign-transition flag');

reset role;

select is(
  (select campaign_id from public.party_members where id = '73000000-0000-4000-8000-000000000021'),
  '73000000-0000-4000-8000-000000000010'::uuid,
  'the benched character is in the campaign');

select is(
  (select party_member_id from public.campaign_members
    where campaign_id = '73000000-0000-4000-8000-000000000010'
      and user_id = '73000000-0000-4000-8000-000000000002'),
  '73000000-0000-4000-8000-000000000020'::uuid,
  'a benched attach never clobbers the active character');

set local role authenticated;
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000002', true);

select throws_like(
  $$select public.attach_party_member_to_campaign('73000000-0000-4000-8000-000000000021', '73000000-0000-4000-8000-000000000010', true)$$,
  '%already in a campaign%',
  'an attached character cannot attach again — one campaign at a time');

select lives_ok(
  $$select public.detach_party_member_from_campaign('73000000-0000-4000-8000-000000000021')$$,
  'the owner can detach their character');

select isnt(
  current_setting('grimoire.pm_campaign_transition', true),
  'on',
  'detach restores the campaign-transition flag');

reset role;

select is(
  (select campaign_id from public.party_members where id = '73000000-0000-4000-8000-000000000021'),
  null::uuid,
  'detach returns the character to the pool');

-- ---------------------------------------------------------------------------
-- Another member can touch none of it.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000003', true);

select throws_like(
  $$select public.attach_party_member_to_campaign('73000000-0000-4000-8000-000000000021', '73000000-0000-4000-8000-000000000010', true)$$,
  '%owner%',
  'a stranger cannot attach someone else''s character');

select throws_like(
  $$select public.clone_party_member('73000000-0000-4000-8000-000000000021')$$,
  '%owner%',
  'a stranger cannot clone someone else''s character');

select throws_like(
  $$select public.detach_party_member_from_campaign('73000000-0000-4000-8000-000000000020')$$,
  '%owner%',
  'a fellow player cannot detach someone else''s character');

-- ---------------------------------------------------------------------------
-- Clone: sheet + classes + spells, source_class_id remapped, original
-- untouched, clone lands unattached in the caller's pool.
-- ---------------------------------------------------------------------------

reset role;

insert into public.character_classes (id, party_member_id, class_name, levels, is_primary)
values ('73000000-0000-4000-8000-000000000030', '73000000-0000-4000-8000-000000000020', 'Druid', 3, true);

insert into public.spells (id, user_id, name, classes)
values ('73000000-0000-4000-8000-000000000040', '73000000-0000-4000-8000-000000000002', 'Entangle', array['Druid']);

insert into public.character_spells (party_member_id, spell_id, source_class_id)
values ('73000000-0000-4000-8000-000000000020', '73000000-0000-4000-8000-000000000040', '73000000-0000-4000-8000-000000000030');

set local role authenticated;
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$select public.clone_party_member('73000000-0000-4000-8000-000000000020')$$,
  'the owner can clone their character');

reset role;

select ok(
  exists (select 1 from public.party_members
           where name = 'Vael (copy)'
             and owner_user_id = '73000000-0000-4000-8000-000000000002'
             and user_id = '73000000-0000-4000-8000-000000000002'
             and campaign_id is null),
  'the clone is the caller''s, unattached');

select is(
  (select count(*)::integer from public.character_classes cc
    join public.party_members pm on pm.id = cc.party_member_id
   where pm.name = 'Vael (copy)'),
  1,
  'class rows travel with the clone');

select is(
  (select cs.source_class_id from public.character_spells cs
    join public.party_members pm on pm.id = cs.party_member_id
   where pm.name = 'Vael (copy)'),
  (select cc.id from public.character_classes cc
    join public.party_members pm on pm.id = cc.party_member_id
   where pm.name = 'Vael (copy)'),
  'cloned spells point at the cloned class rows, not the original''s');

select is(
  (select campaign_id from public.party_members where id = '73000000-0000-4000-8000-000000000020'),
  '73000000-0000-4000-8000-000000000010'::uuid,
  'cloning leaves the original exactly where it was');

-- ---------------------------------------------------------------------------
-- The DM can detach a claimed character but can never delete it.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$delete from public.party_members where id = '73000000-0000-4000-8000-000000000020'$$,
  'a DM delete of a claimed character executes without error…');

reset role;

select ok(
  exists (select 1 from public.party_members where id = '73000000-0000-4000-8000-000000000020'),
  '…and deletes nothing — claimed characters are detach-only for the DM');

set local role authenticated;
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.detach_party_member_from_campaign('73000000-0000-4000-8000-000000000020')$$,
  'the DM can detach a claimed character');

reset role;

select is(
  (select campaign_id from public.party_members where id = '73000000-0000-4000-8000-000000000020'),
  null::uuid,
  'DM detach returns the character to its owner''s pool');

select is(
  (select party_member_id from public.campaign_members
    where campaign_id = '73000000-0000-4000-8000-000000000010'
      and user_id = '73000000-0000-4000-8000-000000000002'),
  null::uuid,
  'DM detach unlinks the membership');

-- ---------------------------------------------------------------------------
-- Removing a member detaches their characters; the rows survive.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$select public.attach_party_member_to_campaign('73000000-0000-4000-8000-000000000020', '73000000-0000-4000-8000-000000000010', true)$$,
  'the character re-attaches for the removal test');

reset role;

delete from public.campaign_members
 where campaign_id = '73000000-0000-4000-8000-000000000010'
   and user_id = '73000000-0000-4000-8000-000000000002';

select is(
  (select campaign_id from public.party_members where id = '73000000-0000-4000-8000-000000000020'),
  null::uuid,
  'removing the member detaches their character');

select ok(
  exists (select 1 from public.party_members where id = '73000000-0000-4000-8000-000000000020'),
  'the removed player keeps the character');

-- ---------------------------------------------------------------------------
-- Deleting a campaign detaches every claimed character — and the FK's
-- ON DELETE SET NULL passes the transition guard (regression: the guard
-- fires on that referential UPDATE and must not break campaign deletion).
-- ---------------------------------------------------------------------------

insert into public.campaigns (id, user_id, name)
values ('73000000-0000-4000-8000-000000000011', '73000000-0000-4000-8000-000000000001', 'Doomed Campaign');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('73000000-0000-4000-8000-000000000011', '73000000-0000-4000-8000-000000000002', 'player', 'Player');

set local role authenticated;
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$select public.attach_party_member_to_campaign('73000000-0000-4000-8000-000000000020', '73000000-0000-4000-8000-000000000011', true)$$,
  'the character attaches to the doomed campaign');

reset role;

select lives_ok(
  $$delete from public.campaigns where id = '73000000-0000-4000-8000-000000000011'$$,
  'campaign deletion is not blocked by the transition guard');

select ok(
  exists (select 1 from public.party_members
           where id = '73000000-0000-4000-8000-000000000020' and campaign_id is null),
  'the character survives its campaign, detached');

-- ---------------------------------------------------------------------------
-- Unclaimed DM-managed characters still die with their campaign's DM.
-- ---------------------------------------------------------------------------

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, is_dm_managed)
values ('73000000-0000-4000-8000-000000000022', '73000000-0000-4000-8000-000000000001', null, '73000000-0000-4000-8000-000000000010', 'Hireling', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$delete from public.party_members where id = '73000000-0000-4000-8000-000000000022'$$,
  'the DM can still delete an unclaimed DM-managed character');

reset role;

select ok(
  not exists (select 1 from public.party_members where id = '73000000-0000-4000-8000-000000000022'),
  'the unclaimed character is gone');

select * from finish();
rollback;
