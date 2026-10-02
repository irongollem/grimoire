-- Epic #943 wave 4: a character brings to a table only what the table approves.
--
-- What is held here, each refusal beside a control:
--
--   the predicate  what a table takes as it is, and the four reasons it does not
--   the bench      a flagged character joins but cannot be made anyone's active
--                  character (CR001), for the DM as well
--   approval       only the table's DM; for this character or for the table;
--                  a row somebody owns is copied into the table, deeply, and
--                  the original is untouched
--   no asking      a player's own copy of a book the table has is adopted
--                  without a flag
--   stay, flagged  a table that changes its mind flags a seated character and
--                  moves nothing
--
--   1 Dana  DM of c1 (2014)                 3 Sam  DM of c2, author of a homebrew spell
--   2 Pia   plays at c1                     4 Oz   plays at c1
--
--   p1 Pia's: a species and a spell from a book c1 has not enabled, and Pia's
--      own copy of an SRD background
--   p2 Pia's: her own homebrew species (granting her own spell), her own
--      homebrew class (with her own feature), and that feature taken as a feat
--   p3 Pia's: a spell Sam wrote
--   p4 Oz's:  nothing the table has not approved

begin;

create extension if not exists pgtap with schema extensions;
select plan(60);

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

-- Content people own.
insert into public.backgrounds (id, user_id, name, ruleset, open5e_import, source, source_title, source_document_key, source_record_key) values
  ('94400000-0000-4000-8000-0000000000b1', '94400000-0000-4000-8000-000000000002', 'Acolyte', '2014', true,
   'srd-2014', 'System Reference Document 5.1', 'srd-2014', 'srd_acolyte');
insert into public.spells (id, user_id, name) values
  ('94400000-0000-4000-8000-000000000051', '94400000-0000-4000-8000-000000000002', 'Pia''s Spark'),
  ('94400000-0000-4000-8000-000000000053', '94400000-0000-4000-8000-000000000003', 'Sam''s Hex');
insert into public.species (id, user_id, name, granted_spells) values
  ('94400000-0000-4000-8000-000000000061', '94400000-0000-4000-8000-000000000002', 'Pia''s Mothfolk',
   '[{"spell_id": "94400000-0000-4000-8000-000000000051", "spell_name": "Pia''s Spark", "min_level": 1, "uses_per_day": null, "resets_on": null, "source_label": "Mothfolk", "subrace": null}]'::jsonb);
insert into public.class_features (id, user_id, name) values
  ('94400000-0000-4000-8000-000000000071', '94400000-0000-4000-8000-000000000002', 'Pia''s Knack');
insert into public.custom_classes (id, user_id, class_name, features) values
  ('94400000-0000-4000-8000-000000000081', '94400000-0000-4000-8000-000000000002', 'Hexer',
   '{"1": ["94400000-0000-4000-8000-000000000071"]}'::jsonb);

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, class, level, ruleset, species_id, background_id, class_choices, level_choices) values
  ('94400000-0000-4000-8000-0000000000e1', '94400000-0000-4000-8000-000000000002', '94400000-0000-4000-8000-000000000002',
   null, 'p1 tome', 'Wizard', 1, '2014', 'test_toh_alseid', '94400000-0000-4000-8000-0000000000b1', '{}'::jsonb, '{}'::jsonb),
  ('94400000-0000-4000-8000-0000000000e2', '94400000-0000-4000-8000-000000000002', '94400000-0000-4000-8000-000000000002',
   null, 'p2 homebrew', 'Hexer', 4, '2014', '94400000-0000-4000-8000-000000000061', null,
   '{"feats": ["94400000-0000-4000-8000-000000000071"]}'::jsonb,
   '{"4": {"asi": {"feat_id": "94400000-0000-4000-8000-000000000071"}}}'::jsonb),
  ('94400000-0000-4000-8000-0000000000e3', '94400000-0000-4000-8000-000000000002', '94400000-0000-4000-8000-000000000002',
   null, 'p3 foreign', 'Wizard', 1, '2014', 'test_srd_elf', null, '{}'::jsonb, '{}'::jsonb),
  ('94400000-0000-4000-8000-0000000000e4', '94400000-0000-4000-8000-000000000004', '94400000-0000-4000-8000-000000000004',
   null, 'p4 clean', 'Wizard', 1, '2014', 'test_srd_elf', null, '{}'::jsonb, '{}'::jsonb);

