-- Epic #943 wave 4: a character brings to a table only what the table approves.
--
-- What is held here, each refusal beside a control:
--
--   the predicate    what a table takes as it is, and the five reasons it does not
--   the bench        a flagged character joins but cannot be made anyone's active
--                    character (CR001), for the DM as well
--   approval         only the table's DM; for this character or for the table;
--                    the player's own content is copied into the table, deeply,
--                    and the original is untouched
--   ownership, not   who owns a row decides everything; what a row says it is
--   claims           decides nothing. A row labelled as a book entry is still the
--                    player's own. A third person's row is never named, shown or
--                    copied, at any depth. A reference to nothing is not approved.
--   stay, flagged    a table that changes its mind flags a seated character and
--                    moves nothing
--
-- The attacks in the second half are the ones a security audit of the first
-- version of this migration reproduced (2 Oct 2026). Each is here as the
-- refusal it must now meet.
--
--   1 Dana  DM of c1 (2014)                 3 Sam  DM of c2, author of private homebrew
--   2 Pia   plays at c1                     4 Oz   plays at c1

begin;

create extension if not exists pgtap with schema extensions;
select plan(133);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('94400000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'content-approval-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name, ruleset) values
  ('94400000-0000-4000-8000-0000000000c1', '94400000-0000-4000-8000-000000000001', 'Dana''s table', '2014'),
  ('94400000-0000-4000-8000-0000000000c2', '94400000-0000-4000-8000-000000000003', 'Sam''s table', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('94400000-0000-4000-8000-0000000000c1', '94400000-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('94400000-0000-4000-8000-0000000000c2', '94400000-0000-4000-8000-000000000003', 'dm', 'Sam'),
  ('94400000-0000-4000-8000-0000000000c1', '94400000-0000-4000-8000-000000000002', 'player', 'Pia'),
  ('94400000-0000-4000-8000-0000000000c1', '94400000-0000-4000-8000-000000000004', 'player', 'Oz')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- Shared library content: one book the table has (every campaign starts with
-- both SRDs enabled) and one it has not.
insert into public.library_species (id, name, ruleset, source, source_title, source_document_key, source_record_key) values
  ('test_srd_elf', 'Test Elf', '2014', 'srd-2014', 'System Reference Document 5.1', 'srd-2014', 'test_srd_elf'),
  ('test_toh_alseid', 'Test Alseid', '2014', 'test-toh', 'Test Tome', 'test-toh', 'test_toh_alseid');
insert into public.library_spells (id, name, level, school, casting_time, range, duration, conceptual_key, ruleset, source, source_title, source_document_key, source_record_key) values
  ('test_toh_spell', 'Test Tome Spell', 1, 'evocation', 'Action', '60 ft.', 'Instantaneous', 'test-tome-spell', '2014', 'test-toh', 'Test Tome', 'test-toh', 'test_toh_spell');

-- Backgrounds. b9 is the table's own Acolyte, made by its DM. b1 is Pia's honest
-- copy of the same entry; b2 is Oz's row under the same keys with something
-- else written in it (one account cannot hold two rows with the same keys); b3 is Pia's copy of an entry the table does not have; b4
-- is Oz's copy of that same entry; b5 is Sam's private homebrew.
insert into public.backgrounds (id, user_id, name, description, ruleset, open5e_import, source_document_key, source_record_key) values
  ('94400000-0000-4000-8000-0000000000b9', '94400000-0000-4000-8000-000000000001', 'Acolyte', 'The table''s own', '2014', true, 'srd-2014', 'srd_acolyte'),
  ('94400000-0000-4000-8000-0000000000b1', '94400000-0000-4000-8000-000000000002', 'Acolyte', 'Pia''s honest copy', '2014', true, 'srd-2014', 'srd_acolyte'),
  ('94400000-0000-4000-8000-0000000000b2', '94400000-0000-4000-8000-000000000004', 'Acolyte', 'FORGED: grants 20 in everything', '2014', true, 'srd-2014', 'srd_acolyte'),
  ('94400000-0000-4000-8000-0000000000b3', '94400000-0000-4000-8000-000000000002', 'Sage', 'Pia''s Sage', '2014', true, 'srd-2014', 'srd_sage'),
  ('94400000-0000-4000-8000-0000000000b4', '94400000-0000-4000-8000-000000000004', 'Sage', 'Oz''s Sage', '2014', true, 'srd-2014', 'srd_sage'),
  ('94400000-0000-4000-8000-0000000000b5', '94400000-0000-4000-8000-000000000003', 'SAM SECRET BACKGROUND', 'Sam''s private notes', '2014', false, null, null);
insert into public.spells (id, user_id, name) values
  ('94400000-0000-4000-8000-000000000051', '94400000-0000-4000-8000-000000000002', 'Pia''s Spark'),
  ('94400000-0000-4000-8000-000000000053', '94400000-0000-4000-8000-000000000003', 'SAM SECRET SPELL');
insert into public.species (id, user_id, name, granted_spells) values
  ('94400000-0000-4000-8000-000000000061', '94400000-0000-4000-8000-000000000002', 'Pia''s Mothfolk',
   '[{"spell_id": "94400000-0000-4000-8000-000000000051", "spell_name": "Pia''s Spark", "min_level": 1, "source_label": "Mothfolk", "subrace": null},
     {"spell_id": "94400000-0000-4000-8000-000000000053", "spell_name": "Borrowed", "min_level": 1, "source_label": "Mothfolk", "subrace": null}]'::jsonb);
insert into public.class_features (id, user_id, name) values
  ('94400000-0000-4000-8000-000000000071', '94400000-0000-4000-8000-000000000002', 'Pia''s Knack');
insert into public.custom_classes (id, user_id, class_name, features) values
  ('94400000-0000-4000-8000-000000000081', '94400000-0000-4000-8000-000000000002', 'Hexer',
   '{"1": ["94400000-0000-4000-8000-000000000071"]}'::jsonb);

-- e1 library content from a book the table lacks, and an honest copy of an
--    entry the table has          e2 Pia's own homebrew, three kinds deep
-- e3 a spell Sam wrote            e4 Oz's, nothing unapproved
-- e6 a species that is not there  e7 the forged Acolyte
-- e8 Pia's Sage                   e9 Oz's Sage
-- ea Sam's private background
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, class, level, ruleset, species_id, background_id, class_choices, level_choices) values
  ('94400000-0000-4000-8000-0000000000e1', '94400000-0000-4000-8000-000000000002', '94400000-0000-4000-8000-000000000002',
   null, 'p1 tome', 'Wizard', 1, '2014', 'test_toh_alseid', '94400000-0000-4000-8000-0000000000b1', '{}'::jsonb, '{}'::jsonb),
  ('94400000-0000-4000-8000-0000000000e2', '94400000-0000-4000-8000-000000000002', '94400000-0000-4000-8000-000000000002',
   null, 'p2 homebrew', 'Hexer', 4, '2014', '94400000-0000-4000-8000-000000000061', null,
   '{"feats": ["94400000-0000-4000-8000-000000000071"]}'::jsonb,
   '{"4": {"asi": {"feat_id": "94400000-0000-4000-8000-000000000071"}}}'::jsonb),
  ('94400000-0000-4000-8000-0000000000e3', '94400000-0000-4000-8000-000000000002', '94400000-0000-4000-8000-000000000002',
   null, 'p3 foreign spell', 'Wizard', 1, '2014', 'test_srd_elf', null, '{}'::jsonb, '{}'::jsonb),
  ('94400000-0000-4000-8000-0000000000e4', '94400000-0000-4000-8000-000000000004', '94400000-0000-4000-8000-000000000004',
   null, 'p4 clean', 'Wizard', 1, '2014', 'test_srd_elf', null, '{}'::jsonb, '{}'::jsonb),
  ('94400000-0000-4000-8000-0000000000e6', '94400000-0000-4000-8000-000000000002', '94400000-0000-4000-8000-000000000002',
   null, 'p6 ghost', 'Wizard', 1, '2014', '94400000-0000-4000-8000-0000000000aa', null, '{}'::jsonb, '{}'::jsonb),
  ('94400000-0000-4000-8000-0000000000e7', '94400000-0000-4000-8000-000000000004', '94400000-0000-4000-8000-000000000004',
   null, 'p7 forged', 'Wizard', 1, '2014', 'test_srd_elf', '94400000-0000-4000-8000-0000000000b2', '{}'::jsonb, '{}'::jsonb),
  ('94400000-0000-4000-8000-0000000000e8', '94400000-0000-4000-8000-000000000002', '94400000-0000-4000-8000-000000000002',
   null, 'p8 sage', 'Wizard', 1, '2014', 'test_srd_elf', '94400000-0000-4000-8000-0000000000b3', '{}'::jsonb, '{}'::jsonb),
  ('94400000-0000-4000-8000-0000000000e9', '94400000-0000-4000-8000-000000000004', '94400000-0000-4000-8000-000000000004',
   null, 'p9 sage', 'Wizard', 1, '2014', 'test_srd_elf', '94400000-0000-4000-8000-0000000000b4', '{}'::jsonb, '{}'::jsonb),
  ('94400000-0000-4000-8000-0000000000ea', '94400000-0000-4000-8000-000000000002', '94400000-0000-4000-8000-000000000002',
   null, 'pa foreign background', 'Wizard', 1, '2014', 'test_srd_elf', '94400000-0000-4000-8000-0000000000b5', '{}'::jsonb, '{}'::jsonb);

insert into public.character_classes (party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
select m.id, 'Wizard', 1, true, (select id from public.system_classes where ruleset = '2014' and class_name = 'Wizard'), 'system'
  from public.party_members m
 where m.name like 'p%' and m.id <> '94400000-0000-4000-8000-0000000000e2' and m.id::text like '94400000-%';
insert into public.character_classes (party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
values ('94400000-0000-4000-8000-0000000000e2', 'Hexer', 4, true, '94400000-0000-4000-8000-000000000081', 'custom');

insert into public.character_spells (party_member_id, spell_id, source_type, is_known, is_prepared, source_label) values
  ('94400000-0000-4000-8000-0000000000e1', 'test_toh_spell', 'feat', true, true, 'Fixture feat'),
  ('94400000-0000-4000-8000-0000000000e3', '94400000-0000-4000-8000-000000000053', 'feat', true, true, 'Fixture feat');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"94400000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

-- Definers, so a check reads the row whoever is signed in.
create function pg_temp.pm(p_suffix text) returns public.party_members language sql security definer as $$
  select * from public.party_members where id = ('94400000-0000-4000-8000-0000000000' || p_suffix)::uuid;
$$;
create function pg_temp.flags(p_suffix text) returns text language sql security definer as $$
  select coalesce(string_agg(r.kind || ':' || r.reason || ':' || r.status, ', ' order by r.kind, r.label), 'none')
    from public.character_content_reviews r
   where r.party_member_id = ('94400000-0000-4000-8000-0000000000' || p_suffix)::uuid;
$$;
create function pg_temp.flag_id(p_suffix text, p_kind text) returns uuid language sql security definer as $$
  select r.id from public.character_content_reviews r
   where r.party_member_id = ('94400000-0000-4000-8000-0000000000' || p_suffix)::uuid and r.kind = p_kind
   order by r.label limit 1;
$$;
create function pg_temp.flag_label(p_suffix text, p_kind text) returns text language sql security definer as $$
  select r.label from public.character_content_reviews r
   where r.party_member_id = ('94400000-0000-4000-8000-0000000000' || p_suffix)::uuid and r.kind = p_kind
   order by r.label limit 1;
$$;
create function pg_temp.seat(p_user int) returns uuid language sql security definer as $$
  select m.party_member_id from public.campaign_members m
   where m.campaign_id = '94400000-0000-4000-8000-0000000000c1'
     and m.user_id = ('94400000-0000-4000-8000-00000000000' || p_user)::uuid;
$$;
create function pg_temp.background_of(p_suffix text) returns public.backgrounds language sql security definer as $$
  select b.* from public.backgrounds b where b.id = (pg_temp.pm(p_suffix)).background_id;
$$;
-- How many rows of each kind the table's DM owns: adoption must never grow this
-- without the DM's own approval.
create function pg_temp.dana_owns() returns text language sql security definer as $$
  select format('backgrounds %s, species %s, spells %s, classes %s, features %s',
    (select count(*) from public.backgrounds where user_id = '94400000-0000-4000-8000-000000000001'),
    (select count(*) from public.species where user_id = '94400000-0000-4000-8000-000000000001'),
    (select count(*) from public.spells where user_id = '94400000-0000-4000-8000-000000000001'),
    (select count(*) from public.custom_classes where user_id = '94400000-0000-4000-8000-000000000001'),
    (select count(*) from public.class_features where user_id = '94400000-0000-4000-8000-000000000001'));
$$;
create function pg_temp.attach(p_suffix text, p_active boolean default true) returns void language sql as $$
  select public.attach_party_member_to_campaign(
    ('94400000-0000-4000-8000-0000000000' || p_suffix)::uuid, '94400000-0000-4000-8000-0000000000c1', p_active);
$$;

-- ── Nothing waits on a character with no table ───────────────────────────────

select is(pg_temp.flags('e1'), 'none', 'a character with no table has no flags, whatever it is built from');

-- ── A player's own books ─────────────────────────────────────────────────────

set local role authenticated;
select pg_temp.as_user(2);
select lives_ok($$
  insert into public.user_enabled_sources (user_id, source_slug, source_title)
  values ('94400000-0000-4000-8000-000000000002', 'test-toh', 'Test Tome')
$$, 'a player enables a book for themselves');
select throws_ok($$
  insert into public.user_enabled_sources (user_id, source_slug)
  values ('94400000-0000-4000-8000-000000000004', 'test-toh')
$$, '42501', 'new row violates row-level security policy for table "user_enabled_sources"',
  'a player cannot enable a book for somebody else');
select pg_temp.as_user(4);
select is((select count(*)::int from public.user_enabled_sources), 0, 'and nobody else can see which books a player reads');

-- ── The control: an approved character joins and takes its seat ──────────────

select lives_ok($$ select pg_temp.attach('e4') $$, 'a character built only from what the table has joins');
select is(pg_temp.flags('e4'), 'none', 'with nothing waiting');
select is(pg_temp.seat(4), '94400000-0000-4000-8000-0000000000e4'::uuid, 'and takes its player''s seat');

-- ── The bench ────────────────────────────────────────────────────────────────

select pg_temp.as_user(2);
select lives_ok($$ select pg_temp.attach('e1') $$, 'a character with unapproved choices still joins');
select is((pg_temp.pm('e1')).campaign_id, '94400000-0000-4000-8000-0000000000c1'::uuid, 'it is at the table');
select is(pg_temp.flags('e1'), 'species:source:pending, spell:source:pending',
  'flagged for the species and the spell from a book the table has not enabled');
select is(pg_temp.seat(2), null, 'and benched: the seat it would have taken stays empty');

-- The table has its own Acolyte, so the character is pointed at that one and
-- nobody is asked.
select is((pg_temp.pm('e1')).background_id, '94400000-0000-4000-8000-0000000000b9'::uuid,
  'a background the table has its own copy of is re-pointed at the table''s copy, with no flag');

select throws_ok($$
  update public.campaign_members set party_member_id = '94400000-0000-4000-8000-0000000000e1'
   where campaign_id = '94400000-0000-4000-8000-0000000000c1' and user_id = '94400000-0000-4000-8000-000000000002'
$$, 'CR001', 'This character is waiting for the DM''s approval',
  'the player cannot make a flagged character their active one');
select pg_temp.as_user(1);
select throws_ok($$
  update public.campaign_members set party_member_id = '94400000-0000-4000-8000-0000000000e1'
   where campaign_id = '94400000-0000-4000-8000-0000000000c1' and user_id = '94400000-0000-4000-8000-000000000002'
$$, 'CR001', 'This character is waiting for the DM''s approval',
  'and neither can the DM, whose way to seat it is to approve what is waiting');

-- ── Who may approve, and who may look ────────────────────────────────────────

select pg_temp.as_user(3);
select throws_ok(format($$ select public.approve_character_content(%L) $$, pg_temp.flag_id('e1', 'species')),
  '42501', 'Only the DM of the table can approve a character''s choices', 'a DM of another table cannot approve');
select throws_ok(format($$ select public.get_character_content_item(%L) $$, pg_temp.flag_id('e1', 'species')),
  '42501', 'Not authorized', 'or look at what is waiting');
select pg_temp.as_user(4);
select throws_ok(format($$ select public.approve_character_content(%L) $$, pg_temp.flag_id('e1', 'species')),
  '42501', 'Only the DM of the table can approve a character''s choices', 'another player at the table cannot approve');
select throws_ok(format($$ select public.get_character_content_item(%L) $$, pg_temp.flag_id('e1', 'species')),
  '42501', 'Not authorized', 'or look at another player''s flag');
select is_empty($$ select id from public.character_content_reviews
  where party_member_id = '94400000-0000-4000-8000-0000000000e1' $$,
  'or even see that another player''s character has one');
select pg_temp.as_user(2);
select throws_ok(format($$ select public.approve_character_content(%L) $$, pg_temp.flag_id('e1', 'species')),
  '42501', 'Only the DM of the table can approve a character''s choices', 'the character''s own player cannot approve it');
select is((select count(*)::int from public.character_content_reviews
  where party_member_id = '94400000-0000-4000-8000-0000000000e1'), 2, 'but does see their own flags');
select is(public.get_character_content_item(pg_temp.flag_id('e1', 'species')) ->> 'name', 'Test Alseid',
  'and may look at what they are about');
select is_empty($$ delete from public.character_content_reviews
  where party_member_id = '94400000-0000-4000-8000-0000000000e1' returning id $$,
  'and cannot clear them by hand');

-- ── Approving: for this character, then for the table ────────────────────────

select pg_temp.as_user(1);
select is(public.approve_character_content(pg_temp.flag_id('e1', 'species'), 'character'), 1,
  'the DM allows the species for this character; one flag is left');
select is(pg_temp.flags('e1'), 'species:source:approved, spell:source:pending', 'the species is allowed, the spell still waits');
select is(pg_temp.seat(2), null, 'so the character is still benched');

select is(public.approve_character_content(pg_temp.flag_id('e1', 'spell'), 'table'), 0,
  'the DM enables the book for the table; nothing is left');
select is((select count(*)::int from public.campaign_enabled_sources
  where campaign_id = '94400000-0000-4000-8000-0000000000c1' and source_slug = 'test-toh'), 1, 'the book is enabled');
select is(pg_temp.seat(2), '94400000-0000-4000-8000-0000000000e1'::uuid,
  'and the character takes the seat it was kept from');

-- ── The player's own content: approving copies it into the table, deeply ─────

select pg_temp.as_user(2);
select lives_ok($$ select pg_temp.attach('e2') $$, 'a character built from its player''s own homebrew joins');
select is(pg_temp.flags('e2'), 'class:homebrew:pending, feat:homebrew:pending, species:homebrew:pending',
  'flagged for the species, the class and the feat');
select is(pg_temp.dana_owns(), 'backgrounds 1, species 0, spells 0, classes 0, features 0',
  'and nothing has been copied into the DM''s content by the joining alone');

select pg_temp.as_user(1);
select is(public.get_character_content_item(pg_temp.flag_id('e2', 'species')) ->> 'name', 'Pia''s Mothfolk',
  'the DM can read a player''s own content through its flag, which RLS alone would not allow');
select ok(not (public.get_character_content_item(pg_temp.flag_id('e2', 'species')) ? 'user_id'),
  'without learning whose account it is from the row');
select throws_ok(format($$ select public.approve_character_content(%L, 'table') $$, pg_temp.flag_id('e2', 'species')),
  'P0001', 'Only a book or a blocked choice can be approved for the whole table',
  'a player''s own content cannot be approved for the whole table: there is no book to enable');

select is(public.approve_character_content(pg_temp.flag_id('e2', 'species')), 2, 'the DM approves the species');
reset role;
select ok((pg_temp.pm('e2')).species_id <> '94400000-0000-4000-8000-000000000061', 'the character points at a copy');
select is((select s.user_id::text || ' / ' || s.campaign_id::text from public.species s where s.id::text = (pg_temp.pm('e2')).species_id),
  '94400000-0000-4000-8000-000000000001 / 94400000-0000-4000-8000-0000000000c1',
  'which the table''s DM owns, in this campaign');
select is((select jsonb_array_length(s.granted_spells) from public.species s where s.id::text = (pg_temp.pm('e2')).species_id), 1,
  'the copy grants one spell: the grant that named another DM''s private spell did not come along');
select is((select sp.user_id::text || ' / ' || sp.name from public.species s, public.spells sp
   where s.id::text = (pg_temp.pm('e2')).species_id and sp.id::text = s.granted_spells -> 0 ->> 'spell_id'),
  '94400000-0000-4000-8000-000000000001 / Pia''s Spark',
  'and it is the player''s own spell, copied with the species as the table''s own');
select is((select count(*)::int from public.spells where name = 'SAM SECRET SPELL' and user_id <> '94400000-0000-4000-8000-000000000003'), 0,
  'nobody has a copy of the other DM''s spell');
select is((select s.user_id::text || ' / ' || jsonb_array_length(s.granted_spells)::text from public.species s where s.id = '94400000-0000-4000-8000-000000000061'),
  '94400000-0000-4000-8000-000000000002 / 2', 'the player''s original species is untouched');

-- A class is its features. The DM is shown them, and "changed since you looked"
-- covers them: here the class row is three days old and only the feature is new.
set local session_replication_role = replica;
update public.custom_classes set updated_at = now() - interval '3 days'
 where id = '94400000-0000-4000-8000-000000000081';
set local session_replication_role = origin;
select is(private.content_seen_at('class', '94400000-0000-4000-8000-000000000081', '94400000-0000-4000-8000-000000000002'),
  (select updated_at from public.class_features where id = '94400000-0000-4000-8000-000000000071'),
  'what the DM is shown is as new as the newest row an approval would copy');

set local role authenticated;
select pg_temp.as_user(1);
select is(public.get_character_content_item(pg_temp.flag_id('e2', 'class')) -> 'nested_features' -> 0 ->> 'name',
  'Pia''s Knack', 'the DM reading a player''s class is shown its features');
select is((public.get_character_content_item(pg_temp.flag_id('e2', 'class')) ->> 'seen_at')::timestamptz,
  (select now()), 'and is told when any of it last changed');
select throws_ok(format($$ select public.approve_character_content(%L, 'character', now() - interval '1 day') $$,
    pg_temp.flag_id('e2', 'class')),
  'CR002', 'This was changed after you looked at it; look again before approving',
  'a feature edited after the DM looked refuses the approval, though the class row itself is older');
select is(public.approve_character_content(pg_temp.flag_id('e2', 'class')), 1, 'the DM approves the class');
reset role;
select is((select f.user_id from public.custom_classes c
    join public.character_classes cc on cc.class_definition_id = c.id
    join public.class_features f on f.id::text = c.features -> '1' ->> 0
   where cc.party_member_id = '94400000-0000-4000-8000-0000000000e2' and c.user_id = '94400000-0000-4000-8000-000000000001'),
  '94400000-0000-4000-8000-000000000001'::uuid,
  'the character''s class row points at the table''s copy, whose feature came with it');

set local role authenticated;
select pg_temp.as_user(1);
select is(public.approve_character_content(pg_temp.flag_id('e2', 'feat')), 0, 'the DM approves the feat; nothing is left');
reset role;
select is((select count(*)::int from public.class_features where provenance ->> 'adopted_from' = '94400000-0000-4000-8000-000000000071'), 1,
  'the feature was copied once, though the class and the feat both pointed at it');
select is((select ((pg_temp.pm('e2')).class_choices -> 'feats' ->> 0) = ((pg_temp.pm('e2')).level_choices -> '4' -> 'asi' ->> 'feat_id')
      and ((pg_temp.pm('e2')).class_choices -> 'feats' ->> 0) <> '94400000-0000-4000-8000-000000000071'),
  true, 'and both places the character records the feat point at the copy');
select is(pg_temp.flags('e2'), 'none', 'the character has nothing waiting');

-- ── What a row says about itself decides nothing ─────────────────────────────

set local role authenticated;
select pg_temp.as_user(4);
select lives_ok($$ select pg_temp.attach('e7', false) $$, 'a character with a row forged under an SRD entry''s keys joins');
select is((pg_temp.background_of('e7')).description, 'The table''s own',
  'and gets the table''s own entry, not what the player wrote under its keys');
select is(pg_temp.flags('e7'), 'none', 'so there is nothing to approve and nothing forged in play');

select pg_temp.as_user(2);
select lives_ok($$ select pg_temp.attach('e8', false) $$, 'a character with the player''s copy of an entry the table lacks joins');
select is(pg_temp.flags('e8'), 'background:homebrew:pending',
  'it is the player''s own content, whatever book it names: the DM is asked');
reset role;
select is((select count(*)::int from public.backgrounds where user_id = '94400000-0000-4000-8000-000000000001'), 1,
  'nothing was copied into the DM''s content without the DM');

set local role authenticated;
select pg_temp.as_user(1);
select is(public.approve_character_content(pg_temp.flag_id('e8', 'background')), 0, 'the DM approves it');
select pg_temp.as_user(4);
select lives_ok($$ select pg_temp.attach('e9', false) $$, 'a second player arrives with their own copy of the same entry');
reset role;
select is((pg_temp.pm('e9')).background_id, '94400000-0000-4000-8000-0000000000b4'::uuid,
  'and is NOT silently pointed at the copy made from the first player''s row');
select is(pg_temp.flags('e9'), 'background:homebrew:pending', 'their own copy is the DM''s to approve as well');
select is((select count(*)::int from public.backgrounds
  where user_id = '94400000-0000-4000-8000-000000000001' and source_record_key = 'srd_sage'), 0,
  'the copy made from the first player''s row does not claim to be the book''s entry');

-- ── A third person's content is never named, shown or copied ─────────────────

set local role authenticated;
select pg_temp.as_user(2);
select lives_ok($$ select pg_temp.attach('ea', false) $$, 'a character pointed at another DM''s private background joins');
select is(pg_temp.flags('ea'), 'background:foreign:pending', 'flagged as made at another table');
select is(pg_temp.flag_label('ea', 'background'), 'Content from another table', 'the flag does not carry its name');
select is(public.get_character_content_item(pg_temp.flag_id('ea', 'background')), null,
  'the player who pointed at it cannot read it through the flag');
select pg_temp.as_user(1);
select is(public.get_character_content_item(pg_temp.flag_id('ea', 'background')), null, 'and neither can the DM');
select throws_ok(format($$ select public.approve_character_content(%L) $$, pg_temp.flag_id('ea', 'background')),
  'P0001', 'This was made at another table and cannot be approved here; it has to be changed',
  'it cannot be approved: that would copy another person''s work without them');
reset role;
select is((select count(*)::int from public.backgrounds where name = 'SAM SECRET BACKGROUND' and user_id <> '94400000-0000-4000-8000-000000000003'), 0,
  'and no copy of it exists anywhere');

set local role authenticated;
select pg_temp.as_user(2);
select lives_ok($$ select pg_temp.attach('e3', false) $$, 'a character carrying another DM''s spell joins');
select is(pg_temp.flags('e3') || ' / ' || pg_temp.flag_label('e3', 'spell'), 'spell:foreign:pending / Content from another table',
  'flagged the same way, by text reference as by foreign key');
reset role;
delete from public.character_spells
 where party_member_id = '94400000-0000-4000-8000-0000000000e3' and spell_id = '94400000-0000-4000-8000-000000000053';
select is(pg_temp.flags('e3'), 'none', 'changing the choice clears the flag');

-- ── A reference to nothing is not approved ───────────────────────────────────

set local role authenticated;
select pg_temp.as_user(2);
select lives_ok($$ select pg_temp.attach('e6', false) $$, 'a character whose species points at nothing joins');
select is(pg_temp.flags('e6'), 'species:missing:pending',
  'flagged, not waved through: otherwise it could be seated and the content created afterwards under that id');
select pg_temp.as_user(1);
select throws_ok(format($$ select public.approve_character_content(%L) $$, pg_temp.flag_id('e6', 'species')),
  'P0001', 'This no longer exists and cannot be approved; it has to be removed', 'the DM cannot approve nothing');

-- The player now creates content under that very id.
reset role;
insert into public.species (id, user_id, name) values
  ('94400000-0000-4000-8000-0000000000aa', '94400000-0000-4000-8000-000000000002', 'Appeared later');
select is(private.review_party_member_content('94400000-0000-4000-8000-0000000000e6'), 1, 'it is still waiting');
select is(pg_temp.flags('e6'), 'species:homebrew:pending', 'now as the player''s own content, for the DM to approve like any other');
delete from public.species where id = '94400000-0000-4000-8000-0000000000aa';

insert into public.character_spells (party_member_id, spell_id, source_type, is_known, is_prepared, source_label)
values ('94400000-0000-4000-8000-0000000000e6', '94400000-0000-4000-8000-0000000000ab', 'feat', true, true, 'Fixture feat');
select is(pg_temp.flag_label('e6', 'spell'), 'Something that no longer exists', 'a spell that is not there is flagged too');
set local role authenticated;
select pg_temp.as_user(4);
select throws_ok(format($$ select public.remove_missing_character_content(%L) $$, pg_temp.flag_id('e6', 'spell')),
  '42501', 'Not authorized', 'another player cannot remove it from someone''s character');
select pg_temp.as_user(2);
select throws_ok(format($$ select public.remove_missing_character_content(%L) $$, pg_temp.flag_id('e9', 'background')),
  '42501', 'Not authorized', 'and the removal is only for the caller''s own flags or table');
select lives_ok(format($$ select public.remove_missing_character_content(%L) $$, pg_temp.flag_id('e6', 'spell')),
  'its owner removes the reference to nothing');
reset role;
select is((select count(*)::int from public.character_spells
  where party_member_id = '94400000-0000-4000-8000-0000000000e6'), 0, 'the empty reference is gone from the character');

-- The second player's copy of the same entry can be approved as well: an
-- account holds one row per pair of book keys, and a copy keeps none.
set local role authenticated;
select pg_temp.as_user(1);
select throws_ok(format($$ select public.approve_character_content(%L, 'character', now() - interval '1 day') $$,
    pg_temp.flag_id('e9', 'background')),
  'CR002', 'This was changed after you looked at it; look again before approving',
  'an approval given after looking is refused when the row has changed since');
select is(public.approve_character_content(pg_temp.flag_id('e9', 'background')), 0,
  'the DM approves the second player''s copy of the same entry');
reset role;
select is((select jsonb_build_object('document', b.source_document_key, 'source', b.source, 'import', b.open5e_import,
                                     'was', b.provenance -> 'adopted_claims' ->> 'document')
    from public.backgrounds b where b.id = (pg_temp.pm('e9')).background_id),
  '{"document": null, "source": null, "import": false, "was": "srd-2014"}'::jsonb,
  'the copy does not repeat what the player''s row said about its book; that is kept only as a record');
select is((select b.user_id::text || ' / ' || b.description from public.backgrounds b where b.id = (pg_temp.pm('e9')).background_id),
  '94400000-0000-4000-8000-000000000001 / Oz''s Sage', 'and that character gets its own content, as the table''s copy');

-- A queue the DM has to read cannot be flooded by one request.
insert into public.character_spells (party_member_id, spell_id, source_type, is_known, is_prepared, source_label)
select '94400000-0000-4000-8000-0000000000e6', gen_random_uuid()::text, 'feat', true, true, 'Fixture feat'
  from generate_series(1, 130);
select cmp_ok((select count(*)::int from public.character_content_reviews
  where party_member_id = '94400000-0000-4000-8000-0000000000e6'), '<=', 100,
  'a character with a hundred and thirty unapproved choices raises at most a hundred flags');
delete from public.character_spells where party_member_id = '94400000-0000-4000-8000-0000000000e6';

-- ── What the second audit found ──────────────────────────────────────────────

-- The cap bounds what is newly raised, not what the character is held to. A
-- character padded with more than a hundred approvable choices and one the DM
-- would refuse must not be seated once the first hundred are approved.
insert into public.library_spells (id, name, level, school, casting_time, range, duration, conceptual_key, ruleset, source, source_title, source_document_key, source_record_key)
select 'test_pad_' || n, 'Pad ' || n, 1, 'evocation', 'Action', '60 ft.', 'Instantaneous', 'pad-' || n, '2014', 'test-pad', 'Padding Book', 'test-pad', 'test_pad_' || n
  from generate_series(1, 105) as n;
insert into public.spells (id, user_id, name) values
  ('94400000-0000-4000-8000-000000000055', '94400000-0000-4000-8000-000000000002', 'Pia''s Hidden Homebrew');
insert into public.character_spells (party_member_id, spell_id, source_type, is_known, is_prepared, source_label)
select '94400000-0000-4000-8000-0000000000e6'::uuid, 'test_pad_' || n, 'feat', true, true, 'Fixture feat' from generate_series(1, 105) as n
union all
select '94400000-0000-4000-8000-0000000000e6'::uuid, '94400000-0000-4000-8000-000000000055', 'feat', true, true, 'Fixture feat';
select is((select count(*)::int from public.character_content_reviews
  where party_member_id = '94400000-0000-4000-8000-0000000000e6' and status = 'pending' and kind = 'spell'), 100,
  'a hundred of a hundred and six unapproved spells are raised');

set local role authenticated;
select pg_temp.as_user(1);
do $$
declare v_id uuid;
begin
  -- The DM approves, for this character, every flag they are shown, twice
  -- over: everything visible, then everything that came up after.
  for i in 1..2 loop
    for v_id in
      select r.id from public.character_content_reviews r
       where r.party_member_id = '94400000-0000-4000-8000-0000000000e6'
         and r.status = 'pending' and r.reason = 'source'
    loop
      perform public.approve_character_content(v_id, 'character');
    end loop;
  end loop;
end $$;
reset role;
select is((select string_agg(r.label, ', ') from public.character_content_reviews r
  where r.party_member_id = '94400000-0000-4000-8000-0000000000e6' and r.status = 'pending' and r.kind = 'spell'),
  'Pia''s Hidden Homebrew',
  'approving everything shown brings the rest up: the homebrew behind the padding is still waiting');
select is((select count(*)::int from private.party_member_content_refs('94400000-0000-4000-8000-0000000000e6') refs
  where refs.kind = 'spell' and not exists (select 1 from public.character_content_reviews r
    where r.party_member_id = '94400000-0000-4000-8000-0000000000e6' and r.kind = refs.kind and r.ref = refs.ref)), 0,
  'and no unapproved choice is left without a flag');
delete from public.character_spells where party_member_id = '94400000-0000-4000-8000-0000000000e6';

-- A DM cannot make somebody else the "owner" of a character in order to read
-- or copy that person's content through it.
set local role authenticated;
select pg_temp.as_user(1);
select throws_ok($$
  insert into public.party_members (user_id, owner_user_id, campaign_id, name, level)
  values ('94400000-0000-4000-8000-000000000003', null, '94400000-0000-4000-8000-0000000000c1', 'In Sam''s name', 1)
$$, '42501', 'A character is created in its creator''s own name',
  'a DM cannot create a roster character with another account as its creator');
select lives_ok($$
  insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, background_id)
  values ('94400000-0000-4000-8000-0000000000eb', '94400000-0000-4000-8000-000000000001', null,
          '94400000-0000-4000-8000-0000000000c1', 'Roster probe', 1, '94400000-0000-4000-8000-0000000000b5')
$$, 'control: a DM adds a roster character in their own name');
select is(pg_temp.flags('eb') || ' / ' || pg_temp.flag_label('eb', 'background'),
  'background:foreign:pending / Content from another table',
  'and a character nobody owns has no content of its own: a stranger''s row on it is foreign');
select is(public.get_character_content_item(pg_temp.flag_id('eb', 'background')), null,
  'so the DM still cannot read it');
select throws_ok($$
  update public.party_members set user_id = '94400000-0000-4000-8000-000000000003'
   where id = '94400000-0000-4000-8000-0000000000eb'
$$, '42501', 'A character''s creator does not change', 'nor rewrite who made a character afterwards');
reset role;

-- A player bringing a character they made, which nobody owns yet, becomes its owner.
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, ruleset, species_id)
values ('94400000-0000-4000-8000-0000000000ec', '94400000-0000-4000-8000-000000000004', null, null, 'Oz unowned', 1, '2014', 'test_srd_elf');
set local role authenticated;
select pg_temp.as_user(4);
select lives_ok($$ select pg_temp.attach('ec', false) $$, 'a player attaches a character they made that nobody owns');
reset role;
select is((pg_temp.pm('ec')).owner_user_id, '94400000-0000-4000-8000-000000000004'::uuid, 'and owns it from then on');

-- A re-point that another rule refuses leaves the flag standing and aborts nothing.
insert into public.spells (id, user_id, name, ruleset, source_document_key, source_record_key) values
  ('94400000-0000-4000-8000-000000000057', '94400000-0000-4000-8000-000000000001', 'Keyed Spell', '2014', 'test-keys', 'keyed_spell'),
  ('94400000-0000-4000-8000-000000000058', '94400000-0000-4000-8000-000000000004', 'Keyed Spell', '2014', 'test-keys', 'keyed_spell');
insert into public.character_spells (party_member_id, spell_id, source_type, is_known, is_prepared, source_label) values
  ('94400000-0000-4000-8000-0000000000ec', '94400000-0000-4000-8000-000000000057', 'feat', true, true, 'Fixture feat');
select lives_ok($$
  insert into public.character_spells (party_member_id, spell_id, source_type, is_known, is_prepared, source_label)
  values ('94400000-0000-4000-8000-0000000000ec', '94400000-0000-4000-8000-000000000058', 'feat', true, true, 'Fixture feat')
$$, 'a choice whose re-point would collide with one the character already has is still accepted');
select is(pg_temp.flags('ec'), 'spell:homebrew:pending', 'and is flagged as the player''s own instead');
select lives_ok($$
  insert into public.campaign_enabled_sources (campaign_id, source_slug, source_title)
  values ('94400000-0000-4000-8000-0000000000c1', 'test-pad', 'Padding Book')
$$, 'and the DM can still change the table''s books with that character seated');
delete from public.character_spells where party_member_id = '94400000-0000-4000-8000-0000000000ec';

-- An id is the row it names, however it is spelled.
update public.party_members set species_id = replace('94400000-0000-4000-8000-000000000061', '-', '')
 where id = '94400000-0000-4000-8000-0000000000ec';
select is(pg_temp.flags('ec'), 'species:foreign:pending',
  'a species id written without hyphens is still the row it names (another player''s here), not waved through');
update public.party_members set species_id = 'test_srd_elf' where id = '94400000-0000-4000-8000-0000000000ec';

-- A blocked class is blocked in any case.
insert into public.character_classes (party_member_id, class_name, levels, is_primary)
values ('94400000-0000-4000-8000-0000000000ec', 'wizard', 1, true);
update public.campaigns set disabled_class_names = array['Wizard'] where id = '94400000-0000-4000-8000-0000000000c1';
select is(pg_temp.flags('ec'), 'class:blocked:pending', 'a blocked class typed in another case is still blocked');
set local role authenticated;
select pg_temp.as_user(1);
select is(public.approve_character_content(pg_temp.flag_id('ec', 'class'), 'table'), 0,
  'and lifting the block for the table clears it, though the character spells the class in another case');
reset role;
select is((select disabled_class_names from public.campaigns where id = '94400000-0000-4000-8000-0000000000c1'),
  '{}'::text[], 'the block is gone from the table');

-- ── A class or subclass that is only a name ──────────────────────────────────
-- A row with a name and no definition is an honest state (a character the DM
-- built with a typed class gets one when it first levels up), and the name is a
-- label. But the app resolves a name against whatever its viewer can read, so
-- on its owner's screen it becomes the owner's own class of that name. The
-- review reads it the same way. ec is Oz's; Moonblade and its Oz School are
-- Oz's own; Hexer is by now the table's (the copy Dana approved above).
insert into public.custom_classes (id, user_id, class_name, ruleset) values
  ('94400000-0000-4000-8000-000000000082', '94400000-0000-4000-8000-000000000004', 'Moonblade', '2014');
insert into public.custom_subclasses (id, user_id, campaign_id, class_name, subclass_name) values
  ('94400000-0000-4000-8000-000000000091', '94400000-0000-4000-8000-000000000001', '94400000-0000-4000-8000-0000000000c1', 'Hexer', 'Dana School'),
  ('94400000-0000-4000-8000-000000000092', '94400000-0000-4000-8000-000000000004', null, 'Moonblade', 'Oz School');

select is(pg_temp.flags('ec'), 'none', 'control: an official class known only by name is taken');
update public.character_classes set class_name = 'Blood Hunter' where party_member_id = '94400000-0000-4000-8000-0000000000ec';
select is(pg_temp.flags('ec'), 'none', 'control: a typed name nobody has a class by is a label, not content');
update public.character_classes set class_name = 'hexer', subclass_name = 'dana school'
 where party_member_id = '94400000-0000-4000-8000-0000000000ec';
select is(pg_temp.flags('ec'), 'none',
  'control: a class and a subclass the table has by those names are the table''s own, in any case');

update public.character_classes set class_name = 'moonblade', subclass_name = null
 where party_member_id = '94400000-0000-4000-8000-0000000000ec';
select is(pg_temp.flags('ec') || ' / ' || pg_temp.flag_label('ec', 'class'), 'class:homebrew:pending / Moonblade',
  'a bare name that is its owner''s own class on the owner''s screen is that class, and waits like one');
select throws_ok($$
  update public.character_classes set class_definition_kind = 'custom'
   where party_member_id = '94400000-0000-4000-8000-0000000000ec'
$$, '23514', null, 'and the row cannot be called custom with no definition to hide from that');

update public.character_classes set subclass_name = 'oz school' where party_member_id = '94400000-0000-4000-8000-0000000000ec';
select is(pg_temp.flags('ec'), 'class:homebrew:pending, subclass:homebrew:pending',
  'a subclass known only by name is read the same way');

set local role authenticated;
select pg_temp.as_user(1);
select is(public.approve_character_content(pg_temp.flag_id('ec', 'class')), 1, 'the DM approves the class');
select is(public.approve_character_content(pg_temp.flag_id('ec', 'subclass')), 0, 'and the subclass');
reset role;
select is((select jsonb_build_object(
      'class', cc.class_name, 'kind', cc.class_definition_kind, 'subclass', cc.subclass_name,
      'class_is_the_tables', (select d.user_id from public.custom_classes d where d.id = cc.class_definition_id) = '94400000-0000-4000-8000-000000000001',
      'subclass_is_the_tables', (select d.user_id from public.custom_subclasses d where d.id = cc.subclass_definition_id) = '94400000-0000-4000-8000-000000000001')
    from public.character_classes cc where cc.party_member_id = '94400000-0000-4000-8000-0000000000ec'),
  '{"class": "Moonblade", "kind": "custom", "subclass": "Oz School", "class_is_the_tables": true, "subclass_is_the_tables": true}'::jsonb,
  'approving pins the row to the table''s copies, under the names the definitions carry');
select is((select count(*)::int from public.custom_classes
  where class_name = 'Moonblade' and user_id = '94400000-0000-4000-8000-000000000004'), 1,
  'and the player''s own class is untouched');
delete from public.character_classes where party_member_id = '94400000-0000-4000-8000-0000000000ec';

-- The same bare name on a character nobody owns is only a label: there is no
-- owner on whose screen it could become anything.
insert into public.custom_classes (id, user_id, class_name) values
  ('94400000-0000-4000-8000-000000000083', '94400000-0000-4000-8000-000000000004', 'Starcaller');
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, class)
values ('94400000-0000-4000-8000-0000000000ee', '94400000-0000-4000-8000-000000000001', null,
        '94400000-0000-4000-8000-0000000000c1', 'Typed class roster', 3, 'Starcaller');
