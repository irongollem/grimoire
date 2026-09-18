begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

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
  ('19410000-0000-4000-8000-000000000106', '19410000-0000-4000-8000-000000000003', null, 'Giant Rat');

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
  ('zzmatch-disabled-ogre', 'Ogre Zzmatch', 'giant', '2014', 'zzmatch_ogre', 'zzmatch-disabled-book', 'zzmatch-disabled-book', 'zzmatch-disabled-ogre');

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
-- An encounter the owner controls, pointed at a stranger's location (nothing in
-- the schema prevents that): its `detail` must not carry the stranger's name.
insert into public.locations (id, user_id, campaign_id, name)
values ('19410000-0000-4000-8000-000000000201', '19410000-0000-4000-8000-000000000003', null, 'Strangers Secret Vault');
insert into public.encounters (id, user_id, campaign_id, name, location_id)
values ('19410000-0000-4000-8000-000000000202', '19410000-0000-4000-8000-000000000001',
        '19410000-0000-4000-8000-000000000010', 'Zzmatch Ambush', '19410000-0000-4000-8000-000000000201');
select is(
  (select detail from public.match_import_entity_names(
     '19410000-0000-4000-8000-000000000001'::uuid,
     '19410000-0000-4000-8000-000000000010'::uuid,
     'encounters', array['Zzmatch Ambush'])),
  null::text,
  'an encounter pointing at another account''s location does not leak that location''s name'
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
