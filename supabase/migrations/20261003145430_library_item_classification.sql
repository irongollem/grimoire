-- Library item classification (#956).
--
-- Brings the rows already in library_items in line with what the corrected
-- Open5e mapper (src/lib/library/open5eImport.ts) and bundled data
-- (src/data/services.ts) now produce, so production matches a fresh
-- `npm run seed-library-items` without a re-seed. Every statement is scoped
-- to the rows that mapping covers and is a no-op once they are right.
--
-- Vault copies a DM made with Customize (`items`) are left alone: they belong
-- to accounts and may have been edited on purpose.

-- 1) Shields. The 2014 SRD files magic shields under their own `Shield`
--    category, which the mapper did not know, so they landed as wondrous
--    items; the 2024 SRD calls its Shield `heavy` armor and its magic shields
--    `Armor`, so those landed as body armor. Either way the shield bonus never
--    applied, and an equipped 2024 Shield read as armor with base AC 2. Whole
--    word only, as in the mapper: "Brooch of Shielding" is not a shield.
update library_items
set item_type = 'shield'
where source_document_key in ('srd-2014', 'srd-2024')
  and item_type in ('wondrous_item', 'armor')
  and (subtype ilike 'shield' or name ~* '\mshield\M');

-- 2) Magic ammunition (the 2014 Arrow of Slaying) was a wondrous item.
update library_items
set item_type = 'ammunition'
where source_document_key in ('srd-2014', 'srd-2024')
  and item_type = 'wondrous_item'
  and subtype ilike 'ammunition';

-- 3) A "+N" armor or shield carried its base armor's AC, because Open5e embeds
--    the base and states the bonus only in the name: "Chain Mail (+1)" was AC
--    16, "Shield (+1)" a +2 shield. Add the bonus to the leading integer, the
--    form parseArmorClass / parseShieldAcBonus read. Only rows whose AC still
--    equals their base armor's are touched, so this cannot apply twice.
update library_items m
set armor_class = regexp_replace(
  m.armor_class,
  '^\s*(\d+)',
  ((substring(m.armor_class from '^\s*(\d+)'))::int
    + (substring(m.name from '\+\s*(\d)'))::int)::text
)
from library_items b
where m.source_document_key = 'srd-2024'
  and m.item_type in ('armor', 'shield')
  and m.name ~ '\(\+\s*\d\)'
  and m.armor_class ~ '^\s*\d+'
  and b.source_document_key = m.source_document_key
  and b.name = regexp_replace(m.name, '\s*\(\+\s*\d\)\s*$', '')
  and b.armor_class = m.armor_class;

-- 4) A service has no rarity. The bundled spellcasting services carried
--    common/uncommon, which put a raise-dead fee into loot-by-rarity rolls.
update library_items
set rarity = 'mundane'
where source_document_key = 'grimoire-bundled'
  and item_type = 'service'
  and rarity <> 'mundane';
