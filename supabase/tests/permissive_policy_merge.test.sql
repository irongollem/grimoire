-- #999 3.3: permissive policies for one (table, command, role set) are merged into one.
--
-- The advisor's multiple_permissive_policies category is about readability and cost; the
-- hard requirement is that merging changed nobody's access. scripts/db/rls-differential.ts
-- proves that across every local account; this file pins the end state and exercises the
-- merged tables with positive AND negative controls.
begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

-- ── The end state ────────────────────────────────────────────────────────────

select is(
  (select count(*) from (
     select 1 from pg_policies
      where schemaname = 'public' and permissive = 'PERMISSIVE'
      group by tablename, cmd, roles
     having count(*) > 1
   ) dup_groups),
  0::bigint,
  'no (table, command, role set) in public has two permissive policies');

-- A FOR ALL policy counts toward each of the four commands, so it is expanded here.
select is(
  (select count(*) from (
     select 1
       from pg_policies p
       join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) c(cmd) on p.cmd in (c.cmd, 'ALL')
      where p.schemaname = 'public' and p.permissive = 'PERMISSIVE'
      group by p.tablename, c.cmd, p.roles
     having count(*) > 1
   ) all_dups),
  0::bigint,
  'no FOR ALL policy overlaps a command-specific or another FOR ALL policy for the same roles');

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('99933000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'merge-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('99933000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'merge-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('99933000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'merge-stranger@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('99933000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'merge-admin@example.invalid', '', '{"role":"admin"}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('99933000-0000-4000-8000-000000000010', '99933000-0000-4000-8000-000000000001', 'Merge campaign');

-- campaigns_create_dm_membership seats the DM; seat the player by hand.
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('99933000-0000-4000-8000-000000000010', '99933000-0000-4000-8000-000000000002', 'player', 'Pippa');

insert into public.quests (id, user_id) values
  ('99933000-0000-4000-8000-000000000020', '99933000-0000-4000-8000-000000000001');

insert into public.pantheons (id, user_id, campaign_id, name) values
  ('99933000-0000-4000-8000-000000000030', '99933000-0000-4000-8000-000000000001', '99933000-0000-4000-8000-000000000010', 'Merge pantheon');

insert into public.companions (id, user_id, campaign_id) values
  ('99933000-0000-4000-8000-000000000040', '99933000-0000-4000-8000-000000000001', '99933000-0000-4000-8000-000000000010');

insert into public.campaign_messages (id, campaign_id, user_id, message) values
  ('99933000-0000-4000-8000-000000000050', '99933000-0000-4000-8000-000000000010', '99933000-0000-4000-8000-000000000002', 'player line 1'),
  ('99933000-0000-4000-8000-000000000051', '99933000-0000-4000-8000-000000000010', '99933000-0000-4000-8000-000000000002', 'player line 2'),
  ('99933000-0000-4000-8000-000000000052', '99933000-0000-4000-8000-000000000010', '99933000-0000-4000-8000-000000000001', 'dm line');

insert into public.ai_credit_ledger (user_id, delta, reason) values
  ('99933000-0000-4000-8000-000000000002', 5, 'merge test');

insert into public.plans (id, name) values ('zz-merge-plan', 'Merge plan');

-- ── plans: public-readable, both identical policies folded into one ─────────

set local role anon;
select is((select count(*) from public.plans where id = 'zz-merge-plan'), 1::bigint,
  'anon still reads plans (the merged policy is still true)');
reset role;

-- ── quests: own row only (two identical own-row policies folded) ────────────

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.quests where id = '99933000-0000-4000-8000-000000000020'), 1::bigint,
  'the quest owner reads their quest');
select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.quests where id = '99933000-0000-4000-8000-000000000020'), 0::bigint,
  'a stranger does not read it');

-- ── ai_credit_ledger: owner or admin ─────────────────────────────────────────

select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.ai_credit_ledger where reason = 'merge test'), 1::bigint,
  'the ledger owner reads their entry');
select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.ai_credit_ledger where reason = 'merge test'), 0::bigint,
  'a stranger does not read it (the admin branch is false for a plain account, not NULL)');
