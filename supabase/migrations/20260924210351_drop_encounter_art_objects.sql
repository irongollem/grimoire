-- Drop encounters.art_objects (#909).
--
-- Art objects became a vault item type (item_type = 'art_object') in commit
-- 183ec567, which removed the inline art-object editor from encounters. The
-- column stayed behind with no writer: the loot editor binds only item ids
-- and currency pools, and the generator and document import always wrote
-- '{}'. Production held no non-empty value (0 of 34 encounters, 24 Sep 2026),
-- and no function, view or policy reads it, so there is nothing to migrate.
--
-- An encounter's art objects are vault items placed through item_ids, like
-- any other loot.

alter table public.encounters drop column if exists art_objects;
