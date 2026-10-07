-- #932 story 6: a wiki export is an `archive` import, read by the DM's own
-- browser without AI (20261007092156). It carries no source object, no source
-- text and never an AI provenance, and the 50-page extraction ceiling does not
-- bind it, while every AI kind keeps that ceiling.

begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93730000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'archive-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;

insert into public.campaigns (id, user_id, name) values
  ('93730000-0000-4000-8000-0000000000c1', '93730000-0000-4000-8000-000000000001', 'Table one');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('93730000-0000-4000-8000-0000000000c1', '93730000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('93730000-0000-4000-8000-0000000000e1', '93730000-0000-4000-8000-000000000002', '93730000-0000-4000-8000-000000000002', '93730000-0000-4000-8000-0000000000c1', 'Ada''s ranger', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('93730000-0000-4000-8000-0000000000c1', '93730000-0000-4000-8000-000000000002', 'player', 'Ada', '93730000-0000-4000-8000-0000000000e1');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"93730000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

set local role authenticated;
select pg_temp.as_user(1);

select lives_ok(
  $$ insert into public.document_imports (user_id, campaign_id, source_kind, source_paths, display_name, page_count, status, extracted, rights_attested_at)
     values ('93730000-0000-4000-8000-000000000001', '93730000-0000-4000-8000-0000000000c1', 'archive', '{}',
             'Wiki export', 400, 'review', '{"npcs":[]}', now()) $$,
  'the DM can stage an archive of 400 pages straight into review');

select throws_ok(
  $$ insert into public.document_imports (user_id, campaign_id, source_kind, source_paths, display_name, page_count, status, rights_attested_at, ai_provenance)
     values ('93730000-0000-4000-8000-000000000001', '93730000-0000-4000-8000-0000000000c1', 'archive', '{}',
             'Wiki export', 3, 'review', now(), '{"model":"x"}') $$,
  '23514', null,
  'an archive import can never claim AI provenance');

select throws_ok(
  $$ insert into public.document_imports (user_id, campaign_id, source_kind, source_paths, source_text, display_name, page_count, rights_attested_at)
     values ('93730000-0000-4000-8000-000000000001', '93730000-0000-4000-8000-0000000000c1', 'archive', '{}',
             'smuggled text', 'Wiki export', 3, now()) $$,
  '23514', null,
  'an archive carries no source text for extraction to pick up');

select throws_ok(
  $$ insert into public.document_imports (user_id, campaign_id, source_kind, source_paths, display_name, page_count, rights_attested_at)
     values ('93730000-0000-4000-8000-000000000001', '93730000-0000-4000-8000-0000000000c1', 'archive',
             array['93730000-0000-4000-8000-000000000001/x.pdf'], 'Wiki export', 1, now()) $$,
  '23514', null,
  'an archive carries no uploaded object either');

select throws_ok(
  $$ insert into public.document_imports (user_id, campaign_id, source_kind, source_paths, display_name, page_count, rights_attested_at)
     values ('93730000-0000-4000-8000-000000000001', '93730000-0000-4000-8000-0000000000c1', 'archive', '{}',
             'Wiki export', 2001, now()) $$,
  '23514', null,
  'an archive has its own sanity bound');

select throws_ok(
  $$ insert into public.document_imports (user_id, campaign_id, source_kind, source_paths, source_text, display_name, page_count, rights_attested_at)
     values ('93730000-0000-4000-8000-000000000001', '93730000-0000-4000-8000-0000000000c1', 'text', '{}',
             'Pasted', 'Pasted', 51, now()) $$,
  '23514', null,
  'the 50-page ceiling still binds every kind that goes to extraction');

select lives_ok(
  $$ insert into public.document_imports (user_id, campaign_id, source_kind, source_paths, source_text, display_name, page_count, rights_attested_at)
     values ('93730000-0000-4000-8000-000000000001', '93730000-0000-4000-8000-0000000000c1', 'text', '{}',
             'Pasted', 'Pasted', 50, now()) $$,
  'and a text import at the ceiling still goes in (positive control)');

select pg_temp.as_user(2);
select throws_ok(
  $$ insert into public.document_imports (user_id, campaign_id, source_kind, source_paths, display_name, page_count, rights_attested_at)
     values ('93730000-0000-4000-8000-000000000002', '93730000-0000-4000-8000-0000000000c1', 'archive', '{}',
             'Wiki export', 3, now()) $$,
  '42501', null,
  'a player cannot stage an archive into the DM''s campaign');

select * from finish();
rollback;