insert into public.character_classes (party_member_id, class_name, subclass_name, levels, is_primary)
values ('94400000-0000-4000-8000-0000000000ee', 'Starcaller', 'Champion', 3, true);
select is(pg_temp.flags('ee'), 'none',
  'a DM-built character whose class and subclass are typed names is not flagged at its own table');
delete from public.party_members where id = '94400000-0000-4000-8000-0000000000ee';

-- ── A hand-over changes whose content is the character's own ─────────────────
insert into public.species (id, user_id, name) values
  ('94400000-0000-4000-8000-000000000062', '94400000-0000-4000-8000-000000000002', 'Pia''s Reedfolk');
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, species_id)
values ('94400000-0000-4000-8000-0000000000ed', '94400000-0000-4000-8000-000000000001', null,
        '94400000-0000-4000-8000-0000000000c1', 'Roster for Pia', 1, '94400000-0000-4000-8000-000000000062');
select is(pg_temp.flags('ed'), 'species:foreign:pending', 'on a character nobody owns, a player''s row is somebody else''s');
update public.party_members set owner_user_id = '94400000-0000-4000-8000-000000000002'
 where id = '94400000-0000-4000-8000-0000000000ed';
select is(pg_temp.flags('ed') || ' / ' || pg_temp.flag_label('ed', 'species'), 'species:homebrew:pending / Pia''s Reedfolk',
  'once that player owns the character its flag says so, without waiting for some other change');
