-- Migration: normalise_foreign_stat_block_keys
-- Recover monster stat blocks written against a different key convention.

-- WHY. `monsters.stat_block` is jsonb and nothing validates its shape, so a row
-- can carry keys the app has never read. One did: an ingested creature whose
-- block used the long-form 5e-API convention throughout --
--
--     challenge        instead of challenge_rating
--     strength/dexterity/constitution/intelligence/wisdom/charisma
--                      instead of str/dex/con/int/wis/cha
--     special_traits   instead of special_abilities
--
-- so to the app that monster had no challenge rating, no ability scores and no
-- traits, while all of it sat in the row untouched. The visible symptom was the
-- whole Bestiary list blanking out on scroll, because every card called
-- crColor() and the CR was `undefined` (fixed separately, in the display layer,
-- which now renders "CR ???" instead of throwing).
--
-- The values are all present and correctly typed -- `challenge` is a string,
-- the ability scores are numbers, and `special_traits` is already the
-- {name, description} array `special_abilities` expects -- so this is a pure
-- rename that recovers the authored data rather than inventing any of it.
-- Verified against the real row before writing: CR 1/4 (corroborated by its own
-- xp: 50), six ability scores, four traits.
--
-- Written for the shape, not for that one id. Whatever ingested it may well
-- have produced others in a local or future environment, and a uuid-specific
-- UPDATE would silently no-op there while leaving the same broken rows behind.

-- Canonical keys WIN over recovered ones: `recovered || remainder` puts the
-- untouched row on the right, so a block that already has a real
-- challenge_rating keeps it and only its genuinely missing keys are filled from
-- the foreign spellings. jsonb_strip_nulls drops the entries whose foreign key
-- was absent, which would otherwise land as explicit JSON nulls and be worse
-- than the omission they replace.
--
-- Keys outside this mapping (`xp`, `armor_class_note`) are deliberately left
-- alone. They are not part of MonsterStatBlock, but they are the DM's data, they
-- break nothing, and dropping them is not this migration's business.
update public.monsters
set stat_block =
  jsonb_strip_nulls(jsonb_build_object(
    'challenge_rating',  stat_block->'challenge',
    'str',               stat_block->'strength',
    'dex',               stat_block->'dexterity',
    'con',               stat_block->'constitution',
    'int',               stat_block->'intelligence',
    'wis',               stat_block->'wisdom',
    'cha',               stat_block->'charisma',
    'special_abilities', stat_block->'special_traits'
  ))
  || (stat_block - 'challenge' - 'strength' - 'dexterity' - 'constitution'
                 - 'intelligence' - 'wisdom' - 'charisma' - 'special_traits')
where stat_block ?| array['challenge', 'strength', 'dexterity', 'constitution',
                          'intelligence', 'wisdom', 'charisma', 'special_traits'];
