-- Migration: tile_pack_style_reference_asset
--
-- The style references attached to every pack-phase generation cost more than
-- the tile they produce, and at full resolution they set the price of a pack.
--
-- Production `gpt-image-2` rows measure ~1500 image-input tokens per 1024x1024
-- reference (2988 for two, 4524 for three, 6060 for four). `styleReferences`
-- sends three, so a pack-phase call carried ~4500 input tokens at $8/1M —
-- roughly $0.030 — against a 196-token output worth $0.006. Five times the
-- price of the thing being made, on every call and every retry.
--
-- Image tokens scale with area, so the fix is resolution rather than count: a
-- 256x256 reference is 1/16 of that and still carries palette, material and
-- rendering style, which is all a style reference does. Geometry comes from the
-- prompt and the per-slot template, not from the reference.
--
-- Produced in the browser during proof normalization, where the tile is already
-- decoded, and stored beside the raw. The edge runtime has no image library and
-- adding one is not free: edge dependencies resolve over the network at deploy
-- time, and a CDN failure there fails the release (see the deploy step in
-- .github/workflows/test.yml).
--
-- `raw_path` stays untouched — it is the provenance record of what the model
-- actually returned, and normalization still runs from it.

alter table public.tile_pack_generation_jobs
  add column style_ref_path text;

comment on column public.tile_pack_generation_jobs.style_ref_path is
  'A 256x256 WebP reduction of an accepted proof tile, used as an image-input style reference for pack-phase generations. Only proof slots have one. Null falls back to raw_path, which is correct but ~16x the input tokens.';