delete from public.party_members where id = '94400000-0000-4000-8000-0000000000ed';

-- ── Stay, flagged: a table that changes its mind moves nobody ────────────────

update public.campaigns set disabled_species_ids = array['test_srd_elf']
 where id = '94400000-0000-4000-8000-0000000000c1';
select is(pg_temp.flags('e4'), 'species:blocked:pending', 'blocking a species flags a seated character that has it');
select is(pg_temp.seat(4), '94400000-0000-4000-8000-0000000000e4'::uuid, 'and leaves it in its seat');

set local role authenticated;
select pg_temp.as_user(1);
select is(public.approve_character_content(pg_temp.flag_id('e4', 'species'), 'table'), 0,
  'approving a blocked choice for the table lifts the block');
reset role;
select is((select disabled_species_ids from public.campaigns where id = '94400000-0000-4000-8000-0000000000c1'), '{}'::text[],
  'the species is no longer blocked');

delete from public.campaign_enabled_sources
 where campaign_id = '94400000-0000-4000-8000-0000000000c1' and source_slug = 'test-toh';
select is(pg_temp.flags('e1'), 'species:source:approved, spell:source:pending',
  'turning a book off again flags what came from it, and does not take back what the DM allowed for this character');
select is(pg_temp.seat(2), '94400000-0000-4000-8000-0000000000e1'::uuid, 'the character keeps its seat');

