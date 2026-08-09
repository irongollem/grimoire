-- The invariants behind #636/#635 (migration 20260809143243) and the trigger
-- bindings behind 20260809143816.
--
-- The whole class of bug here is a fallback chain quietly ending at the email
-- address. Chains are edited from the top — someone adds a nicer source of
-- names in front — and the last link never gets read again, so this pins the
-- last link rather than the whole chain.
--
-- It also pins the two auth.users triggers. They lived only in production until
-- 20260809143816, which meant create_user_profile() could not be exercised
-- anywhere but production. This file is the thing that stops that recurring:
-- delete the bindings and these tests fail rather than silently testing nothing.
--
-- Companion to context/compliance/data-subject-rights.md §4a.

begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- create_free_subscription() fires on the same INSERT and needs a plan to point
-- at. Seeded here rather than relying on seed.sql so the file is self-contained.
insert into public.plans (id, name) values ('free', 'Free')
on conflict (id) do nothing;


-- ── The two bindings exist and point at the right functions ────────────────
select is(
  (select p.proname
     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'auth.users'::regclass and t.tgname = 'on_auth_user_created'),
  'create_user_profile',
  'on_auth_user_created is bound to create_user_profile'
);

select is(
  (select p.proname
     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'auth.users'::regclass and t.tgname = 'on_auth_user_created_subscription'),
  'create_free_subscription',
  'on_auth_user_created_subscription is bound to create_free_subscription'
);

-- ── Signup ─────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('71000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'blankname@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('71000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'withname@example.invalid',  '', '{}'::jsonb, '{"display_name": "Thorne Ironhand"}'::jsonb);

select isnt(
  (select username from public.profiles where user_id = '71000000-0000-4000-8000-000000000001'),
  'blankname',
  'a signup with no display name does NOT inherit the email local part (#636)'
);

select isnt(
  (select username from public.profiles where user_id = '71000000-0000-4000-8000-000000000001'),
  null,
  'that signup still gets a username — the generator ran, it did not fall through'
);

select is(
  (select username from public.profiles where user_id = '71000000-0000-4000-8000-000000000002'),
  'Thorne Ironhand',
  'a display name supplied at signup still wins over the generated handle'
);

-- ── Membership display names ───────────────────────────────────────────────
-- The DM path: create_dm_membership() fires on campaign insert.
insert into public.campaigns (id, user_id, name)
values ('71000000-0000-4000-8000-000000000010', '71000000-0000-4000-8000-000000000001', 'Identity test');

select isnt(
  (select display_name from public.campaign_members
    where campaign_id = '71000000-0000-4000-8000-000000000010'
      and user_id = '71000000-0000-4000-8000-000000000001'),
  'blankname@example.invalid',
  'a new DM membership is not named after the account email (#635)'
);

select is(
  (select cm.display_name = p.username
     from public.campaign_members cm
     join public.profiles p on p.user_id = cm.user_id
    where cm.campaign_id = '71000000-0000-4000-8000-000000000010'),
  true,
  'it takes the profile handle instead'
);

-- The email is gone from the chain entirely, not merely deprioritised: with no
-- profile and no signup metadata there is nothing left to fall back to but the
-- placeholder. This is the assertion that fails if someone re-adds the address
-- as a "better than nothing" last resort.
delete from public.profiles where user_id = '71000000-0000-4000-8000-000000000001';

insert into public.campaigns (id, user_id, name)
values ('71000000-0000-4000-8000-000000000011', '71000000-0000-4000-8000-000000000001', 'Identity test, no profile');

select is(
  (select display_name from public.campaign_members
    where campaign_id = '71000000-0000-4000-8000-000000000011'),
  '(unnamed player)',
  'with no handle and no signup name, the fallback is a placeholder — never the email'
);

-- ── The chains do not mention the email column at all ──────────────────────
-- Asserted against the function source rather than by sweeping the data. A data
-- sweep here would read whatever seed.sql happens to hold — and seed.sql is an
-- untracked `db:pull` dump of production, so the same assertion passes in CI
-- (no dump, no rows) and fails on a developer's machine (dump, real addresses)
-- without either outcome saying anything about the code. The backfill over real
-- rows is asserted where it belongs: in migration 20260809143243 §6, at deploy.
--
-- These three catch the actual regression — someone re-adding
-- `(select email from auth.users ...)` to a fallback chain — regardless of
-- whether any row currently demonstrates it.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_dm_membership'
      and pg_get_functiondef(p.oid) ~* 'email'),
  0,
  'create_dm_membership() does not mention email anywhere in its body'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'join_campaign_via_invite'
      and pg_get_functiondef(p.oid) ~* 'email'),
  0,
  'join_campaign_via_invite() does not mention email anywhere in its body'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_user_profile'
      and pg_get_functiondef(p.oid) ~* 'email'),
  0,
  'create_user_profile() does not mention email anywhere in its body'
);

select * from finish();
rollback;
