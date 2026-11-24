-- #1228: a campaign's BYOK keys are the owner's alone. They used to sit on the
-- campaign row, which every member reads (players included), so anyone at the
-- table could read the owner's encrypted provider keys. They now live in
-- campaign_api_keys (20261119232102), and these tests hold the boundary.
begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

-- ── Structural: no credential returns to the campaign row ──────────────────
-- Every member reads `campaigns` whole. ical_token is the one credential meant
-- for the whole party (the iCal feed URL); any other is a key on the wrong row.

select is(
  (select coalesce(array_agg(a.attname::text order by a.attname), '{}')
     from pg_attribute a
    where a.attrelid = 'public.campaigns'::regclass and a.attnum > 0 and not a.attisdropped
      and private.is_credential_column(a.attname)),
  array['ical_token'],
  'the campaign row, which every member reads, carries no credential but the party''s calendar feed');

-- ── Fixture: an owner (Pro-equivalent, so a key may be stored), a co-DM, a player, an outsider ──

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('71228000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'keys-owner@example.invalid', '', '{"provider":"email","role":"admin"}'::jsonb, '{}'::jsonb),
  ('71228000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'keys-codm@example.invalid', '', '{"provider":"email"}'::jsonb, '{}'::jsonb),
  ('71228000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'keys-player@example.invalid', '', '{"provider":"email"}'::jsonb, '{}'::jsonb),
  ('71228000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'keys-outsider@example.invalid', '', '{"provider":"email"}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('71228000-0000-4000-8000-000000000010', '71228000-0000-4000-8000-000000000001', 'Keys campaign');

insert into public.campaign_members (campaign_id, user_id, role)
values
  ('71228000-0000-4000-8000-000000000010', '71228000-0000-4000-8000-000000000002', 'dm'),
  ('71228000-0000-4000-8000-000000000010', '71228000-0000-4000-8000-000000000003', 'player');

set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"71228000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);
insert into public.campaign_api_keys (campaign_id, user_id, openai_api_key)
values ('71228000-0000-4000-8000-000000000010', '71228000-0000-4000-8000-000000000001', 'enc:v1:owner:key');

-- ── Reads ──────────────────────────────────────────────────────────────────

select is(
  (select openai_api_key from public.campaign_api_keys where campaign_id = '71228000-0000-4000-8000-000000000010'),
  'enc:v1:owner:key',
  'the owner reads their own key (positive control for the refusals below)');

select set_config('request.jwt.claims',
  '{"sub":"71228000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"provider":"email"}}', true);
select is_empty(
  $$ select 1 from public.campaign_api_keys where campaign_id = '71228000-0000-4000-8000-000000000010' $$,
  'a player of the campaign reads nothing of its keys');

select set_config('request.jwt.claims',
  '{"sub":"71228000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"email"}}', true);
select is_empty(
  $$ select 1 from public.campaign_api_keys where campaign_id = '71228000-0000-4000-8000-000000000010' $$,
  'a co-DM reads nothing of the owner''s keys either: they are the owner''s credentials, not the campaign''s');

-- ── Writes ─────────────────────────────────────────────────────────────────

-- RLS hides the row from an update rather than refusing it, so the proof is
-- that the key is still there afterwards.
update public.campaign_api_keys set openai_api_key = null
 where campaign_id = '71228000-0000-4000-8000-000000000010';
select set_config('request.jwt.claims',
  '{"sub":"71228000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);
select is(
  (select openai_api_key from public.campaign_api_keys where campaign_id = '71228000-0000-4000-8000-000000000010'),
  'enc:v1:owner:key',
  'a co-DM cannot clear the owner''s keys');

select set_config('request.jwt.claims',
  '{"sub":"71228000-0000-4000-8000-000000000004","role":"authenticated","app_metadata":{"provider":"email"}}', true);
insert into public.campaigns (id, user_id, name)
values ('71228000-0000-4000-8000-000000000020', '71228000-0000-4000-8000-000000000004', 'Outsider campaign');

select throws_ok(
  $$ insert into public.campaign_api_keys (campaign_id, user_id)
     values ('71228000-0000-4000-8000-000000000010', '71228000-0000-4000-8000-000000000004') $$,
  '42501',
  null,
  'nobody files a keys row, even an empty one, against a campaign they do not own');

select lives_ok(
  $$ insert into public.campaign_api_keys (campaign_id, user_id)
     values ('71228000-0000-4000-8000-000000000020', '71228000-0000-4000-8000-000000000004') $$,
  'an owner may hold a keys row for their own campaign (positive control for the refusal above)');

-- ── An owner change takes the keys away ────────────────────────────────────

reset role;
-- As the system (no caller), the way transfer_campaign_ownership changes the owner.
select set_config('request.jwt.claims', '', true);
update public.campaigns
   set user_id = '71228000-0000-4000-8000-000000000002'
 where id = '71228000-0000-4000-8000-000000000010';

select is_empty(
  $$ select 1 from public.campaign_api_keys where campaign_id = '71228000-0000-4000-8000-000000000010' $$,
  'a new owner never inherits the outgoing owner''s keys');

select isnt_empty(
  $$ select 1 from public.campaign_api_keys where campaign_id = '71228000-0000-4000-8000-000000000020' $$,
  'an owner change on one campaign leaves another campaign''s keys alone');

select * from finish();
rollback;
