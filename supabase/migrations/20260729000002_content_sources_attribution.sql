-- Migration: content_sources_attribution
-- Per-source licence catalogue for shared content, plus the RPC the Reliquary's
-- Licences tab reads and a backfill of source_license onto existing shared rows.

-- ── 1. The catalogue ──────────────────────────────────────────────────────
--
-- One row per source document we host content from. Everything the app needs to
-- attribute a body of content correctly — who published it, under which licence,
-- and the copyright notice that licence obliges us to reproduce — lives here, so
-- attribution is a join rather than something someone has to remember.
--
-- Why a catalogue instead of widening the six content tables: the facts are
-- per-document, not per-row. Copying a publisher's copyright line onto 3,500
-- monster rows would mean 3,500 places for it to drift out of sync with the one
-- thing that must never be wrong.
--
-- Deliberately NOT named anything SRD-flavoured. Only ~660 of our ~3,540 shared
-- monsters are actually WotC SRD; the rest is Kobold Press and EN Publishing
-- material under OGL 1.0a. Filing it under an "SRD" banner is precisely the
-- misrepresentation the OGL and CC-BY attribution terms forbid.

create table if not exists "public"."content_sources" (
  -- OUR internal source_document_key as stored on the content rows. Several of
  -- these are pre-v2 Open5e slugs ("cc", "menagerie", "dmag") that are live in
  -- production and must not be "cleaned up" to match upstream.
  "key"                text primary key,
  -- The current Open5e v2 document key when it differs from ours; null for
  -- content that did not come from Open5e at all.
  "open5e_key"         text,
  "title"              text not null,
  "publisher"          text not null,
  -- Open5e's own licence keys, e.g. {ogl-10a} or {cc-by-40,ogl-10a}. Empty means
  -- content we wrote ourselves, which carries no third-party licence — an empty
  -- array is a real, meaningful state here, never a stand-in for "unknown".
  "license_keys"       text[] not null default '{}',
  -- The copyright line reproduced verbatim in the OGL section 15 chain (or the
  -- CC-BY credit). Curated and legally reviewed — the seed script is forbidden
  -- from writing this column, because a machine-blanked notice is a licence
  -- breach that nothing would alert us to.
  "copyright_notice"   text,
  -- The publisher's own page for the product, so a reader can reach the source.
  "product_url"        text,
  "gamesystem"         text,
  -- False parks a source we may not host: it stays visible to the ingestion
  -- guard and to this catalogue rather than quietly disappearing.
  "is_redistributable" boolean not null default true,
  -- True where upstream metadata is wrong or absent and we maintain this row by
  -- hand; seed-content-sources.ts skips these rows outright. Without it, the next
  -- seed run would quietly reset Black Flag's licence from ORC back to Open5e's
  -- incorrect CC-BY tag, and nothing would notice.
  "is_metadata_curated" boolean not null default false,
  "sort_order"         integer not null default 100,
  "created_at"         timestamptz not null default now(),
  "updated_at"         timestamptz not null default now()
);

create trigger content_sources_updated_at
  before update on "public"."content_sources"
  for each row execute procedure update_updated_at();

-- RLS: readable by anyone, writable only by app admins.
--
-- Licence notices exist to be read — CC-BY and the OGL both require the credit
-- to travel with the content — so there is nothing to gate and no user_id to
-- gate it on. Anon reads are allowed deliberately: if these notices ever need to
-- appear outside the authenticated app, the data should not be what blocks it.
alter table "public"."content_sources" enable row level security;

create policy "content_sources_select" on "public"."content_sources"
  for select to anon, authenticated using (true);

create policy "content_sources_insert" on "public"."content_sources"
  for insert to authenticated with check (private.is_app_admin());

create policy "content_sources_update" on "public"."content_sources"
  for update to authenticated using (private.is_app_admin());

create policy "content_sources_delete" on "public"."content_sources"
  for delete to authenticated using (private.is_app_admin());

-- ── 2. The catalogue itself ───────────────────────────────────────────────
--
-- Every notice below was checked against a primary source — the publisher's own
-- OGL page, the licence document, or the book's own legal page — never
-- reconstructed from memory or from a search snippet. Where the exact section 15
-- line could not be reached at a primary source, the notice states only what is
-- verifiable (product, publisher, licence) rather than inventing a year or an
-- author list: an incomplete notice is a gap, a fabricated one is a false
-- copyright statement. Those rows are marked "SECTION 15 UNVERIFIED" below and
-- are tracked for completion.