insert into public.character_classes (party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
select m.id, 'Wizard', 1, true, (select id from public.system_classes where ruleset = '2014' and class_name = 'Wizard'), 'system'
  from public.party_members m
 where m.id in ('94400000-0000-4000-8000-0000000000e1', '94400000-0000-4000-8000-0000000000e3', '94400000-0000-4000-8000-0000000000e4');
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
create function pg_temp.seat(p_user int) returns uuid language sql security definer as $$
  select m.party_member_id from public.campaign_members m
   where m.campaign_id = '94400000-0000-4000-8000-0000000000c1'
     and m.user_id = ('94400000-0000-4000-8000-00000000000' || p_user)::uuid;
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

select lives_ok($$
  select public.attach_party_member_to_campaign('94400000-0000-4000-8000-0000000000e4', '94400000-0000-4000-8000-0000000000c1', true)
$$, 'a character built only from what the table has joins');
select is(pg_temp.flags('e4'), 'none', 'with nothing waiting');
select is(pg_temp.seat(4), '94400000-0000-4000-8000-0000000000e4'::uuid, 'and takes its player''s seat');

-- ── The bench ────────────────────────────────────────────────────────────────

select pg_temp.as_user(2);
select lives_ok($$
  select public.attach_party_member_to_campaign('94400000-0000-4000-8000-0000000000e1', '94400000-0000-4000-8000-0000000000c1', true)
$$, 'a character with unapproved choices still joins');
select is((pg_temp.pm('e1')).campaign_id, '94400000-0000-4000-8000-0000000000c1'::uuid, 'it is at the table');
select is(pg_temp.flags('e1'), 'species:source:pending, spell:source:pending',
  'flagged for the species and the spell from a book the table has not enabled');
select is(pg_temp.seat(2), null, 'and benched: the seat it would have taken stays empty');

-- Her own copy of an SRD background needed no asking: the table has that book.
select isnt((pg_temp.pm('e1')).background_id, '94400000-0000-4000-8000-0000000000b1'::uuid,
  'the background is re-pointed away from the player''s own row');
select is((select b.user_id from public.backgrounds b where b.id = (pg_temp.pm('e1')).background_id),
  '94400000-0000-4000-8000-000000000001'::uuid, 'at a copy the table''s DM owns, which the whole table can read');
select is((select count(*)::int from public.backgrounds where id = '94400000-0000-4000-8000-0000000000b1'), 1,
  'and the player''s original is still hers');

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
select pg_temp.as_user(2);
select throws_ok(format($$ select public.approve_character_content(%L) $$, pg_temp.flag_id('e1', 'species')),
  '42501', 'Only the DM of the table can approve a character''s choices', 'the character''s own player cannot approve it');
select is(public.get_character_content_item(pg_temp.flag_id('e1', 'species')) ->> 'name', 'Test Alseid',
  'but may look at their own flag');

-- ── Approving: for this character, then for the table ────────────────────────

select pg_temp.as_user(1);
select is(public.get_character_content_item(pg_temp.flag_id('e1', 'species')) ->> 'name', 'Test Alseid',
  'the DM opens what is waiting');
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

-- ── Homebrew: approving copies it into the table, deeply ─────────────────────

select pg_temp.as_user(2);
select lives_ok($$
  select public.attach_party_member_to_campaign('94400000-0000-4000-8000-0000000000e2', '94400000-0000-4000-8000-0000000000c1', true)
$$, 'a character built from its player''s own homebrew joins');
select is(pg_temp.flags('e2'), 'class:homebrew:pending, feat:homebrew:pending, species:homebrew:pending',
  'flagged for the species, the class and the feat');

select pg_temp.as_user(1);
select is(public.get_character_content_item(pg_temp.flag_id('e2', 'species')) ->> 'name', 'Pia''s Mothfolk',
  'the DM can read a player''s homebrew through its flag, which RLS alone would not allow');
select ok(not (public.get_character_content_item(pg_temp.flag_id('e2', 'species')) ? 'user_id'),
  'without learning whose account it is from the row');

select is(public.approve_character_content(pg_temp.flag_id('e2', 'species')), 2, 'the DM approves the species');
reset role;
select ok((pg_temp.pm('e2')).species_id <> '94400000-0000-4000-8000-000000000061', 'the character points at a copy');
select is((select s.user_id::text || ' / ' || s.campaign_id::text from public.species s where s.id::text = (pg_temp.pm('e2')).species_id),
  '94400000-0000-4000-8000-000000000001 / 94400000-0000-4000-8000-0000000000c1',
  'which the table''s DM owns, in this campaign');
select is((select sp.user_id from public.species s, public.spells sp
   where s.id::text = (pg_temp.pm('e2')).species_id and sp.id::text = s.granted_spells -> 0 ->> 'spell_id'),
  '94400000-0000-4000-8000-000000000001'::uuid,
  'and the spell the species grants came with it, as the table''s own copy');
select is((select s.user_id::text || ' / ' || (s.granted_spells -> 0 ->> 'spell_id') from public.species s where s.id = '94400000-0000-4000-8000-000000000061'),
  '94400000-0000-4000-8000-000000000002 / 94400000-0000-4000-8000-000000000051',
  'the player''s original species is untouched');

set local role authenticated;
select pg_temp.as_user(1);
select is(public.approve_character_content(pg_temp.flag_id('e2', 'class')), 1, 'the DM approves the class');
reset role;
select is((select c.user_id from public.custom_classes c
    join public.character_classes cc on cc.class_definition_id = c.id
   where cc.party_member_id = '94400000-0000-4000-8000-0000000000e2'),
  '94400000-0000-4000-8000-000000000001'::uuid, 'the character''s class row points at the table''s copy');
select is((select f.user_id from public.custom_classes c
    join public.character_classes cc on cc.class_definition_id = c.id
    join public.class_features f on f.id::text = c.features -> '1' ->> 0
   where cc.party_member_id = '94400000-0000-4000-8000-0000000000e2'),
  '94400000-0000-4000-8000-000000000001'::uuid, 'whose feature came with it');

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

-- ── Foreign homebrew cannot be approved, only changed ────────────────────────

set local role authenticated;
select pg_temp.as_user(2);
select lives_ok($$
  select public.attach_party_member_to_campaign('94400000-0000-4000-8000-0000000000e3', '94400000-0000-4000-8000-0000000000c1', false)
$$, 'a character carrying another DM''s homebrew joins');
select is(pg_temp.flags('e3'), 'spell:foreign:pending', 'flagged as made at another table');
select pg_temp.as_user(1);
select throws_ok(format($$ select public.approve_character_content(%L) $$, pg_temp.flag_id('e3', 'spell')),
  'P0001', 'This was made at another table and cannot be approved here; it has to be changed',
  'the DM cannot approve it: that would copy another DM''s work without them');
reset role;
delete from public.character_spells
 where party_member_id = '94400000-0000-4000-8000-0000000000e3' and spell_id = '94400000-0000-4000-8000-000000000053';
select is(pg_temp.flags('e3'), 'none', 'changing the choice clears the flag');

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

-- ── What a client can reach ──────────────────────────────────────────────────

select ok(not has_function_privilege('anon', 'public.approve_character_content(uuid,text)', 'EXECUTE'),
  'anon cannot approve');
select ok(not has_function_privilege('anon', 'public.get_character_content_item(uuid)', 'EXECUTE'),
  'anon cannot read what is waiting');
select is_empty($q$
  select p.proname::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in ('adopt_content', 'adopt_id_map', 'assess_content', 'repoint_party_member_content',
                      'review_party_member_content', 'party_member_content_refs', 'is_table_dm', 'source_enabled')
    and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))
$q$, 'none of the functions that copy content or decide approval is callable by a client');

select * from finish();
rollback;
