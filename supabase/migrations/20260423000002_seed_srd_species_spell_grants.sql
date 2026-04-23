-- Migration: seed_srd_species_spell_grants
-- Seeds innate spell grants for SRD PHB species that have subrace or species-wide spellcasting.
-- Only updates rows where granted_spells is still empty (no DM customisation).
-- spell_id is resolved by case-insensitive name lookup; stays null if spell not yet in vault.

-- ── Tiefling — Infernal Legacy (all subraces / no subraces) ───────────────────
UPDATE species
SET granted_spells = jsonb_build_array(
  jsonb_build_object(
    'spell_id',     (SELECT id::text FROM spells WHERE lower(name) = 'thaumaturgy'   LIMIT 1),
    'spell_name',   'Thaumaturgy',
    'uses_per_day', null,
    'resets_on',    null,
    'min_level',    1,
    'source_label', 'Tiefling — Infernal Legacy',
    'subrace',      null
  ),
  jsonb_build_object(
    'spell_id',     (SELECT id::text FROM spells WHERE lower(name) = 'hellish rebuke' LIMIT 1),
    'spell_name',   'Hellish Rebuke',
    'uses_per_day', 1,
    'resets_on',    'long_rest',
    'min_level',    3,
    'source_label', 'Tiefling — Infernal Legacy',
    'subrace',      null
  ),
  jsonb_build_object(
    'spell_id',     (SELECT id::text FROM spells WHERE lower(name) = 'darkness' LIMIT 1),
    'spell_name',   'Darkness',
    'uses_per_day', 1,
    'resets_on',    'long_rest',
    'min_level',    5,
    'source_label', 'Tiefling — Infernal Legacy',
    'subrace',      null
  )
)
WHERE lower(name) = 'tiefling'
  AND granted_spells = '[]'::jsonb;

-- ── Elf — High Elf: one free Wizard cantrip ───────────────────────────────────
UPDATE species
SET granted_spells = jsonb_build_array(
  jsonb_build_object(
    'spell_id',     null,
    'spell_name',   'Any Wizard Cantrip (player''s choice)',
    'uses_per_day', null,
    'resets_on',    null,
    'min_level',    1,
    'source_label', 'High Elf — Cantrip',
    'subrace',      'High Elf'
  )
)
WHERE lower(name) = 'elf'
  AND granted_spells = '[]'::jsonb;

-- ── Elf — Dark Elf (Drow): Dancing Lights, Faerie Fire, Darkness ─────────────
-- Only run if Elf row now has the High Elf grant (i.e. we just wrote it above),
-- or if the DM already has grants; we append rather than replace.
UPDATE species
SET granted_spells = granted_spells || jsonb_build_array(
  jsonb_build_object(
    'spell_id',     (SELECT id::text FROM spells WHERE lower(name) = 'dancing lights' LIMIT 1),
    'spell_name',   'Dancing Lights',
    'uses_per_day', null,
    'resets_on',    null,
    'min_level',    1,
    'source_label', 'Dark Elf — Drow Magic',
    'subrace',      'Dark Elf'
  ),
  jsonb_build_object(
    'spell_id',     (SELECT id::text FROM spells WHERE lower(name) = 'faerie fire' LIMIT 1),
    'spell_name',   'Faerie Fire',
    'uses_per_day', 1,
    'resets_on',    'long_rest',
    'min_level',    3,
    'source_label', 'Dark Elf — Drow Magic',
    'subrace',      'Dark Elf'
  ),
  jsonb_build_object(
    'spell_id',     (SELECT id::text FROM spells WHERE lower(name) = 'darkness' LIMIT 1),
    'spell_name',   'Darkness',
    'uses_per_day', 1,
    'resets_on',    'long_rest',
    'min_level',    5,
    'source_label', 'Dark Elf — Drow Magic',
    'subrace',      'Dark Elf'
  )
)
WHERE lower(name) = 'elf'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(granted_spells) g
    WHERE g->>'subrace' = 'Dark Elf'
  );

-- ── Gnome — Forest Gnome: Minor Illusion ─────────────────────────────────────
UPDATE species
SET granted_spells = jsonb_build_array(
  jsonb_build_object(
    'spell_id',     (SELECT id::text FROM spells WHERE lower(name) = 'minor illusion' LIMIT 1),
    'spell_name',   'Minor Illusion',
    'uses_per_day', null,
    'resets_on',    null,
    'min_level',    1,
    'source_label', 'Forest Gnome — Natural Illusionist',
    'subrace',      'Forest Gnome'
  )
)
WHERE lower(name) = 'gnome'
  AND granted_spells = '[]'::jsonb;
