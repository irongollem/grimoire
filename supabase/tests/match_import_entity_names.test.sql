begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

-- Regression + behavior cover for the name tier of the import dedupe
-- (migration 20260918141022, called only by the import-match edge function).
--
-- Three properties matter and are easy to lose to a later "tidy-up": the
-- normalize+match logic (article/plural/whole-word-suffix, safe against regex
-- metacharacters), the campaign/global scope (a co-DM's row is in, a
-- stranger's global row is out), and the two different caps -- the DM's own
-- rows are NEVER trimmed (a DM with five goblins must see all five), while
-- the library is capped at five per name because it can hold the same
-- creature from many sourcebooks.
--
-- Migration 20261002131333 added a fourth: a page and a DM write the same
-- name differently. The second half of this file is the six misses one real
-- chapter produced (typeset punctuation, a given name without its surname, a
-- one-letter slip), each with the guard that keeps the wider rule from
-- reaching the kinds and sources it was deliberately kept away from.

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('19410000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'match-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('19410000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'match-codm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('19410000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'match-stranger@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('19410000-0000-4000-8000-000000000010', '19410000-0000-4000-8000-000000000001', 'Match test campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('19410000-0000-4000-8000-000000000010', '19410000-0000-4000-8000-000000000002', 'dm', 'Co-DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.npcs (id, user_id, campaign_id, name) values
  ('19410000-0000-4000-8000-000000000101', '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Giant Rat'),
  ('19410000-0000-4000-8000-000000000102', '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Kobold'),
  ('19410000-0000-4000-8000-000000000103', '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Foreman Dresk'),
  ('19410000-0000-4000-8000-000000000104', '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Pirate'),
  -- co-DM's own row in the shared campaign -- still visible, per the
  -- function's pool ("every row in this campaign", not just the caller's own).
  ('19410000-0000-4000-8000-000000000105', '19410000-0000-4000-8000-000000000002', '19410000-0000-4000-8000-000000000010', 'Co-DM Contact'),
  -- a stranger's GLOBAL npc, same name as one above, in no campaign at all --
  -- must never appear when a different user queries a campaign they own.
  ('19410000-0000-4000-8000-000000000106', '19410000-0000-4000-8000-000000000003', null, 'Giant Rat'),
  -- The proper-name cases (migration 20261002131333).
  ('19410000-0000-4000-8000-000000000107', '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Finn'),
  ('19410000-0000-4000-8000-000000000108', '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Hilda Snowmantle'),
  ('19410000-0000-4000-8000-000000000109', '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Edgra Durnoot'),
  ('19410000-0000-4000-8000-000000000110', '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Captain Imdra Arlaggath'),
  -- Two of the DM's own rows one letter apart: asking for one by its exact
  -- name must not also offer the other.
  ('19410000-0000-4000-8000-000000000111', '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Zzmatch Marta'),
  ('19410000-0000-4000-8000-000000000112', '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Zzmatch Marte'),
  -- A short invented name with a one-letter neighbour the page will print.
  ('19410000-0000-4000-8000-000000000113', '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Korax');

-- Typed the way a DM types them: a straight apostrophe, a space for a hyphen.
insert into public.locations (id, user_id, campaign_id, name) values
  ('19410000-0000-4000-8000-000000000301', '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Dougan''s Hole'),
  ('19410000-0000-4000-8000-000000000302', '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Ten Towns');

-- Six same-named NPCs the owner made themselves -- the "five goblins" case.
-- None of these may be trimmed: match_import_entity_names caps the library at
-- five but the DM's own rows are unbounded (max 25, a pathological-vault
-- guard only).
insert into public.npcs (id, user_id, campaign_id, name)
select gen_random_uuid(), '19410000-0000-4000-8000-000000000001', '19410000-0000-4000-8000-000000000010', 'Goblin Scout'
from generate_series(1, 6);

-- Six library monsters sharing a name, from different (fictional) sourcebooks
-- -- the library-side cap.
-- All six from ONE book the campaign has enabled, so the cap is the only thing
-- that can trim them; a seventh from a book it has NOT enabled must never be
-- offered at all (the library gate every other library read applies).
insert into public.campaign_enabled_sources (campaign_id, source_slug, source_title)
values ('19410000-0000-4000-8000-000000000010', 'zzmatch-book', 'Match Test Book');

insert into public.library_monsters (id, name, monster_type, ruleset, conceptual_key, source, source_document_key, source_record_key) values
  ('zzmatch-goblin-scout-1', 'Goblin Raider', 'humanoid', '2014', 'zzmatch_goblin_raider', 'zzmatch-book', 'zzmatch-book', 'zzmatch-goblin-scout-1'),
  ('zzmatch-goblin-scout-2', 'Goblin Raider', 'humanoid', '2014', 'zzmatch_goblin_raider', 'zzmatch-book', 'zzmatch-book', 'zzmatch-goblin-scout-2'),
  ('zzmatch-goblin-scout-3', 'Goblin Raider', 'humanoid', '2014', 'zzmatch_goblin_raider', 'zzmatch-book', 'zzmatch-book', 'zzmatch-goblin-scout-3'),
  ('zzmatch-goblin-scout-4', 'Goblin Raider', 'humanoid', '2014', 'zzmatch_goblin_raider', 'zzmatch-book', 'zzmatch-book', 'zzmatch-goblin-scout-4'),
  ('zzmatch-goblin-scout-5', 'Goblin Raider', 'humanoid', '2014', 'zzmatch_goblin_raider', 'zzmatch-book', 'zzmatch-book', 'zzmatch-goblin-scout-5'),
  ('zzmatch-goblin-scout-6', 'Goblin Raider', 'humanoid', '2014', 'zzmatch_goblin_raider', 'zzmatch-book', 'zzmatch-book', 'zzmatch-goblin-scout-6'),
  ('zzmatch-disabled-ogre', 'Ogre Zzmatch', 'giant', '2014', 'zzmatch_ogre', 'zzmatch-disabled-book', 'zzmatch-disabled-book', 'zzmatch-disabled-ogre'),
  -- In the enabled book, and one letter from a name the page will ask for.
  ('zzmatch-ghast', 'Zzmatch Qhast', 'undead', '2014', 'zzmatch_ghast', 'zzmatch-book', 'zzmatch-book', 'zzmatch-ghast');

-- ── Exact match through article + plural ─────────────────────────────────────
select results_eq(
  $$ select target_id, source, match_kind
     from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'npcs', array['The Giant Rats']) $$,
  $$ values ('19410000-0000-4000-8000-000000000101', 'campaign', 'exact') $$,
  'The Giant Rats matches Giant Rat exactly, through the article and the plural -- and not the stranger''s same-named global npc'
);

-- ── Whole-word suffix, forward: a longer query finds a shorter existing name ──
select results_eq(
  $$ select target_id, source, match_kind
     from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'npcs', array['Icewind kobold']) $$,
  $$ values ('19410000-0000-4000-8000-000000000102', 'campaign', 'contains') $$,
  '"Icewind kobold" finds the existing "Kobold" as a whole-word suffix'
);

-- ── Whole-word suffix, backward: a shorter query finds a longer existing name ─
select results_eq(
  $$ select target_id, source, match_kind
     from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'npcs', array['Dresk']) $$,
  $$ values ('19410000-0000-4000-8000-000000000103', 'campaign', 'contains') $$,
  '"Dresk" finds the existing "Foreman Dresk" as a whole-word suffix'
);

