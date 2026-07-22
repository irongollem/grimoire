-- Migration: remap_srd_art_ids
-- Fix art orphaned by the v2 identity transition (found by post-epic review).
--
-- 20260722000002 retired the legacy wotc-srd srd_spells/srd_monsters rows, but
-- srd_spell_art/srd_monster_art reference those rows by srd_id and were not
-- remapped. The v2 rows' ids are the old id with an extra 'srd_' prefix
-- (stableAppId over a v2 record key that already starts with 'srd_'), so the
-- remap is deterministic: 'srd_' || srd_id. Verified live before writing this:
-- 222/222 monster-art and 52/52 spell-art orphans remap cleanly.
--
-- The monster seed's art backfill also ran BEFORE the transition, patching the
-- doomed legacy rows — so the reseeded srd-2014/srd-2024 monsters currently
-- display no art. Step 2 restores the denormalized art from canonical rows.
-- Idempotent: every statement is a no-op once applied.

-- 1) Remap art references (canonical AND per-DM override rows).
update srd_monster_art a
set srd_id = 'srd_' || a.srd_id
where not exists (select 1 from srd_monsters m where m.id = a.srd_id)
  and exists (select 1 from srd_monsters m2 where m2.id = 'srd_' || a.srd_id);

update srd_spell_art a
set srd_id = 'srd_' || a.srd_id
where not exists (select 1 from srd_spells s where s.id = a.srd_id)
  and exists (select 1 from srd_spells s2 where s2.id = 'srd_' || a.srd_id);

-- 2) Restore denormalized canonical art onto the reseeded rows.
update srd_monsters m
set image_url = a.image_url,
    portrait_focal_point = a.portrait_focal_point
from srd_monster_art a
where a.is_canonical
  and a.srd_id = m.id
  and m.image_url is null;

update srd_spells s
set image_url = a.image_url,
    image_focal_point = a.portrait_focal_point
from srd_spell_art a
where a.is_canonical
  and a.srd_id = s.id
  and s.image_url is null;
