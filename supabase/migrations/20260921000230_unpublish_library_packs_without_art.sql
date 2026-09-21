-- Migration: unpublish_library_packs_without_art
-- Returns every published library tile pack holding no art at all to `draft` (#900).
--
-- WHY THESE ROWS WERE EVER PUBLISHED
--
-- `publish_library_pack` re-validates the manifest server-side before flipping
-- the status, which reads like a real gate and is documented as one in
-- context/features/cartographer.md. But the check it runs is `validatePack`,
-- and `validatePack` is **declaration-based**: a slot counts as present when
-- the manifest names it with a URL, and the bytes behind that URL are never
-- consulted (src/cartographer/validatePack.ts). The ten packs migrated into
-- the library by #889 S7 declare their full slot list — that is faithfully
-- what the static packs always declared — and contain no images whatsoever.
-- So they passed a gate that was, for this class of defect, blind.
--
-- The result reached DMs: measured against production on 21 Sep 2026, twelve
-- packs were `published` and ten of them drew nothing but procedural
-- placeholders. `packLoader.ts` substitutes per tile and nothing breaks, which
-- is exactly why this went unnoticed for three days — a picker where five in
-- six entries are indistinguishable grey is a quiet failure, not a loud one.
--
-- #900 fixes the gate itself: it now counts slots carrying bytes
-- (`hasCompleteArt` in src/cartographer/packCoverage.ts) instead of slots the
-- manifest merely claims. This migration is the other half — the gate can only
-- refuse *future* publications, and these rows are already through it.
--
-- `draft`, NOT `archived`. The two are not interchangeable here:
-- `unpublish_library_pack` writes `archived`, which means retired — a pack
-- that had its run and is being withdrawn. These packs never had art in the
-- first place. `draft` is the honest description, and it is also the status
-- the admin surface treats as "still being authored", which is what an admin
-- filling these in is about to do.
--
-- `wood-interior` is deliberately NOT caught by this. It holds 24 real tiles
-- covering its required slots; it is incomplete against its own 44-slot
-- declaration, not empty. The predicate below asks whether a pack has *any*
-- art, so partially-drawn packs keep their publication.
--
-- Idempotent and safe on replay: on a fresh CI database `library_tile_packs`
-- is empty (the twelve rows come from scripts/seed-library-tile-packs.ts, not
-- from a migration), so this updates zero rows there and the exact set it
-- touches in production is whatever is genuinely artless at apply time.

update public.library_tile_packs
set status = 'draft'
where status = 'published'
  and not exists (
    select 1
    from jsonb_each(coalesce(manifest -> 'assets', '{}'::jsonb)) as category(name, slots)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(category.slots) = 'array' then category.slots else '[]'::jsonb end
    ) as slot(entry)
    where coalesce((slot.entry ->> 'byteSize')::numeric, 0) > 0
  );
