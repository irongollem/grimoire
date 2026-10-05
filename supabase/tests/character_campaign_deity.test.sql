-- A character's deity belongs to the campaign it was chosen in (migration
-- 20261005013855). Cloning such a character into the pool used to fail on
-- zz_same_campaign_refs, and so did attaching it to another table after a
-- detach. The clone drops the deity, detach keeps it, and attach keeps it
-- only for the table it came from.

begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('9e100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deity-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('9e100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deity-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values
  ('9e100000-0000-4000-8000-000000000010', '9e100000-0000-4000-8000-000000000001', 'Home Table'),
  ('9e100000-0000-4000-8000-000000000011', '9e100000-0000-4000-8000-000000000001', 'Other Table');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values
  ('9e100000-0000-4000-8000-000000000010', '9e100000-0000-4000-8000-000000000002', 'player', 'Player'),
  ('9e100000-0000-4000-8000-000000000011', '9e100000-0000-4000-8000-000000000002', 'player', 'Player');

-- The DM's deity, in the home table.
insert into public.deities (id, user_id, campaign_id, name)
values ('9e100000-0000-4000-8000-000000000020', '9e100000-0000-4000-8000-000000000001', '9e100000-0000-4000-8000-000000000010', 'The Hearth Mother');

-- The player's character at the home table, devoted to the DM's deity.
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, is_dm_managed, ruleset, deity_id)
values ('9e100000-0000-4000-8000-000000000030', '9e100000-0000-4000-8000-000000000002', '9e100000-0000-4000-8000-000000000002',
        '9e100000-0000-4000-8000-000000000010', 'Devout', false, '2014', '9e100000-0000-4000-8000-000000000020');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9e100000-0000-4000-8000-000000000002', true);

-- Clone: the copy lands in the pool without the campaign's deity.
create temp table clone_result (id uuid) on commit drop;
select lives_ok(
  $$ insert into clone_result select public.clone_party_member('9e100000-0000-4000-8000-000000000030') $$,
  'a character with the DM''s deity can be cloned into the pool');
select is(
  (select deity_id from public.party_members where id = (select id from clone_result)),
  null,
  'the clone does not carry the campaign''s deity');
select is(
  (select deity_id from public.party_members where id = '9e100000-0000-4000-8000-000000000030'),
  '9e100000-0000-4000-8000-000000000020'::uuid,
  'the original keeps its deity');

-- Detach keeps the deity, so rejoining the same table keeps it.
select public.detach_party_member_from_campaign('9e100000-0000-4000-8000-000000000030');
select is(
  (select deity_id from public.party_members where id = '9e100000-0000-4000-8000-000000000030'),
  '9e100000-0000-4000-8000-000000000020'::uuid,
  'detach keeps the deity');
select public.attach_party_member_to_campaign('9e100000-0000-4000-8000-000000000030', '9e100000-0000-4000-8000-000000000010', false);
select is(
  (select deity_id from public.party_members where id = '9e100000-0000-4000-8000-000000000030'),
  '9e100000-0000-4000-8000-000000000020'::uuid,
  'rejoining the same table keeps the deity');

-- Another table: the move succeeds and the old table's deity stays behind.
select public.detach_party_member_from_campaign('9e100000-0000-4000-8000-000000000030');
select lives_ok(
  $$ select public.attach_party_member_to_campaign('9e100000-0000-4000-8000-000000000030', '9e100000-0000-4000-8000-000000000011', false) $$,
  'a character carrying one table''s deity can join another table');
select is(
  (select deity_id from public.party_members where id = '9e100000-0000-4000-8000-000000000030'),
  null,
  'the old table''s deity does not follow it');

select * from finish();
rollback;
