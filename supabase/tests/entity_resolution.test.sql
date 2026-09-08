begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

-- Resolving a name from an imported page to a real monster (#837) or item
-- (#838). The point of these functions is that a DM who already owns a "Grell"
-- gets *theirs* rather than a hollow duplicate, so what needs pinning is the
-- ranking, the normalisation, and the fact that neither function will resolve
-- anything for someone who is not a DM of the campaign.
--
-- The fixture names are invented rather than real creatures on purpose: an
-- earlier version used "Giant Rat" and resolved to a *seeded* `srd_giant_rat`
-- instead of its own row. A test that can be decided by whatever the seed
-- happens to hold is testing the seed.

select has_function('public', 'resolve_monster_references', array['uuid', 'text[]'], 'creature names resolve through an RPC');
select has_function('public', 'resolve_item_references', array['uuid', 'text[]'], 'item names resolve through an RPC');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('83700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resolve-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('83700000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resolve-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('83700000-0000-4000-8000-000000000010', '83700000-0000-4000-8000-000000000001', 'Resolution campaign');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('83700000-0000-4000-8000-000000000010', '83700000-0000-4000-8000-000000000001', 'dm', 'Resolve DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- The DM's own vault. "Testwyrm" exists here and nowhere else — it is not OGL
-- content, so the shared library legitimately cannot carry it, which is exactly
-- the case that makes searching the DM's own rows first load-bearing rather
-- than a preference.
insert into public.monsters (id, user_id, campaign_id, name, monster_type, stat_block)
values
  ('83700000-0000-4000-8000-000000000020', '83700000-0000-4000-8000-000000000001', '83700000-0000-4000-8000-000000000010', 'Testwyrm', 'aberration', '{}'::jsonb),
  ('83700000-0000-4000-8000-000000000021', '83700000-0000-4000-8000-000000000001', '83700000-0000-4000-8000-000000000010', 'Duplicant', 'humanoid', '{}'::jsonb);

-- The shared library. "Duplicant" is deliberately in BOTH corpora so the ranking
-- has something to choose between; an unclaimed name would prove nothing.
insert into public.library_monsters (id, name, monster_type, source, is_shared, open5e_import, tags, ruleset, conceptual_key, source_document_key, source_record_key, provenance)
values
  ('resolve_test_duplicant', 'Duplicant', 'humanoid', 'test', true, false, '{}', '2014', 'duplicant', 'test', 'duplicant', '{}'::jsonb),
  ('resolve_test_testrat', 'Testrat', 'beast', 'test', true, false, '{}', '2014', 'testrat', 'test', 'testrat', '{}'::jsonb);

insert into public.items (id, user_id, campaign_id, name, item_type, rarity, requires_attunement, properties, spell_ids, description, tags, is_arcane_focus, provenance, content_player_writable)
values ('83700000-0000-4000-8000-000000000030', '83700000-0000-4000-8000-000000000001', '83700000-0000-4000-8000-000000000010', 'Potion of Testing', 'consumable', 'common', false, '{}', '{}', '', '{}', false, '{}'::jsonb, false);

insert into public.library_items (id, name, item_type, rarity, requires_attunement, properties, description, tags, is_arcane_focus, source_document_key, source_record_key, provenance)
values ('resolve_test_rope', 'Testcord', 'gear', 'mundane', false, '{}', '', '{}', false, 'test', 'testcord', '{}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '83700000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── Ranking ────────────────────────────────────────────────────────────────
--
-- A DM who has built their own version wants theirs, with their notes and art.
-- The shared library is the fallback, never the winner.

select is(
  (select source from public.resolve_monster_references('83700000-0000-4000-8000-000000000010', array['Duplicant'])),
  'campaign', 'a name in both corpora resolves to the DM''s own monster'
);
select is(
  (select monster_id from public.resolve_monster_references('83700000-0000-4000-8000-000000000010', array['Duplicant'])),
  '83700000-0000-4000-8000-000000000021'::uuid, 'and it is their row, not a same-named library one'
);
select is(
  (select source from public.resolve_monster_references('83700000-0000-4000-8000-000000000010', array['Testrat'])),
  'library', 'a name only the library has falls back to the library'
);
select is(
  (select library_monster_id from public.resolve_monster_references('83700000-0000-4000-8000-000000000010', array['Testrat'])),
  'resolve_test_testrat', 'a library hit carries the text id, since shared content is not keyed by uuid'
);
select ok(
  (select monster_id is null from public.resolve_monster_references('83700000-0000-4000-8000-000000000010', array['Testrat'])),
  'and leaves the uuid column empty rather than inventing one'
);

-- ── Normalisation ──────────────────────────────────────────────────────────
--
-- Every one of these is a phrasing that occurs in a real adventure page.

select is(
  (select matched_name from public.resolve_monster_references('83700000-0000-4000-8000-000000000010', array['The Duplicants'])),
  'Duplicant', 'a leading article and a plural both fall away'
);
select is(
  (select matched_name from public.resolve_monster_references('83700000-0000-4000-8000-000000000010', array['two testrats'])),
  'Testrat', 'a quantity prefix resolves through the suffix match'
);
select is(
  (select match_kind from public.resolve_monster_references('83700000-0000-4000-8000-000000000010', array['Frosted duplicant'])),
  'contains', 'a book-specific qualifier resolves as an approximate match, and says so'
);
select is(
  (select matched_name from public.resolve_item_references('83700000-0000-4000-8000-000000000010', array['Potions of testing'])),
  'Potion of Testing', 'the head noun of an "X of Y" item name is de-pluralised'
);
select is(
  (select matched_name from public.resolve_item_references('83700000-0000-4000-8000-000000000010', array['a potion of testing'])),
  'Potion of Testing', 'an article on an item name falls away too'
);

-- A whole-word suffix anchor, so a qualifier in front matches and a shorter
-- name buried inside a longer word does not.
select is(
  (select count(*)::integer from public.resolve_item_references('83700000-0000-4000-8000-000000000010', array['Supertestcord'])),
  0, 'a name is matched as a whole word, never buried inside a longer one'
);

-- ── Absence is an answer ───────────────────────────────────────────────────

select is(
  (select count(*)::integer from public.resolve_monster_references('83700000-0000-4000-8000-000000000010', array['Nonexistent Beast'])),
  0, 'an unmatched name is simply absent, which the importer reads as "create it fresh"'
);
select is(
  (select count(*)::integer from public.resolve_monster_references('83700000-0000-4000-8000-000000000010', array[]::text[])),
  0, 'an empty request returns nothing rather than everything'
);
select is(
  (select count(*)::integer from public.resolve_monster_references('83700000-0000-4000-8000-000000000010', array['Duplicant', 'Duplicant'])),
  1, 'a repeated name returns one row, not two'
);

-- ── The gate ───────────────────────────────────────────────────────────────
--
-- Both functions are SECURITY DEFINER and bypass RLS, so the campaign check is
-- the only thing standing between a caller and another DM's vault.

select set_config('request.jwt.claim.sub', '83700000-0000-4000-8000-000000000002', true);
select is(
  (select count(*)::integer from public.resolve_monster_references('83700000-0000-4000-8000-000000000010', array['Duplicant', 'Testrat'])),
  0, 'someone who is not a DM of the campaign resolves nothing at all'
);

select * from finish();
rollback;
