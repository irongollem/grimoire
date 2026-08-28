begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

-- A campaign-scoped row must not be movable into a campaign you do not belong to.
--
-- `player_journal_entries` and `session_availability` gated INSERT on
-- `private.is_campaign_member(campaign_id)` but their UPDATE `with check` tested
-- only `(select auth.uid()) = user_id` — membership was checked once, at creation,
-- and `campaign_id` stayed writable afterwards. Since both are read back with a
-- campaign-scoped policy evaluated for the *viewer*, a stranger could publish a row
-- into any campaign whose uuid they knew. Fixed in 20260828210805.
--
-- This is the UPDATE-repoint form of the INSERT injection closed by 20260828201935,
-- and it survived that sweep because these are per-user tables that were correctly
-- excluded from it — the lesson being that a per-user row still carries a
-- campaign_id that decides who else can see it.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('77730000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'repoint-attacker@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('77730000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'repoint-victim@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- create_dm_membership makes each owner a 'dm' member of their own campaign, so the
-- attacker belongs to campaign ...10 and is a stranger to ...11.
insert into public.campaigns (id, user_id, name) values
  ('77730000-0000-4000-8000-000000000010', '77730000-0000-4000-8000-000000000001', 'Attacker''s own campaign'),
  ('77730000-0000-4000-8000-000000000011', '77730000-0000-4000-8000-000000000002', 'Victim campaign');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '77730000-0000-4000-8000-000000000001', true);

-- Writing in a campaign they do belong to is fine, and must stay fine.
select lives_ok(
  $$ insert into public.player_journal_entries (id, user_id, campaign_id, title, content, is_private)
     values ('77730000-0000-4000-8000-000000000100', '77730000-0000-4000-8000-000000000001',
             '77730000-0000-4000-8000-000000000010', 'Mine', 'hi', false) $$,
  'an author writes a journal entry in their own campaign');

select lives_ok(
  $$ update public.player_journal_entries set title = 'Mine, edited'
     where id = '77730000-0000-4000-8000-000000000100' $$,
  'an author may still edit their own entry in place');

-- The repoint itself.
select throws_ok(
  $$ update public.player_journal_entries
        set campaign_id = '77730000-0000-4000-8000-000000000011'
      where id = '77730000-0000-4000-8000-000000000100' $$,
  '42501', null,
  'an author cannot move a journal entry into a campaign they do not belong to');

-- And the consequence that made it worth fixing: nothing of theirs is visible there.
select set_config('request.jwt.claim.sub', '77730000-0000-4000-8000-000000000002', true);
select is(
  (select count(*) from public.player_journal_entries
    where campaign_id = '77730000-0000-4000-8000-000000000011'
      and user_id = '77730000-0000-4000-8000-000000000001'),
  0::bigint,
  'the victim DM sees no injected entry in their campaign');

-- Structural guard: any table carrying a campaign_id whose SELECT admits a whole
-- campaign must re-assert that membership on UPDATE, or the row can be walked in
-- from outside. Checking the shape, not just these two rows.
select is(
  (select coalesce(string_agg(format('%s.%s', u.tablename, u.policyname), ', ' order by u.tablename), '')
     from pg_policies u
    where u.schemaname = 'public'
      and u.cmd = 'UPDATE'
      and u.with_check is not null
      and u.with_check !~ 'campaign_id'
      and exists (
        select 1 from pg_policies s
         where s.schemaname = 'public'
           and s.tablename = u.tablename
           and s.cmd in ('SELECT', 'ALL')
           and s.qual ~ 'is_campaign_member\(campaign_id\)|is_campaign_dm\(campaign_id\)')),
  '',
  'every campaign-readable table re-asserts campaign membership on UPDATE');

select * from finish();
rollback;