insert into "public"."content_sources"
  ("key", "open5e_key", "title", "publisher", "license_keys", "copyright_notice", "product_url", "gamesystem", "is_redistributable", "is_metadata_curated", "sort_order")
values
  -- Wizards of the Coast. The 5.1 line is verbatim from Wizards' own SRD-OGL_V5.1.pdf
  -- (note: 2016, not the 2023 date often quoted second-hand). The 5.2.1 line is the
  -- attribution statement Wizards' SRD_CC_v5.2.1.pdf requires word-for-word, and which
  -- it also asks not be embellished with any further credit to Wizards.
  ('srd-2014', 'srd-2014', 'System Reference Document 5.1', 'Wizards of the Coast',
   '{cc-by-40,ogl-10a}',
   'System Reference Document 5.1 Copyright 2016, Wizards of the Coast, Inc.; Authors Mike Mearls, Jeremy Crawford, Chris Perkins, Rodney Thompson, Peter Lee, James Wyatt, Robert J. Schwalb, Bruce R. Cordell, Chris Sims, and Steve Townshend, based on original material by E. Gary Gygax and Dave Arneson.',
   'https://www.dndbeyond.com/srd', '5e-2014', true, false, 10),

  ('srd-2024', 'srd-2024', 'System Reference Document 5.2.1', 'Wizards of the Coast',
   '{cc-by-40}',
   'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
   'https://www.dndbeyond.com/srd', '5e-2024', true, false, 20),

  -- Kobold Press. "Tome of Beasts" and "Creature Codex" are verbatim from Kobold
  -- Press's own accumulated section 15 page. The Creature Codex line reads "Creature
  -- Code" on that page — reproduced exactly as published, because section 15 asks for
  -- the exact text of the notice, not a corrected one.
  ('tob', 'tob', 'Tome of Beasts', 'Kobold Press', '{ogl-10a}',
   'Tome of Beasts © 2016 Open Design; Authors: Chris Harris, Dan Dillon, Rodrigo Garcia Carmona, and Wolfgang Baur.',
   'https://koboldpress.com/tome-of-beasts/', '5e-2014', true, false, 30),

  ('cc', 'ccdx', 'Creature Codex', 'Kobold Press', '{ogl-10a}',
   'Creature Code © 2018 Open Design; Authors: Wolfgang Baur, Jeremy Hochhalter, Chris Lockey, Joel Russ, and Jon Sawatsky.',
   'https://koboldpress.com/kpstore/product/creature-codex-for-5th-edition-dnd/', '5e-2014', true, false, 31),

  -- SECTION 15 UNVERIFIED — publisher and licence confirmed, exact notice not yet
  -- reachable at a primary source. States only what is verifiable.
  ('tob-2023', 'tob-2023', 'Tome of Beasts 1 (2023 Edition)', 'Kobold Press', '{ogl-10a}',
   'Tome of Beasts 1 (2023 Edition), published by Kobold Press (Open Design LLC). Used under the Open Game License 1.0a.',
   'https://koboldpress.com/kpstore/product/tome-of-beasts-1-2023-edition-hardcover/', '5e-2014', true, false, 32),

  ('tob2', 'tob2', 'Tome of Beasts 2', 'Kobold Press', '{ogl-10a}',
   'Tome of Beasts 2, published by Kobold Press (Open Design LLC). Used under the Open Game License 1.0a.',
   'https://koboldpress.com/tome-of-beasts-2/', '5e-2014', true, false, 33),

  ('tob3', 'tob3', 'Tome of Beasts 3', 'Kobold Press', '{ogl-10a}',
   'Tome of Beasts 3, published by Kobold Press (Open Design LLC). Used under the Open Game License 1.0a.',
   'https://koboldpress.com/tome-of-beasts-3/', '5e-2014', true, false, 34),

  ('toh', 'toh', 'Tome of Heroes', 'Kobold Press', '{ogl-10a}',
   'Tome of Heroes, published by Kobold Press (Open Design LLC). Used under the Open Game License 1.0a.',
   'https://koboldpress.com/kpstore/product/tome-of-heroes-for-5th-edition/', '5e-2014', true, false, 35),

  ('dmag', 'deepm', 'Deep Magic for 5th Edition', 'Kobold Press', '{ogl-10a}',
   'Deep Magic for 5th Edition, published by Kobold Press (Open Design LLC). Used under the Open Game License 1.0a.',
   'https://koboldpress.com/kpstore/product/deep-magic-for-5th-edition-hardcover/', '5e-2014', true, false, 36),

  ('dmag-e', 'deepmx', 'Deep Magic Extended', 'Kobold Press', '{ogl-10a}',
   'Deep Magic Extended, published by Kobold Press (Open Design LLC). Used under the Open Game License 1.0a.',
   'https://koboldpress.com/deepmagic', '5e-2014', true, false, 37),

  ('warlock', 'wz', 'Warlock Zine', 'Kobold Press', '{ogl-10a}',
   'Warlock, published by Kobold Press (Open Design LLC). Used under the Open Game License 1.0a.',
   'https://koboldpress.com/kpstore/product-category/all-products/warlock-5th-edition-dnd/', '5e-2014', true, false, 38),

  ('kp', 'kp', 'Kobold Press Compilation', 'Kobold Press', '{ogl-10a}',
   'Kobold Press Compilation, published by Kobold Press (Open Design LLC). Used under the Open Game License 1.0a.',
   'https://koboldpress.com/', '5e-2014', true, false, 39),

  -- Black Flag is the one place Open5e's metadata is demonstrably wrong: it tags the
  -- BFRD cc-by-40, but Kobold Press's own announcement says it "falls under the ORC
  -- license", and Open5e's taxonomy has no ORC entry to tag it with. Curated so a
  -- re-seed cannot silently revert it.
  ('blackflag', 'bfrd', 'Black Flag Reference Document', 'Kobold Press', '{orc}',
   'Black Flag Reference Document, © 2023 Open Design LLC d/b/a Kobold Press. Used under the ORC License.',
   'https://koboldpress.com/black-flag-reference-document/', '5e-2014', true, true, 40),

  -- EN Publishing. Both lines are verbatim from EN Publishing's own guidance on how
  -- they wish to be credited.
  ('menagerie', 'a5e-mm', 'Level Up: Advanced 5th Edition Monstrous Menagerie', 'EN Publishing', '{ogl-10a}',
   'Level Up: Advanced 5th Edition Monstrous Menagerie. Copyright 2021, EN Publishing. www.levelup5e.com',
   'https://enpublishingrpg.com/collections/level-up-advanced-5th-edition-a5e/products/level-up-monstrous-menagerie-a5e', '5e-2014', true, false, 50),

  ('a5e', 'a5e-ag', 'Level Up: Advanced 5th Edition Adventurer''s Guide', 'EN Publishing', '{cc-by-40,ogl-10a}',
   'Level Up: Advanced 5th Edition Adventurer''s Guide. Copyright 2021, EN Publishing. www.levelup5e.com',
   'https://a5esrd.com/a5esrd', '5e-2014', true, false, 51),

  -- Green Ronin. Verbatim from the book's own OGL section 15 (page 144). Note the
  -- book declares only its rules and mechanics as Open Game Content; proper names and
  -- lore are Product Identity, so only stat blocks are safe to reproduce.
  ('taldorei', 'tdcs', 'Critical Role: Tal''Dorei Campaign Setting', 'Green Ronin Publishing', '{ogl-10a}',
   'Critical Role: Tal''Dorei Campaign Setting, Copyright 2017, Green Ronin Publishing, LLC. Authors: Matt Mercer with James Haeck.',
   null, '5e-2014', true, false, 60),

  ('o5e', 'open5e', 'Open5e Originals', 'Open5e', '{ogl-10a}',
   'Open5e Originals, published by Open5e. Used under the Open Game License 1.0a.',
   'https://open5e.com/', '5e-2014', true, false, 70),

  -- Our own content. An empty licence array is the accurate state: there is no
  -- third-party licence to name. The bundled equipment list is mixed provenance, so
  -- its notice says so rather than claiming the whole set is original.
  ('grimoire-bundled', null, 'Grimoire bundled equipment & services', 'Grimoire', '{cc-by-40}',
   'Includes material from the System Reference Document 5.1 by Wizards of the Coast LLC, used under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode). Remaining entries are original to Grimoire.',
   null, null, true, true, 80),

  ('grimoire-system', null, 'Grimoire class system data', 'Grimoire', '{}',
   null, null, null, true, true, 81),

  ('grimoire-2024-compatibility', null, 'Grimoire 2024 compatibility definitions', 'Grimoire', '{}',
   null, null, null, true, true, 82),

  ('dnd-free-rules-2024', null, 'D&D Free Rules (2024)', 'Wizards of the Coast', '{cc-by-40}',
   'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
   'https://www.dndbeyond.com/srd', '5e-2024', true, true, 83)
