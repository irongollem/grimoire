begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

-- Scriptorium documents can belong to a campaign (#915, migration
-- 20260926184828). Scope works like items and notes: nullable, set null when
-- the campaign goes, only a campaign the author DMs, moved with the campaign on
-- transfer, and a demo copy's document is free.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('91500000-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'scribe@example.invalid',   '', '{}'::jsonb, '{}'::jsonb),
  ('91500000-0000-4000-8000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('91500000-0000-4000-8000-000000000110', '91500000-0000-4000-8000-000000000101', 'The scribe''s campaign'),
  ('91500000-0000-4000-8000-000000000111', '91500000-0000-4000-8000-000000000102', 'Someone else''s campaign'),
  ('91500000-0000-4000-8000-000000000112', '91500000-0000-4000-8000-000000000101', 'A campaign about to go');

-- The stranger joins the scribe's campaign as DM so it can be handed over.
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('91500000-0000-4000-8000-000000000110', '91500000-0000-4000-8000-000000000102', 'dm', 'Incoming')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- A free plan holds three documents and this fixture writes four, so the
-- insert-time quota trigger is set aside (the flag the transfer and the demo
-- copy use). The quota assertions below read check_quota directly.
select set_config('grimoire.bypass_quota', 'on', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91500000-0000-4000-8000-000000000101","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.scriptorium_documents (id, user_id, campaign_id, title, doc_type) values
       ('91500000-0000-4000-8000-000000000120', '91500000-0000-4000-8000-000000000101', '91500000-0000-4000-8000-000000000110', 'Campaign booklet', 'adventure'),
       ('91500000-0000-4000-8000-000000000121', '91500000-0000-4000-8000-000000000101', null, 'Account-wide notes', 'custom'),
       ('91500000-0000-4000-8000-000000000122', '91500000-0000-4000-8000-000000000101', '91500000-0000-4000-8000-000000000112', 'Doomed campaign''s handout', 'custom') $$,
  'a DM scopes a document to their own campaign, or leaves it account-wide');

select throws_ok(
  $$ insert into public.scriptorium_documents (user_id, campaign_id, title, doc_type)
     values ('91500000-0000-4000-8000-000000000101', '91500000-0000-4000-8000-000000000111', 'Squatter', 'custom') $$,
  '42501', null,
  'a document cannot be scoped to a campaign its author does not DM');

select lives_ok(
  $$ insert into public.scriptorium_documents (id, user_id, title, doc_type, demo_source)
     values ('91500000-0000-4000-8000-000000000123', '91500000-0000-4000-8000-000000000101', 'Sneaky', 'custom', 'v1') $$,
  'a client insert naming demo_source succeeds');

reset role;

select is(
  (select demo_source from public.scriptorium_documents where id = '91500000-0000-4000-8000-000000000123'),
  null,
  'but the guard drops the demo_source it tried to set, so it cannot buy itself a free document');

-- A demo copy's document is free: the quota counts only rows without demo_source.
update public.scriptorium_documents set demo_source = 'v1' where id = '91500000-0000-4000-8000-000000000121';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91500000-0000-4000-8000-000000000101","role":"authenticated"}', true);

select is(
  (public.check_quota('scriptorium_documents') ->> 'current')::integer,
  3,
  'check_quota counts the three ordinary documents and skips the demo one');

select is(
  (public.check_all_quotas() -> 'scriptorium_documents' ->> 'current')::integer,
  3,
  'check_all_quotas agrees');

-- Deleting a campaign keeps its documents, account-wide.
delete from public.campaigns where id = '91500000-0000-4000-8000-000000000112';

select is(
  (select campaign_id from public.scriptorium_documents where id = '91500000-0000-4000-8000-000000000122'),
  null::uuid,
  'deleting a campaign leaves its document account-wide rather than deleting it');

-- Handing the campaign over moves its document; the account-wide one stays put.
select public.transfer_campaign_ownership(
  '91500000-0000-4000-8000-000000000110',
  '91500000-0000-4000-8000-000000000102',
  false, 'promote', null);

reset role;

select is(
  (select user_id from public.scriptorium_documents where id = '91500000-0000-4000-8000-000000000120'),
  '91500000-0000-4000-8000-000000000102'::uuid,
  'a transfer moves the campaign''s own document to the new owner');

select is(
  (select user_id from public.scriptorium_documents where id = '91500000-0000-4000-8000-000000000121'),
  '91500000-0000-4000-8000-000000000101'::uuid,
  'and leaves an account-wide document with its author');

select * from finish();
rollback;
