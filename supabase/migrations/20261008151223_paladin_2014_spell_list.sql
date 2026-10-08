-- The 2014 Paladin spell list was missing from the shared library: Open5e's v2
-- data tags none of its srd-2014 spells with the Paladin class, so the library
-- held no 2014 Paladin spells at all (0 of 319, against 38 in srd-2024). Every
-- 2014 Paladin's spell picker came up empty, and validate_character_spell_source
-- refused their base-list spells: Bless and Command on an Oath of the Ancients
-- Paladin in the maintainer's own campaign, among them (8 Oct 2026).
--
-- These are the 31 spells of the SRD 5.1 Paladin list, the same set as
-- src/data/paladinSpellDelta2014.ts, which the Open5e import now applies so a
-- re-seed keeps them. The base list only: an oath's spells are granted
-- always-prepared, which the spell-source check already admits, and putting
-- them on the class list would hand every oath every other oath's spells.
--
-- Matched by source and name, because the ids are the import's (srd_srd_*).
-- A stack whose library is empty (CI replays migrations before any seed)
-- updates nothing, which is correct.
update public.library_spells
set classes = array_append(classes, 'Paladin')
where source = 'srd-2014'
  and not ('Paladin' = any(classes))
  and name in (
  'Bless',
  'Command',
  'Cure Wounds',
  'Detect Evil and Good',
  'Detect Magic',
  'Detect Poison and Disease',
  'Divine Favor',
  'Heroism',
  'Protection from Evil and Good',
  'Purify Food and Drink',
  'Shield of Faith',
  'Aid',
  'Branding Smite',
  'Find Steed',
  'Lesser Restoration',
  'Locate Object',
  'Magic Weapon',
  'Protection from Poison',
  'Zone of Truth',
  'Create Food and Water',
  'Daylight',
  'Dispel Magic',
  'Magic Circle',
  'Remove Curse',
  'Revivify',
  'Banishment',
  'Death Ward',
  'Locate Creature',
  'Dispel Evil and Good',
  'Geas',
  'Raise Dead'
  );
