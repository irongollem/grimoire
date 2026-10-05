-- Epic #973 item 11: backgrounds join the shared library (migration
-- 20261005*_library_backgrounds). Held here, each refusal beside a control:
--
--   the table      anyone reads, only an app admin writes (insert, update, delete),
--                  and the edition is 2014 or 2024
--   the reference  party_members.background_id holds a custom uuid OR a library
--                  slug; deleting the custom row clears it, as the FK used to
--   the predicate  a table takes a library background of an enabled book and
--                  flags one of a book it has not enabled; a slug the library
--                  does not hold is nothing a client could have created
--   the plumbing   repointing a character moves a text reference

begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('97300000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'libbg-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;

insert into public.campaigns (id, user_id, name, ruleset)
values ('97300000-0000-4000-8000-0000000000c1', '97300000-0000-4000-8000-000000000001', 'Library backgrounds table', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('97300000-0000-4000-8000-0000000000c1', '97300000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset)
values ('97300000-0000-4000-8000-0000000000e1', '97300000-0000-4000-8000-000000000002',
        '97300000-0000-4000-8000-000000000002', null, 'Libbg ranger', '2014');

-- One book the table has (every campaign starts with both SRDs) and one it has not.
insert into public.library_backgrounds (id, name, ruleset, source, source_title, source_document_key, source_record_key, asi_ability_trio) values
  ('libbg_srd_acolyte', 'Libbg Acolyte', '2014', 'srd-2014', 'System Reference Document 5.1', 'srd-2014', 'libbg_srd_acolyte', null),
  ('libbg_toh_diplomat', 'Libbg Diplomat', '2014', 'libbg-toh', 'Test Tome', 'libbg-toh', 'libbg_toh_diplomat', null);

insert into public.backgrounds (id, user_id, name, ruleset)
values ('97300000-0000-4000-8000-0000000000b1', '97300000-0000-4000-8000-000000000002', 'Libbg Homebrew', '2014');

-- ── The table: everyone reads ────────────────────────────────────────────────

set local role anon;
select isnt_empty($$ select id from public.library_backgrounds where id = 'libbg_srd_acolyte' $$,
  'a signed-out reader sees library backgrounds');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"97300000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"email"}}', true);
select isnt_empty($$ select id from public.library_backgrounds where id = 'libbg_srd_acolyte' $$,
  'a signed-in reader sees library backgrounds');

-- ── The table: only an admin writes ──────────────────────────────────────────

select throws_ok($$
  insert into public.library_backgrounds (id, name, ruleset, source_document_key, source_record_key)
  values ('libbg_forged', 'Forged', '2014', 'libbg-forged', 'libbg_forged')
$$, '42501', null, 'a non-admin cannot add a library background');
select is_empty($$ update public.library_backgrounds set name = 'Defaced' where id = 'libbg_srd_acolyte' returning id $$,
  'a non-admin cannot rewrite a library background');
select is_empty($$ delete from public.library_backgrounds where id = 'libbg_srd_acolyte' returning id $$,
  'a non-admin cannot delete a library background');

select set_config('request.jwt.claims',
  '{"sub":"97300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);
select lives_ok($$
  insert into public.library_backgrounds (id, name, ruleset, source_document_key, source_record_key)
  values ('libbg_admin_made', 'Admin made', '2024', 'libbg-admin', 'libbg_admin_made')
$$, 'an admin can add a library background');
select isnt_empty($$ update public.library_backgrounds set name = 'Admin renamed' where id = 'libbg_admin_made' returning id $$,
  'an admin can rewrite a library background');
select isnt_empty($$ delete from public.library_backgrounds where id = 'libbg_admin_made' returning id $$,
  'an admin can delete a library background');

reset role;

select throws_ok($$
  insert into public.library_backgrounds (id, name, ruleset, source_document_key, source_record_key)
  values ('libbg_bad_edition', 'Bad', '2030', 'libbg-bad', 'libbg_bad_edition')
$$, '23514', null, 'an edition other than 2014 or 2024 is refused');
select throws_ok($$
  insert into public.library_backgrounds (id, name, ruleset, source_document_key, source_record_key)
  values ('libbg_twin', 'Twin', '2014', 'srd-2014', 'libbg_srd_acolyte')
$$, '23505', null, 'one book entry cannot be in the library twice');
select throws_ok($$
  insert into public.library_backgrounds (id, name, ruleset, source_document_key, source_record_key, asi_ability_trio)
  values ('libbg_bad_trio', 'Bad trio', '2024', 'libbg-bad', 'libbg_bad_trio', array['strength', 'dexterity'])
$$, '23514', null, 'an ability trio must be three abilities');

-- ── The reference ────────────────────────────────────────────────────────────

select lives_ok($$ update public.party_members set background_id = 'libbg_srd_acolyte'
  where id = '97300000-0000-4000-8000-0000000000e1' $$,
  'a character can point at a library background');
select lives_ok($$ update public.party_members set background_id = '97300000-0000-4000-8000-0000000000b1'
  where id = '97300000-0000-4000-8000-0000000000e1' $$,
  'a character can point at a custom background');

delete from public.backgrounds where id = '97300000-0000-4000-8000-0000000000b1';
select is((select background_id from public.party_members where id = '97300000-0000-4000-8000-0000000000e1'), null,
  'deleting the custom background clears the character''s reference');

update public.party_members set background_id = 'libbg_srd_acolyte' where id = '97300000-0000-4000-8000-0000000000e1';
select is((select background_id from public.party_members where id = '97300000-0000-4000-8000-0000000000e1'), 'libbg_srd_acolyte',
  'a library reference is not touched by a custom background going');

-- ── The predicate ────────────────────────────────────────────────────────────

select is((select approved from private.assess_content('background', 'libbg_srd_acolyte',
  '97300000-0000-4000-8000-0000000000c1', '97300000-0000-4000-8000-000000000002')), true,
  'a library background of an enabled book is approved');
select is((select reason from private.assess_content('background', 'libbg_toh_diplomat',
  '97300000-0000-4000-8000-0000000000c1', '97300000-0000-4000-8000-000000000002')), 'source',
  'a library background of a book the table has not enabled is flagged for its source');
select is((select approved from private.assess_content('background', 'libbg_no_such_slug',
  '97300000-0000-4000-8000-0000000000c1', '97300000-0000-4000-8000-000000000002')), true,
  'a slug the library does not hold is left alone');

-- ── The plumbing ─────────────────────────────────────────────────────────────

select lives_ok($$ select private.repoint_party_member_content(
  '97300000-0000-4000-8000-0000000000e1', 'background', 'libbg_srd_acolyte', 'libbg_toh_diplomat') $$,
  'repointing a character between library backgrounds works on text ids');

select * from finish();
rollback;