-- ── "rat" is a whole word inside "Giant Rat" but only a substring of "Pirate" ─
select ok(
  exists (
    select 1 from public.match_import_entity_names(
      '19410000-0000-4000-8000-000000000001'::uuid,
      '19410000-0000-4000-8000-000000000010'::uuid,
      'npcs', array['rat'])
    where target_id = '19410000-0000-4000-8000-000000000101'),
  '"rat" matches "Giant Rat" as a whole word'
);
select ok(
  not exists (
    select 1 from public.match_import_entity_names(
      '19410000-0000-4000-8000-000000000001'::uuid,
      '19410000-0000-4000-8000-000000000010'::uuid,
      'npcs', array['rat'])
    where target_id = '19410000-0000-4000-8000-000000000104'),
  '"rat" does NOT match "Pirate" -- it is a substring, not a whole-word suffix'
);

-- ── A name with regex metacharacters cannot error or widen the match ─────────
select lives_ok(
  $$ select * from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'npcs', array['Tomb of (Horrors']) $$,
  'a name containing a regex metacharacter does not raise'
);

-- ── Scope: a co-DM's row in the same campaign is visible ─────────────────────
select results_eq(
  $$ select target_id, source, match_kind
     from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'npcs', array['Co-DM Contact']) $$,
  $$ values ('19410000-0000-4000-8000-000000000105', 'campaign', 'exact') $$,
  'a co-DM''s NPC in the same campaign is returned -- it is still this campaign''s NPC'
);

-- ── Scope: another user's global npc never crosses into this campaign ────────
-- (Already implied by the exact-match assertion above returning exactly one
-- row, but asserted directly so a regression names the right property.)
select is(
  (select count(*) from public.match_import_entity_names(
     '19410000-0000-4000-8000-000000000001'::uuid,
     '19410000-0000-4000-8000-000000000010'::uuid,
     'npcs', array['Giant Rat'])
   where target_id = '19410000-0000-4000-8000-000000000106'),
  0::bigint,
  'a stranger''s global (campaign_id null) npc is never returned for a campaign it does not belong to'
);

