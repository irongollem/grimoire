begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

select has_function(
  'private',
  'preserve_claimed_characters_on_creator_delete',
  array[]::text[],
  'the claimed-character preservation trigger function exists');

select has_trigger(
  'auth',
  'users',
  'preserve_claimed_characters_on_creator_delete',
  'auth user deletion invokes claimed-character preservation');

select col_not_null(
  'public',
  'party_members',
  'user_id',
  'party_members.user_id remains non-null');

select is(
  (select confdeltype::text
     from pg_constraint
    where conname = 'party_members_user_id_fkey'),
  'c',
  'unclaimed characters retain the creator FK cascade');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('73500000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue735-creator@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('73500000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue735-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('73500000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue735-new-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values
  ('73500000-0000-4000-8000-000000000010', '73500000-0000-4000-8000-000000000001', 'Erasure campaign'),
  ('73500000-0000-4000-8000-000000000011', '73500000-0000-4000-8000-000000000001', 'Transfer campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values
  ('73500000-0000-4000-8000-000000000010', '73500000-0000-4000-8000-000000000002', 'player', 'Owner'),
  ('73500000-0000-4000-8000-000000000011', '73500000-0000-4000-8000-000000000002', 'player', 'Owner'),
  ('73500000-0000-4000-8000-000000000011', '73500000-0000-4000-8000-000000000003', 'player', 'New DM');

insert into public.party_members (
  id, user_id, owner_user_id, campaign_id, name, is_dm_managed
)
values
  ('73500000-0000-4000-8000-000000000020', '73500000-0000-4000-8000-000000000001', '73500000-0000-4000-8000-000000000002', '73500000-0000-4000-8000-000000000010', 'Claimed survivor', false),
  ('73500000-0000-4000-8000-000000000021', '73500000-0000-4000-8000-000000000001', null, '73500000-0000-4000-8000-000000000010', 'Unclaimed hireling', true),
  ('73500000-0000-4000-8000-000000000022', '73500000-0000-4000-8000-000000000001', '73500000-0000-4000-8000-000000000001', '73500000-0000-4000-8000-000000000010', 'Creator-owned character', false),
  ('73500000-0000-4000-8000-000000000023', '73500000-0000-4000-8000-000000000001', '73500000-0000-4000-8000-000000000002', '73500000-0000-4000-8000-000000000011', 'Transferred survivor', false);

insert into public.character_classes (
  id, party_member_id, class_name, levels, is_primary
)
values (
  '73500000-0000-4000-8000-000000000030',
  '73500000-0000-4000-8000-000000000020',
  'Fighter', 4, true
);

set local grimoire.bypass_quota = 'on';
set local role authenticated;
select set_config('request.jwt.claim.sub', '73500000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.transfer_campaign_ownership(
      '73500000-0000-4000-8000-000000000011',
      '73500000-0000-4000-8000-000000000003',
      false,
      'promote')$$,
  'campaign transfer still handles a claimed character');

reset role;

select is(
  (select user_id from public.party_members where id = '73500000-0000-4000-8000-000000000023'),
  '73500000-0000-4000-8000-000000000003'::uuid,
  'campaign transfer re-stamps the character custodian to the new DM');

select is(
  (select owner_user_id from public.party_members where id = '73500000-0000-4000-8000-000000000023'),
  '73500000-0000-4000-8000-000000000002'::uuid,
  'campaign transfer preserves the claiming player');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (select jsonb_array_length(
    public.export_user_data('73500000-0000-4000-8000-000000000002')
      -> 'tables' -> 'party_members')),
  2,
  'the owner export includes both claimed characters before erasure');

select lives_ok(
  $$delete from auth.users where id = '73500000-0000-4000-8000-000000000001'$$,
  'deleting a creator with claimed characters succeeds');

select ok(
  exists (select 1 from public.party_members where id = '73500000-0000-4000-8000-000000000020'),
  'a character claimed by another player survives creator deletion');

select is(
  (select user_id from public.party_members where id = '73500000-0000-4000-8000-000000000020'),
  '73500000-0000-4000-8000-000000000002'::uuid,
  'the surviving owner becomes the character custodian');

select is(
  (select owner_user_id from public.party_members where id = '73500000-0000-4000-8000-000000000020'),
  '73500000-0000-4000-8000-000000000002'::uuid,
  'the surviving character remains claimed by its owner');

select is(
  (select campaign_id from public.party_members where id = '73500000-0000-4000-8000-000000000020'),
  null::uuid,
  'the survivor detaches when the erased creator campaign cascades');

select ok(
  not exists (select 1 from public.party_members where id = '73500000-0000-4000-8000-000000000021'),
  'an unclaimed DM-managed character still cascades');

select ok(
  not exists (select 1 from public.party_members where id = '73500000-0000-4000-8000-000000000022'),
  'a creator-owned character still cascades with its owner');

select ok(
  exists (select 1 from public.character_classes where id = '73500000-0000-4000-8000-000000000030'),
  'the surviving character keeps its progression rows');

select ok(
  exists (select 1 from public.party_members where id = '73500000-0000-4000-8000-000000000023'),
  'a character moved by campaign transfer remains intact');

select is(
  (select jsonb_array_length(
    public.export_user_data('73500000-0000-4000-8000-000000000002')
      -> 'tables' -> 'party_members')),
  2,
  'the owner export still emits each surviving claimed character once');

select * from finish();
rollback;