select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000004","role":"authenticated","app_metadata":{"role":"admin"}}', true);
select is((select count(*) from public.ai_credit_ledger where reason = 'merge test'), 1::bigint,
  'the admin reads it through the other branch of the merged policy');

-- ── pantheons: the DM sees it; a player with no grant and a stranger do not ──

select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.pantheons where id = '99933000-0000-4000-8000-000000000030'), 1::bigint,
  'the DM reads their pantheon');
select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.pantheons where id = '99933000-0000-4000-8000-000000000030'), 0::bigint,
  'a player it is not shared with does not');
select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.pantheons where id = '99933000-0000-4000-8000-000000000030'), 0::bigint,
  'a stranger does not');

-- ── companions: the owner or any campaign member ────────────────────────────

select is((select count(*) from public.companions where id = '99933000-0000-4000-8000-000000000040'), 0::bigint,
  'a stranger does not read the companion');
select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.companions where id = '99933000-0000-4000-8000-000000000040'), 1::bigint,
  'a campaign member does');

-- ── campaign_messages delete: the author, or the campaign DM; nobody else ───

select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000003","role":"authenticated"}', true);
delete from public.campaign_messages where id = '99933000-0000-4000-8000-000000000050';
reset role;
select is((select count(*) from public.campaign_messages where id = '99933000-0000-4000-8000-000000000050'), 1::bigint,
  'a stranger cannot delete a message');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000002","role":"authenticated"}', true);
delete from public.campaign_messages where id = '99933000-0000-4000-8000-000000000050';
reset role;
select is((select count(*) from public.campaign_messages where id = '99933000-0000-4000-8000-000000000050'), 0::bigint,
  'the author deletes their own message');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000001","role":"authenticated"}', true);
delete from public.campaign_messages where id = '99933000-0000-4000-8000-000000000051';
reset role;
select is((select count(*) from public.campaign_messages where id = '99933000-0000-4000-8000-000000000051'), 0::bigint,
  'the DM deletes a player''s message');

-- ── campaign_members update: own row, or the DM; the merged with check holds both ──

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.campaign_members set display_name = 'Pippa the Bold'
 where campaign_id = '99933000-0000-4000-8000-000000000010' and user_id = '99933000-0000-4000-8000-000000000002';
select is((select display_name from public.campaign_members
            where campaign_id = '99933000-0000-4000-8000-000000000010' and user_id = '99933000-0000-4000-8000-000000000002'),
  'Pippa the Bold', 'a member updates their own membership row');

select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000003","role":"authenticated"}', true);
update public.campaign_members set display_name = 'Hijacked'
 where campaign_id = '99933000-0000-4000-8000-000000000010' and user_id = '99933000-0000-4000-8000-000000000002';
reset role;
select is((select display_name from public.campaign_members
            where campaign_id = '99933000-0000-4000-8000-000000000010' and user_id = '99933000-0000-4000-8000-000000000002'),
  'Pippa the Bold', 'a stranger cannot update it');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.campaign_members set display_name = 'Pippa (DM-edited)'
 where campaign_id = '99933000-0000-4000-8000-000000000010' and user_id = '99933000-0000-4000-8000-000000000002';
reset role;
select is((select display_name from public.campaign_members
            where campaign_id = '99933000-0000-4000-8000-000000000010' and user_id = '99933000-0000-4000-8000-000000000002'),
  'Pippa (DM-edited)', 'the campaign DM can update it');

-- ── party_members insert: creator or owner or DM, one merged check ──────────

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99933000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.party_members (user_id, campaign_id, name, ruleset)
     values ('99933000-0000-4000-8000-000000000003', '99933000-0000-4000-8000-000000000010', 'Intruder', '2014') $$,
  '42501', null, 'a stranger cannot create a party member in someone else''s campaign');
select lives_ok(
  $$ insert into public.party_members (user_id, name, ruleset)
     values ('99933000-0000-4000-8000-000000000003', 'Loner', '2014') $$,
  'a user creates their own unattached character');
reset role;

select * from finish();
rollback;
