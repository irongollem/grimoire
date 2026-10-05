-- The owner of a character may add spell rows to it even when it is not their
-- active character at a table (a pool character, or a second character), which
-- the creation wizard needs for a level-1 subclass's always-prepared spells.
-- Nobody else gains anything (migration character_owner_writes_its_spells).

begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('9e200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'spells-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('9e200000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'spells-stranger@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- A character resting in its owner's pool: no campaign, so no campaign_members link.
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, is_dm_managed, ruleset)
values ('9e200000-0000-4000-8000-000000000030', '9e200000-0000-4000-8000-000000000001',
        '9e200000-0000-4000-8000-000000000001', null, 'Pool Cleric', false, '2014');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '9e200000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ insert into public.character_spells (party_member_id, spell_id, source_type, source_label)
     values ('9e200000-0000-4000-8000-000000000030', 'srd_light', 'racial', 'Test') $$,
  '42501', null,
  'a stranger cannot add a spell to someone else''s character');

select set_config('request.jwt.claim.sub', '9e200000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$ insert into public.character_spells (party_member_id, spell_id, source_type, source_label)
     values ('9e200000-0000-4000-8000-000000000030', 'srd_light', 'racial', 'Test') $$,
  'the owner adds a spell to their own character while it rests in the pool');

reset role;
select is(
  (select count(*)::integer from public.character_spells where party_member_id = '9e200000-0000-4000-8000-000000000030'),
  1,
  'exactly the owner''s row landed');

-- The other policies are unchanged: still exactly one insert policy that is not the owner's.
select is(
  (select count(*)::integer from pg_policies where tablename = 'character_spells' and cmd = 'INSERT'),
  2,
  'character_spells has the original insert policy and the owner''s, nothing more');

select * from finish();
rollback;
