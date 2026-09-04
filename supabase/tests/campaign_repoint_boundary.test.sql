begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

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

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('77730000-0000-4000-8000-000000000300', '77730000-0000-4000-8000-000000000001',
   '77730000-0000-4000-8000-000000000010', 'Attacker''s shop', 'store'),
  ('77730000-0000-4000-8000-000000000301', '77730000-0000-4000-8000-000000000002',
   '77730000-0000-4000-8000-000000000011', 'Victim''s shop', 'store');

insert into public.items (id, user_id, name, item_type) values
  ('77730000-0000-4000-8000-000000000400', '77730000-0000-4000-8000-000000000001', 'Squatting trinket', 'gear');

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

-- ── companions: the same repoint, through a policy with no `with check` ──────
--
-- companions_update carried no `with check` clause at all, and a policy without
-- one uses its `USING` clause as the check. Its first disjunct is
-- `(select auth.uid()) = user_id`, which says nothing about campaign_id — so the
-- owner of a companion could walk it into any campaign whose uuid they knew, and
-- companions_select being is_campaign_member(campaign_id) *for the viewer* then
-- put it in the victim DM's roster. Fixed in 20260904234033.
--
-- This is why the structural guard below now reads coalesce(with_check, qual):
-- the earlier version tested `with_check is not null`, so the one policy in this
-- class with no check clause was the one it could not see.

select set_config('request.jwt.claim.sub', '77730000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ insert into public.companions (id, user_id, campaign_id, name)
     values ('77730000-0000-4000-8000-000000000200', '77730000-0000-4000-8000-000000000001',
             null, 'Unscoped mule') $$,
  'an unscoped companion is allowed, as it always was');

select throws_ok(
  $$ update public.companions
        set campaign_id = '77730000-0000-4000-8000-000000000011'
      where id = '77730000-0000-4000-8000-000000000200' $$,
  '42501', null,
  'a companion cannot be walked into a campaign the owner does not belong to');

select lives_ok(
  $$ update public.companions
        set campaign_id = '77730000-0000-4000-8000-000000000010'
      where id = '77730000-0000-4000-8000-000000000200' $$,
  'and can still be moved into a campaign the owner does belong to');

-- ── store_items: the INSERT guard of 20260612000003, through the other verb ──
--
-- That migration made INSERT require the target location to belong to the caller,
-- because a campaign member can read every location uuid in the campaign and keeps
-- them after being removed. UPDATE checked only row ownership, so the same row
-- reached the same forbidden location by being moved there. Fixed in 20260904234033.

select lives_ok(
  $$ insert into public.store_items (id, user_id, location_id, item_id)
     values ('77730000-0000-4000-8000-000000000500', '77730000-0000-4000-8000-000000000001',
             '77730000-0000-4000-8000-000000000300', '77730000-0000-4000-8000-000000000400') $$,
  'a ware may be stocked in a shop its owner holds');

select throws_ok(
  $$ update public.store_items
        set location_id = '77730000-0000-4000-8000-000000000301'
      where id = '77730000-0000-4000-8000-000000000500' $$,
  '42501', null,
  'a ware cannot be moved into someone else''s shop');

-- Structural guard: any table carrying a campaign_id whose SELECT admits a whole
-- campaign must re-assert that membership on UPDATE, or the row can be walked in
-- from outside. Checking the shape, not just these rows.
--
-- `coalesce(with_check, qual)` because a policy with no `with check` uses its
-- `USING` clause as the check — testing `with_check is not null` skipped exactly
-- those, which is how companions_update survived the 20260828210805 sweep.
select is(
  (select coalesce(string_agg(format('%s.%s', u.tablename, u.policyname), ', ' order by u.tablename), '')
     from pg_policies u
    where u.schemaname = 'public'
      and u.cmd = 'UPDATE'
      and coalesce(u.with_check, u.qual) !~ 'campaign_id'
      -- Excluded by construction: campaign_members pins campaign_id in a
      -- trigger rather than a policy clause, because the same UPDATE must also
      -- pin `role` and validate the party_member_id being claimed — three
      -- conditions that need the OLD row, which a WITH CHECK cannot see. The
      -- next assertion is what stops this exclusion from rotting into a hole.
      and u.tablename <> 'campaign_members'
      and exists (
        select 1 from pg_policies s
         where s.schemaname = 'public'
           and s.tablename = u.tablename
           and s.cmd in ('SELECT', 'ALL')
           and s.qual ~ 'is_campaign_member\(campaign_id\)|is_campaign_dm\(campaign_id\)')),
  '',
  'every campaign-readable table re-asserts campaign membership on UPDATE');

-- The exclusion above is only safe while the trigger it names still does the job.
select is(
  (select count(*) from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_proc p on p.oid = t.tgfoid
    where c.relname = 'campaign_members'
      and p.proname = 'guard_campaign_member_self_update'
      and not t.tgisinternal),
  1::bigint,
  'campaign_members still carries the trigger that stands in for its WITH CHECK');

select matches(
  (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'guard_campaign_member_self_update'),
  'new\.campaign_id is distinct from old\.campaign_id',
  'and that trigger still pins campaign_id against a repoint');

select * from finish();
rollback;
