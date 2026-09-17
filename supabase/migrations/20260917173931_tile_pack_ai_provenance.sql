-- Migration: tile_pack_ai_provenance
-- A generated tile pack records how it was generated (#889 S2, EPIC #611).
--
-- `tile-pack-generator` produced 20-60 images per run and marked none of them,
-- while seven sibling generators (generate-entity-image, forge-mini,
-- generate-npc, generate-trap, generate-location, generate-chronicle-image,
-- style-map) all call markGeneratedImage. Under the Art 50 work of #611 every
-- generated image carries an XMP packet with IPTC DigitalSourceType =
-- trainedAlgorithmicMedia; tiles carried nothing, server-side or client-side.
--
-- Nothing unmarked had shipped — production holds zero tile_pack_generation_runs
-- and the credit ledger has no tile_pack_generation row — but the Pro path is
-- live and would have marked nothing the first time a subscriber used it.
--
-- This column is the row-level half of that fix: the same `ai_provenance jsonb`
-- shape the other thirteen generator-fed tables carry (see
-- context/compliance/provenance-architecture.md), so `AiGeneratedBadge` can
-- render a pack the same way it renders an NPC. One object per pack rather than
-- per slot: this generator is single-provider and mints one generator type for
-- every slot in a run, so a per-slot record would repeat one fact 60 times.
--
-- Null means no known AI involvement — an uploaded pack, or one authored
-- through the `cartographer-pack` CLI. Not backfilled, because there is nothing
-- to backfill: no run has ever completed.

alter table public.user_tile_packs add column ai_provenance jsonb;

comment on column public.user_tile_packs.ai_provenance is
  'How this pack''s tiles were generated — provider, model, generatedAt — in the shape context/compliance/provenance-architecture.md defines. Null for uploaded or hand-authored packs. The per-tile XMP packet is the authoritative mark; this is the queryable, badge-rendering copy.';
