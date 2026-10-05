-- library_items: slot tags for worn wondrous items, and base gear weights (#973).
--
-- 1. Slot tags. Open5e files every worn wondrous item as "Wondrous Item" with
--    no tags, so the paper doll never found a cloak, boots or a belt. Each
--    worn-by-name item gets the id of its doll slot as a tag. Same word lists
--    as src/lib/library/slotTags.ts (Postgres \y word boundaries). Idempotent:
--    a tag already present is not added twice.
-- 2. Weights. Open5e v2 carries no weight for weapons and armor, so the base
--    ones were null. Fills NULLs only, PHB weights (identical in 2014 and
--    2024), matched on lower(name) with a trailing " armor" removed.
--    Same table as src/lib/library/baseGearWeights.ts.

update library_items
   set tags = array_append(tags, 'neck')
 where item_type in ('wondrous_item', 'gear')
   and name ~* '\y(amulets?|necklaces?|periapts?|medallions?|pendants?|talismans?|scarabs?|brooch(?:es)?)\y'
   and not ('neck' = any(tags));

update library_items
   set tags = array_append(tags, 'shoulders')
 where item_type in ('wondrous_item', 'gear')
   and name ~* '\y(cloaks?|capes?|mantles?|wings of flying)\y'
   and not ('shoulders' = any(tags));

update library_items
   set tags = array_append(tags, 'feet')
 where item_type in ('wondrous_item', 'gear')
   and name ~* '\y(boots|slippers?)\y'
   and not ('feet' = any(tags));

update library_items
   set tags = array_append(tags, 'hands')
 where item_type in ('wondrous_item', 'gear')
   and name ~* '\y(gloves|gauntlets|bracers)\y'
   and not ('hands' = any(tags));

update library_items
   set tags = array_append(tags, 'waist')
 where item_type in ('wondrous_item', 'gear')
   and name ~* '\y(belts?|girdles?)\y'
   and not ('waist' = any(tags));

update library_items
   set tags = array_append(tags, 'head')
 where item_type in ('wondrous_item', 'gear')
   and name ~* '\y(helms?|hats?|circlets?|headbands?|crowns?|diadems?|goggles|eyes of|lenses)\y'
   and not ('head' = any(tags));

update library_items
   set tags = array_append(tags, 'clothes')
 where item_type in ('wondrous_item', 'gear')
   and name ~* '\y(robes?|vestments?|clothes)\y'
   and not ('clothes' = any(tags));

update library_items li
   set weight = w.weight
  from (values
    ('padded', 8),
    ('leather', 10),
    ('studded leather', 13),
    ('hide', 12),
    ('chain shirt', 20),
    ('scale mail', 45),
    ('breastplate', 20),
    ('half plate', 40),
    ('ring mail', 40),
    ('chain mail', 55),
    ('splint', 60),
    ('plate', 65),
    ('shield', 6),
    ('battleaxe', 4),
    ('blowgun', 1),
    ('club', 2),
    ('dagger', 1),
    ('dart', 0.25),
    ('flail', 2),
    ('glaive', 6),
    ('greataxe', 7),
    ('greatclub', 10),
    ('greatsword', 6),
    ('halberd', 6),
    ('handaxe', 2),
    ('hand crossbow', 3),
    ('heavy crossbow', 18),
    ('javelin', 2),
    ('lance', 6),
    ('light crossbow', 5),
    ('light hammer', 2),
    ('longbow', 2),
    ('longsword', 3),
    ('mace', 4),
    ('maul', 10),
    ('morningstar', 4),
    ('musket', 10),
    ('net', 3),
    ('pike', 18),
    ('pistol', 3),
    ('quarterstaff', 4),
    ('rapier', 2),
    ('scimitar', 3),
    ('shortbow', 2),
    ('shortsword', 2),
    ('sickle', 2),
    ('sling', 0),
    ('spear', 3),
    ('trident', 4),
    ('war pick', 2),
    ('warhammer', 2),
    ('whip', 3)
  ) as w(name, weight)
 where li.weight is null
   and li.item_type in ('armor', 'shield', 'weapon')
   and (
     regexp_replace(lower(li.name), ' armor$', '') = w.name
     or lower(li.name) = 'crossbow, ' || split_part(w.name, ' ', 1) and w.name like '% crossbow'
   );