-- ── Leaving takes the flags with it ──────────────────────────────────────────

set local role authenticated;
select pg_temp.as_user(2);
select public.detach_party_member_from_campaign('94400000-0000-4000-8000-0000000000e1');
reset role;
select is(pg_temp.flags('e1'), 'none', 'an approval belongs to the table that gave it: a character that leaves takes none along');

-- ── Characters seated before approval existed ────────────────────────────────

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, species_id)
values ('94400000-0000-4000-8000-0000000000e5', '94400000-0000-4000-8000-000000000001', null,
        '94400000-0000-4000-8000-0000000000c1', 'p5 seated before', 1, 'test_toh_alseid');
delete from public.character_content_reviews where party_member_id = '94400000-0000-4000-8000-0000000000e5';
select private.review_party_member_content('94400000-0000-4000-8000-0000000000e5', true);
select is(pg_temp.flags('e5'), 'species:source:approved', 'the data migration records an existing seated character''s choices as approved');
select is(private.review_party_member_content('94400000-0000-4000-8000-0000000000e5'), 0,
  'and a later review does not re-open them');

-- A JSON null in the feats list is not a choice. It used to come out as a NULL
-- ref, which kept every approval alive after the choice it was for had gone.
update public.party_members set species_id = null, class_choices = '{"feats": [null]}'::jsonb
 where id = '94400000-0000-4000-8000-0000000000e5';