on conflict ("key") do nothing;

-- ── 3. Backfill source_license onto the shared rows ───────────────────────
--
-- The catalogue is the authority, so this overwrites rather than filling gaps:
-- system_classes carried 'CC-BY-4.0' in one row while srd_spells carried
-- 'cc-by-40, ogl-10a' in another, and two spellings of the same fact is one
-- spelling too many. Rows whose source has no third-party licence are left null,
-- which is the true answer, not a missing one.

update "public"."srd_monsters"   m  set source_license = array_to_string(cs.license_keys, ', ')
  from "public"."content_sources" cs where cs.key = m.source_document_key  and cardinality(cs.license_keys) > 0;
update "public"."srd_spells"     s  set source_license = array_to_string(cs.license_keys, ', ')
  from "public"."content_sources" cs where cs.key = s.source_document_key  and cardinality(cs.license_keys) > 0;
update "public"."srd_items"      i  set source_license = array_to_string(cs.license_keys, ', ')
  from "public"."content_sources" cs where cs.key = i.source_document_key  and cardinality(cs.license_keys) > 0;
update "public"."srd_species"    sp set source_license = array_to_string(cs.license_keys, ', ')
  from "public"."content_sources" cs where cs.key = sp.source_document_key and cardinality(cs.license_keys) > 0;
