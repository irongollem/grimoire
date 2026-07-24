-- Migration: remap_discovered_monsters_srd_v2_ids
-- The SRD v2 identity transition (#553, 20260722000002) retired the v1 srd ids
-- and reseeded srd_monsters under new ids (srd_ancient_blue_dragon ->
-- srd_srd_ancient_blue_dragon). It remapped character_spells, spell_cast_records
-- and companions, and 20260722000004 remapped the art tables — but
-- discovered_monsters.srd_slug was missed. Every previously-discovered SRD
-- creature therefore pointed at a retired id that no longer matches
-- srd_monsters.id, so the Player Bestiary resolved them all to "Unknown
-- creature".
--
-- Reapply the same `'srd_' || old_id` prefix rule 20260722000004 used, but ONLY
-- for rows whose current slug is unresolved AND whose prefixed form resolves to a
-- real srd_monsters row. This can never touch an already-correct row, a custom
-- (monster_id) discovery, or a slug with no v2 counterpart — and it is idempotent
-- (a re-run finds nothing left to remap, and it is a harmless no-op on a fresh DB
-- that has no legacy discoveries).

update discovered_monsters dm
set srd_slug = 'srd_' || dm.srd_slug
where dm.srd_slug is not null
  and not exists (select 1 from srd_monsters sm  where sm.id  = dm.srd_slug)
  and     exists (select 1 from srd_monsters sm2 where sm2.id = 'srd_' || dm.srd_slug);