-- ── Cap: the DM's own rows are NEVER trimmed -- all six goblins come back ────
select is(
  (select count(*) from public.match_import_entity_names(
     '19410000-0000-4000-8000-000000000001'::uuid,
     '19410000-0000-4000-8000-000000000010'::uuid,
     'npcs', array['Goblin Scout'])
   where source = 'campaign'),
  6::bigint,
  'a DM with six same-named NPCs is offered all six -- the campaign side is never capped'
);

-- ── Cap: the library IS capped at five per name ───────────────────────────────
select is(
  (select count(*) from public.match_import_entity_names(
     '19410000-0000-4000-8000-000000000001'::uuid,
     '19410000-0000-4000-8000-000000000010'::uuid,
     'monsters', array['Goblin Raider'])
   where source = 'library'),
  5::bigint,
  'six same-named library monsters are capped at five candidates'
);

-- ── Gate: a book the campaign has not enabled is never offered ────────────────
select is(
  (select count(*) from public.match_import_entity_names(
     '19410000-0000-4000-8000-000000000001'::uuid,
     '19410000-0000-4000-8000-000000000010'::uuid,
     'monsters', array['Ogre Zzmatch'])),
  0::bigint,
  'a library monster from a source the campaign has not enabled is never a candidate'
);

-- ── Scope: an encounter's joined location obeys the same scope as the row ────
-- An encounter the owner controls, pointed at a stranger's location: its
-- `detail` must not carry the stranger's name. Since #892 the write itself is
-- refused (zz_same_campaign_refs, see same_campaign_refs.test.sql), so the row
-- is planted with that trigger off, the way one written before #892 exists.
-- The read keeps its own scope as defence in depth.
insert into public.locations (id, user_id, campaign_id, name)
values ('19410000-0000-4000-8000-000000000201', '19410000-0000-4000-8000-000000000003', null, 'Strangers Secret Vault');
alter table public.encounters disable trigger zz_same_campaign_refs;
insert into public.encounters (id, user_id, campaign_id, name, location_id)
values ('19410000-0000-4000-8000-000000000202', '19410000-0000-4000-8000-000000000001',
        '19410000-0000-4000-8000-000000000010', 'Zzmatch Ambush', '19410000-0000-4000-8000-000000000201');
alter table public.encounters enable trigger zz_same_campaign_refs;
select is(
  (select detail from public.match_import_entity_names(
     '19410000-0000-4000-8000-000000000001'::uuid,
     '19410000-0000-4000-8000-000000000010'::uuid,
     'encounters', array['Zzmatch Ambush'])),
  null::text,
  'an encounter pointing at another account''s location does not leak that location''s name'
);

-- ── Punctuation: the page typesets what the DM typed ─────────────────────────
select results_eq(
  $$ select target_id, source, match_kind
     from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'locations', array['Dougan’s Hole']) $$,
  $$ values ('19410000-0000-4000-8000-000000000301', 'campaign', 'exact') $$,
  'a typeset apostrophe matches the typed one exactly: "Dougan’s Hole" is the existing "Dougan''s Hole"'
);
select results_eq(
  $$ select target_id, source, match_kind
     from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'locations', array['Ten-Towns']) $$,
  $$ values ('19410000-0000-4000-8000-000000000302', 'campaign', 'exact') $$,
  'a hyphen matches a space exactly: "Ten-Towns" is the existing "Ten Towns"'
);

-- ── Proper names match on any whole-word run, in either direction ────────────
select results_eq(
  $$ select target_id, source, match_kind
     from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'npcs', array['Finn Dejarr']) $$,
  $$ values ('19410000-0000-4000-8000-000000000107', 'campaign', 'contains') $$,
  '"Finn Dejarr" finds the existing "Finn": a given name leads, so a suffix rule alone misses it'
);
select results_eq(
  $$ select target_id, source, match_kind
     from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'npcs', array['Hilda']) $$,
  $$ values ('19410000-0000-4000-8000-000000000108', 'campaign', 'contains') $$,
  '"Hilda" finds the existing "Hilda Snowmantle"'
);
select results_eq(
  $$ select target_id, source, match_kind
     from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'npcs', array['Imdra']) $$,
  $$ values ('19410000-0000-4000-8000-000000000110', 'campaign', 'contains') $$,
  '"Imdra" finds the existing "Captain Imdra Arlaggath" from the middle of the name'
);
-- The guard: a thing is named head-noun-last, so every other kind keeps the
-- suffix rule and nothing wider. "Zzmatch Ambush" leads this name; it must not
-- be offered.
select is(
  (select count(*) from public.match_import_entity_names(
     '19410000-0000-4000-8000-000000000001'::uuid,
     '19410000-0000-4000-8000-000000000010'::uuid,
     'encounters', array['Zzmatch Ambush at Dawn'])),
  0::bigint,
  'outside npcs, factions and locations a leading whole-word match is not a candidate'
);