update "public"."srd_rules"      r  set source_license = array_to_string(cs.license_keys, ', ')
  from "public"."content_sources" cs where cs.key = r.source_document_key  and cardinality(cs.license_keys) > 0;
update "public"."system_classes" c  set source_license = array_to_string(cs.license_keys, ', ')
  from "public"."content_sources" cs where cs.key = c.source_document_key  and cardinality(cs.license_keys) > 0;

-- ── 4. What the Licences tab reads ────────────────────────────────────────
--
-- One row per source that actually has content in the database, with the
-- catalogue's attribution facts and a per-kind tally.
--
-- SECURITY INVOKER on purpose: every shared content table is already world-
-- readable under its own RLS, so there is nothing here a caller could not read
-- directly. A SECURITY DEFINER function would buy nothing and would land on the
-- security advisor's list as an unauthorised RPC surface.
--
-- The join is LEFT, not INNER, and deliberately so: a source that appears in the
-- content tables but is missing from the catalogue must still surface — labelled
-- "Uncatalogued source" — instead of silently vanishing from the very page whose
-- job is to prove nothing is unattributed.
create or replace function public.get_content_licenses()
returns table (
  key              text,
  open5e_key       text,
  title            text,
  publisher        text,
  license_keys     text[],
  copyright_notice text,
  product_url      text,
  gamesystem       text,
  monster_count    bigint,
  spell_count      bigint,
  item_count       bigint,
  species_count    bigint,
  rule_count       bigint,
  class_count      bigint,
  entry_count      bigint,
  sort_order       integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with tallies as (
    select source_document_key as k, 'monster'::text as kind, count(*) as n from srd_monsters   group by 1
    union all
    select source_document_key, 'spell',   count(*) from srd_spells    group by 1
    union all
    select source_document_key, 'item',    count(*) from srd_items     group by 1
    union all
    select source_document_key, 'species', count(*) from srd_species   group by 1
    union all
    select source_document_key, 'rule',    count(*) from srd_rules     group by 1
    union all
    select source_document_key, 'class',   count(*) from system_classes group by 1
  ),
  rolled as (
    select
      k,
      coalesce(sum(n) filter (where kind = 'monster'), 0) as monster_count,
      coalesce(sum(n) filter (where kind = 'spell'),   0) as spell_count,
      coalesce(sum(n) filter (where kind = 'item'),    0) as item_count,
      coalesce(sum(n) filter (where kind = 'species'), 0) as species_count,
      coalesce(sum(n) filter (where kind = 'rule'),    0) as rule_count,
      coalesce(sum(n) filter (where kind = 'class'),   0) as class_count,
      coalesce(sum(n), 0)                                 as entry_count
    from tallies
    where k is not null
    group by k
  )
  select
    r.k,
    cs.open5e_key,
    coalesce(cs.title, r.k),
    coalesce(cs.publisher, 'Uncatalogued source'),
    coalesce(cs.license_keys, '{}'::text[]),
    cs.copyright_notice,
    cs.product_url,
    cs.gamesystem,
    r.monster_count,
    r.spell_count,
    r.item_count,
    r.species_count,
    r.rule_count,
    r.class_count,
    r.entry_count,
    coalesce(cs.sort_order, 999)
  from rolled r
  left join content_sources cs on cs.key = r.k
  order by coalesce(cs.sort_order, 999), coalesce(cs.title, r.k);
$$;

comment on function public.get_content_licenses() is
  'Per-source attribution + content tallies for the Reliquary Licences tab. Sources present in content but absent from content_sources surface as "Uncatalogued source" rather than being dropped.';
