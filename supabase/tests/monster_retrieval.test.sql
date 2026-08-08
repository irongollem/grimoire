begin;

create extension if not exists pgtap with schema extensions;

-- Retrieval-backed monster selection for the Encounter Suggester (issue #595).
--
-- WHAT THIS GUARDS. `match_library_monsters` must apply the enabled-sources and
-- ruleset gates as WHERE predicates, BEFORE the similarity ordering -- never as
-- a post-filter on the ranked top-K. A campaign that has NOT enabled a
-- sourcebook must never be offered a monster from it: `content_sources` carries
-- per-source publisher and licence, and surfacing a publisher's content into a
-- campaign that never opted into that book is the licensing mistake #567 and
-- #583 fixed.
--
-- WHY THE FIXTURE IS SHAPED LIKE THIS. A post-filter implementation does not
-- leak disabled rows -- it drops them too, just later. Its actual failure is the
-- SILENT SHRINK the issue calls out: the top-K is spent on rows that are then
-- discarded, so the campaign ends up with fewer candidates, or none. A fixture
-- with one disabled monster cannot tell the two apart, because a single
-- discarded row still leaves the enabled one in a K of any size.
--
-- So the disabled source gets THREE rows, all at distance 0, and the query asks
-- for match_count = 2:
--   filter-first  -> the disabled rows are never eligible, K is spent on the
--                    enabled source, and T595 Tomb Shade comes back.
--   filter-after  -> both K slots go to disabled rows, which are then stripped,
--                    and the campaign gets NOTHING.
-- Assertion 2 is therefore the one that fails on a regression; assertion 1
-- guards the leak direction. Both are needed -- "returns nothing" would satisfy
-- assertion 1 on its own.
--
-- HERMETIC ON PURPOSE. Every planted row uses synthetic `t595-*` source slugs
-- and a synthetic embedding model, so this test asserts against its own fixture
-- only. It behaves identically on a freshly migrated CI database and against a
-- database already holding the real 3,541-row library.

-- `vector` and pgtap both live in `extensions` once 20260805000006 has run;
-- `public` is still needed for the tables and the RPCs under test.
set local search_path = public, extensions;

select plan(11);

-- ── Fixture helpers ─────────────────────────────────────────────────────────
-- A 1536-dimension vector with only its first two components set. Cosine
-- distance from vec(1,0): vec(1,0) = 0, vec(1,1) ~ 0.293, vec(0,1) = 1. That is
-- enough separation to assert exact orderings without hand-writing 1536 floats.
create function pg_temp.vec(a float8, b float8) returns vector
language sql immutable as $$
  select ('[' || a || ',' || b || repeat(',0', 1534) || ']')::vector(1536);
$$;

/* Names returned by the library matcher for the query vector vec(1,0). */
create function pg_temp.lib_names(slugs text[], p_ruleset text, p_model text, k int)
returns setof text language sql as $$
  select name from public.match_library_monsters(pg_temp.vec(1, 0), slugs, p_ruleset, p_model, k);
$$;

-- ── Library fixture ─────────────────────────────────────────────────────────
insert into public.library_monsters
  (id, name, monster_type, source, ruleset, conceptual_key, source_document_key, source_record_key, stat_block)
values
  -- Three rows in a source this campaign has NOT enabled, all nearer than
  -- anything it HAS enabled, and together more numerous than match_count.
  ('t595_off_1',    'T595 Crypt Stalker', 'undead', 't595-gate-off', '2014', 't595-crypt-stalker', 't595', 'crypt-stalker', '{"challenge_rating":"5"}'::jsonb),
  ('t595_off_2',    'T595 Bone Prowler',  'undead', 't595-gate-off', '2014', 't595-bone-prowler',  't595', 'bone-prowler',  '{"challenge_rating":"5"}'::jsonb),
  ('t595_off_3',    'T595 Pallid Sentry', 'undead', 't595-gate-off', '2014', 't595-pallid-sentry', 't595', 'pallid-sentry', '{"challenge_rating":"5"}'::jsonb),
  -- Far away, but its source IS enabled -- the only row that may come back.
  ('t595_on',       'T595 Tomb Shade',    'undead', 't595-gate-on',  '2014', 't595-tomb-shade',    't595', 'tomb-shade',    '{"challenge_rating":"3"}'::jsonb),
  -- Enabled source, distance 0, wrong ruleset.
  ('t595_ruleset',  'T595 Barrow Wight',  'undead', 't595-gate-on',  '2024', 't595-barrow-wight',  't595', 'barrow-wight',  '{"challenge_rating":"4"}'::jsonb),
  -- Enabled source, right ruleset, distance 0, but embedded by another model.
  ('t595_model',    'T595 Grave Knight',  'undead', 't595-gate-on',  '2014', 't595-grave-knight',  't595', 'grave-knight',  '{"challenge_rating":"9"}'::jsonb),
  -- The same creature printed in two enabled books -- one concept, two rows.
  ('t595_ghost_a',  'T595 Ghost',         'undead', 't595-dupe-a',   '2014', 't595-ghost',         't595', 'ghost-a',       '{"challenge_rating":"4"}'::jsonb),
  ('t595_ghost_b',  'T595 Ghost',         'undead', 't595-dupe-b',   '2014', 't595-ghost',         't595', 'ghost-b',       '{"challenge_rating":"6"}'::jsonb);

insert into public.library_monster_embeddings (library_monster_id, embedding, embedding_model, source_hash)
values
  ('t595_off_1',   pg_temp.vec(1, 0),    'test-model-595',  'h'),
  ('t595_off_2',   pg_temp.vec(1, 0),    'test-model-595',  'h'),
  ('t595_off_3',   pg_temp.vec(1, 0),    'test-model-595',  'h'),
  ('t595_on',      pg_temp.vec(1, 1),    'test-model-595',  'h'),
  ('t595_ruleset', pg_temp.vec(1, 0),    'test-model-595',  'h'),
  ('t595_model',   pg_temp.vec(1, 0),    'other-model-595', 'h'),
  ('t595_ghost_a', pg_temp.vec(1, 0),    'test-model-595',  'h'),
  ('t595_ghost_b', pg_temp.vec(1, 0.01), 'test-model-595',  'h');

-- ── The enabled-sources gate ────────────────────────────────────────────────

select is(
  (select count(*)::integer from pg_temp.lib_names(array['t595-gate-on'], '2014', 'test-model-595', 2) n
   where n = 'T595 Crypt Stalker'),
  0,
  'a monster from a source the campaign has not enabled never appears, even as the nearest row in the index'
);

select is(
  (select count(*)::integer from pg_temp.lib_names(array['t595-gate-on'], '2014', 'test-model-595', 2) n
   where n = 'T595 Tomb Shade'),
  1,
  'a distant ENABLED monster still comes back when nearer disabled rows outnumber match_count -- the gate filters before ranking, it does not silently shrink the candidate set'
);

select is(
  (select count(*)::integer from pg_temp.lib_names(array['t595-gate-on'], '2014', 'test-model-595', 10) n
   where n = 'T595 Barrow Wight'),
  0,
  'the ruleset gate excludes a 2024 monster from a 2014 campaign'
);

select is(
  (select count(*)::integer from pg_temp.lib_names(array['t595-gate-on'], '2014', 'test-model-595', 10) n
   where n = 'T595 Grave Knight'),
  0,
  'vectors written by a different embedding model are never compared against this query'
);

-- Concept dedup has to happen BEFORE the top-K limit, or a DM who enables more
-- sourcebooks gets FEWER distinct suggestions -- the duplicate copies eat the
-- slots. Three eligible rows here (Ghost twice, plus Tomb Shade) and
-- match_count = 2: correct behaviour is two DISTINCT creatures, whereas
-- dedup-after-limit collapses two Ghosts into one and returns a single row.
select is(
  (select count(distinct n)::integer
   from pg_temp.lib_names(array['t595-dupe-a', 't595-dupe-b', 't595-gate-on'], '2014', 'test-model-595', 2) n),
  2,
  'same-creature-different-sourcebook duplicates collapse before the limit, so the top-K is not spent on one concept'
);

select lives_ok(
  $$ delete from public.library_monsters where id = 't595_off_1' $$,
  'deleting a library monster is not blocked by its embedding row'
);

select is(
  (select count(*)::integer from public.library_monster_embeddings where library_monster_id = 't595_off_1'),
  0,
  'deleting a library monster cascades to its embedding -- no orphan vector matching a monster that no longer exists'
);

-- ── Custom monsters: scoped by campaign, then by owner, never by source ────
-- Custom monsters are deliberately NOT source-gated: they are the DM's own
-- rows. #597 added monsters.campaign_id (NULL = every campaign the owner
-- runs; set = only that one), so match_custom_monsters now takes p_campaign_id
-- alongside p_owner_id and its WHERE mirrors match_custom_items' exactly
-- (20260805000005): campaign rows plus the campaign OWNER's global
-- (null-campaign) rows. Two boundaries are asserted below: ownership (as
-- before #597) and, new here, that scoping to one of the SAME owner's OTHER
-- campaigns is not enough to be retrieved -- ownership alone no longer
-- suffices once a row is scoped.
set local grimoire.bypass_quota = 'on';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('59500000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue595-dm@example.invalid',    '', '{}'::jsonb, '{}'::jsonb),
  ('59500000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue595-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- Two campaigns owned by the SAME DM, so the campaign-B exclusion below can't
-- be explained by the ownership check alone -- only the campaign scope does it.
insert into public.campaigns (id, user_id, name)
values
  ('59700000-0000-4000-8000-0000000000a0', '59500000-0000-4000-8000-000000000001', 'T597 Campaign A'),
  ('59700000-0000-4000-8000-0000000000b0', '59500000-0000-4000-8000-000000000001', 'T597 Campaign B');

insert into public.monsters (id, user_id, name, monster_type, ruleset, stat_block)
values
  ('59500000-0000-4000-8000-000000000010', '59500000-0000-4000-8000-000000000001', 'T595 Homebrew Horror',  'aberration', '2014', '{"challenge_rating":"7"}'::jsonb),
  ('59500000-0000-4000-8000-000000000011', '59500000-0000-4000-8000-000000000002', 'T595 Other User Beast', 'beast',      '2014', '{"challenge_rating":"7"}'::jsonb);

insert into public.monsters (id, user_id, campaign_id, name, monster_type, ruleset, stat_block)
values
  ('59700000-0000-4000-8000-000000000010', '59500000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-0000000000a0', 'T597 Campaign A Beast', 'beast', '2014', '{"challenge_rating":"2"}'::jsonb),
  ('59700000-0000-4000-8000-000000000011', '59500000-0000-4000-8000-000000000001', '59700000-0000-4000-8000-0000000000b0', 'T597 Campaign B Beast', 'beast', '2014', '{"challenge_rating":"2"}'::jsonb);

insert into public.monster_embeddings (monster_id, embedding, embedding_model, source_hash)
values
  ('59500000-0000-4000-8000-000000000010', pg_temp.vec(1, 0), 'test-model-595', 'h'),
  ('59500000-0000-4000-8000-000000000011', pg_temp.vec(1, 0), 'test-model-595', 'h'),
  ('59700000-0000-4000-8000-000000000010', pg_temp.vec(1, 0), 'test-model-595', 'h'),
  ('59700000-0000-4000-8000-000000000011', pg_temp.vec(1, 0), 'test-model-595', 'h');

select is(
  (select count(*)::integer
   from public.match_custom_monsters(
     pg_temp.vec(1, 0), '59700000-0000-4000-8000-0000000000a0'::uuid, '59500000-0000-4000-8000-000000000001'::uuid, '2014', 'test-model-595', 10)
   where name = 'T595 Other User Beast'),
  0,
  'another DM''s homebrew is never retrieved, however close its vector'
);

select is(
  (select count(*)::integer
   from public.match_custom_monsters(
     pg_temp.vec(1, 0), '59700000-0000-4000-8000-0000000000a0'::uuid, '59500000-0000-4000-8000-000000000001'::uuid, '2014', 'test-model-595', 10)
   where name = 'T595 Homebrew Horror'),
  1,
  'the campaign owner''s own NULL-campaign (global) homebrew is retrieved for any of their campaigns'
);

select is(
  (select count(*)::integer
   from public.match_custom_monsters(
     pg_temp.vec(1, 0), '59700000-0000-4000-8000-0000000000a0'::uuid, '59500000-0000-4000-8000-000000000001'::uuid, '2014', 'test-model-595', 10)
   where name = 'T597 Campaign B Beast'),
  0,
  'a monster scoped to a DIFFERENT campaign is never retrieved, even when that campaign has the same owner'
);

select is(
  (select count(*)::integer
   from public.match_custom_monsters(
     pg_temp.vec(1, 0), '59700000-0000-4000-8000-0000000000a0'::uuid, '59500000-0000-4000-8000-000000000001'::uuid, '2014', 'test-model-595', 10)
   where name = 'T597 Campaign A Beast'),
  1,
  'a monster scoped to the CURRENT campaign is retrieved'
);

select * from finish();
rollback;