-- ── Near: the DM's own row, one keystroke away ───────────────────────────────
select results_eq(
  $$ select target_id, source, match_kind
     from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'npcs', array['Edgra Durmoot']) $$,
  $$ values ('19410000-0000-4000-8000-000000000109', 'campaign', 'near') $$,
  '"Edgra Durmoot" finds the existing "Edgra Durnoot", one letter away'
);
select results_eq(
  $$ select target_id, source, match_kind
     from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'npcs', array['Zzmatch Marta']) $$,
  $$ values ('19410000-0000-4000-8000-000000000111', 'campaign', 'exact') $$,
  'a name with an exact match is not misspelled: its one-letter neighbour "Zzmatch Marte" is not offered'
);
select is(
  (select count(*) from public.match_import_entity_names(
     '19410000-0000-4000-8000-000000000001'::uuid,
     '19410000-0000-4000-8000-000000000010'::uuid,
     'npcs', array['Fenn'])),
  0::bigint,
  'a short name gets no near match: "Fenn" does not find "Finn"'
);
-- The real collision that set the bar at eight characters: two different
-- people in one campaign, one letter apart.
select is(
  (select count(*) from public.match_import_entity_names(
     '19410000-0000-4000-8000-000000000001'::uuid,
     '19410000-0000-4000-8000-000000000010'::uuid,
     'npcs', array['Koran'])),
  0::bigint,
  'one letter in five is not a slip: "Koran" does not find "Korax"'
);
-- "Qhost", not "Ghost": a real library "Ghost" is a legitimate *contains*
-- match for "Zzmatch Ghost", so that spelling failed on any local stack whose
-- library holds the monster, and passed only on CI's empty one.
select is(
  (select count(*) from public.match_import_entity_names(
     '19410000-0000-4000-8000-000000000001'::uuid,
     '19410000-0000-4000-8000-000000000010'::uuid,
     'monsters', array['Zzmatch Qhost'])),
  0::bigint,
  'the library is never a near match: "Zzmatch Qhost" does not find the library''s "Zzmatch Qhast"'
);
-- A title in front and a slip inside, both at once (migration 20261002133428):
-- the run rule wants identical words and the whole-name rule wants equal
-- lengths, so neither finds this on its own.
select results_eq(
  $$ select target_id, source, match_kind
     from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'npcs', array['Speaker Edgra Durmoot']) $$,
  $$ values ('19410000-0000-4000-8000-000000000109', 'campaign', 'near') $$,
  '"Speaker Edgra Durmoot" finds the existing "Edgra Durnoot": one edit from a run inside the longer name'
);
select results_eq(
  $$ select target_id, source, match_kind
     from public.match_import_entity_names(
       '19410000-0000-4000-8000-000000000001'::uuid,
       '19410000-0000-4000-8000-000000000010'::uuid,
       'npcs', array['Imdra Arlagath']) $$,
  $$ values ('19410000-0000-4000-8000-000000000110', 'campaign', 'near') $$,
  'and the other way round: "Imdra Arlagath" finds the existing "Captain Imdra Arlaggath"'
);
select is(
  (select count(*) from public.match_import_entity_names(
     '19410000-0000-4000-8000-000000000001'::uuid,
     '19410000-0000-4000-8000-000000000010'::uuid,
     'npcs', array['Speaker Hilde Frostbeard'])),
  0::bigint,
  'a different person sharing a near first name is not offered: "Speaker Hilde Frostbeard" does not find "Hilda Snowmantle"'
);
select ok(
  not private.name_run_one_edit_apart('old marty brightwood', 'marta'),
  'a one-word name under eight characters never matches a run of a longer one'
);
select ok(
  private.names_one_edit_apart('edgra durmoot', 'edgra durmoto'),
  'two neighbouring letters swapped are one edit apart'
);
select ok(
  not private.names_one_edit_apart('koran', 'kanan'),
  'two letters changed are not one edit apart'
);

-- ── Grants: service_role only ─────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.match_import_entity_names(uuid, uuid, text, text[])', 'EXECUTE'),
  'anon cannot execute match_import_entity_names'
);
select ok(
  not has_function_privilege('authenticated', 'public.match_import_entity_names(uuid, uuid, text, text[])', 'EXECUTE'),
  'authenticated cannot execute match_import_entity_names'
);
select ok(
  has_function_privilege('service_role', 'public.match_import_entity_names(uuid, uuid, text, text[])', 'EXECUTE'),
  'service_role can execute match_import_entity_names'
);

select * from finish();
rollback;
