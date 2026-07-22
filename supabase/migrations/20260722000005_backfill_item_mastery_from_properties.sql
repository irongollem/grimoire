-- Migration: backfill_item_mastery_from_properties
-- Review follow-up (#553): before weapon mastery got its own column, the 8
-- mastery names were ordinary entries in items.properties. Move any legacy
-- value into items.mastery (first match wins; a weapon has exactly one
-- mastery in 2024 rules) and strip all mastery names from properties so the
-- editor's checkbox list (which no longer renders them) can't strand them.
-- Idempotent: no-op once properties contain no mastery names.

update items
set mastery = coalesce(mastery, (
      select p from unnest(properties) p
      where p in ('cleave','graze','nick','push','sap','slow','topple','vex')
      limit 1
    )),
    properties = (
      select coalesce(array_agg(p), '{}'::text[]) from unnest(properties) p
      where p not in ('cleave','graze','nick','push','sap','slow','topple','vex')
    )
where properties && array['cleave','graze','nick','push','sap','slow','topple','vex']::text[];