select is((select count(*)::int from private.party_member_content_refs('94400000-0000-4000-8000-0000000000e5') r
  where r.ref is null), 0, 'a null entry in the feats list is not read as a choice');
select is(pg_temp.flags('e5'), 'none', 'so an approval does not outlive the choice it was given for');

-- ── What a client can reach ──────────────────────────────────────────────────

select ok(not has_function_privilege('anon', 'public.approve_character_content(uuid,text,timestamptz)', 'EXECUTE'),
  'anon cannot approve');
select ok(not has_function_privilege('anon', 'public.get_character_content_item(uuid)', 'EXECUTE'),
  'anon cannot read what is waiting');
select ok(not has_function_privilege('anon', 'public.remove_missing_character_content(uuid)', 'EXECUTE'),
  'anon cannot remove anything');
select is_empty($q$
  select p.proname::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in ('adopt_content', 'adopt_id_map', 'assess_content', 'repoint_party_member_content',
                      'review_party_member_content', 'party_member_content_refs', 'is_table_dm', 'source_enabled',
                      'table_book_entry', 'seat_cleared_party_member', 'content_seen_at', 'content_nested_refs',
                      'lock_content', 'try_uuid', 'named_content_of_owner')
    and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))
$q$, 'none of the functions that copy content or decide approval is callable by a client');

select * from finish();
rollback;
