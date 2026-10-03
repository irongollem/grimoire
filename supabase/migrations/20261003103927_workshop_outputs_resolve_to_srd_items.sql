-- #957: Workshop outputs resolve to the SRD's own items.
--
-- The Workshop bundled its own copies of items the SRD already defines
-- (Shortbow, Dagger, Handaxe, Leather Armour, Shield, Net, five potions) and
-- seeded them into library_items with ruleset null, so every campaign listed
-- each one twice: once complete (the SRD row, with range, category and AC) and
-- once thin (the bundled copy, a Shortbow with no 80/320). Crafting produced
-- whichever copy a name lookup met first.
--
-- src/data/workshopLibraryEquivalents.ts now maps each of those items, per
-- edition, to its SRD row, and the recipe import resolves through it. This
-- migration brings existing data in line with that table:
--
--   1. Every reference to a bundled copy is moved to the SRD row of its
--      campaign's edition, where that edition has one.
--   2. Bundled copies the SRD covers in both editions are deleted.
--   3. Bundled copies the SRD covers in one edition are restricted to the
--      other: Shield to 2014 (2014 Open5e has no plain Shield), Net and the
--      two healing potions to 2024 (the 2024 SRD has none of them as items).
--
-- Order matters. Every library_items reference is a foreign key, and five of
-- them are ON DELETE CASCADE: deleting a bundled row that a store, recipe or
-- faction still pointed at would delete that store listing or recipe output
-- with it. Step 2 therefore refuses to run while any reference remains.
--
-- A campaign whose edition cannot be read (a location or faction with no
-- campaign) is treated as 2014, the app's DEFAULT_RULESET.

create temporary table workshop_srd (
  bundled_id text not null,
  ruleset text not null,
  target_id text not null
) on commit drop;

insert into workshop_srd (bundled_id, ruleset, target_id) values
  ('srd_grimoire_bundled_shortbow', '2014', 'srd_srd_shortbow'),
  ('srd_grimoire_bundled_shortbow', '2024', 'srd_srd_2024_shortbow'),
  ('srd_grimoire_bundled_dagger', '2014', 'srd_srd_dagger'),
  ('srd_grimoire_bundled_dagger', '2024', 'srd_srd_2024_dagger'),
  ('srd_grimoire_bundled_handaxe', '2014', 'srd_srd_handaxe'),
  ('srd_grimoire_bundled_handaxe', '2024', 'srd_srd_2024_handaxe'),
  ('srd_grimoire_bundled_javelin', '2014', 'srd_srd_javelin'),
  ('srd_grimoire_bundled_javelin', '2024', 'srd_srd_2024_javelin'),
  ('srd_grimoire_bundled_spear', '2014', 'srd_srd_spear'),
  ('srd_grimoire_bundled_spear', '2024', 'srd_srd_2024_spear'),
  ('srd_grimoire_bundled_light_hammer', '2014', 'srd_srd_light_hammer'),
  ('srd_grimoire_bundled_light_hammer', '2024', 'srd_srd_2024_light_hammer'),
  ('srd_grimoire_bundled_trident', '2014', 'srd_srd_trident'),
  ('srd_grimoire_bundled_trident', '2024', 'srd_srd_2024_trident'),
  ('srd_grimoire_bundled_leather_armour', '2014', 'srd_srd_leather'),
  ('srd_grimoire_bundled_leather_armour', '2024', 'srd_srd_2024_leather_armor'),
  ('srd_grimoire_bundled_potion_of_climbing', '2014', 'srd_srd_potion_of_climbing'),
  ('srd_grimoire_bundled_potion_of_climbing', '2024', 'srd_srd_2024_potion_of_climbing'),
  ('srd_grimoire_bundled_potion_of_water_breathing', '2014', 'srd_srd_potion_of_water_breathing'),
  ('srd_grimoire_bundled_potion_of_water_breathing', '2024', 'srd_srd_2024_potion_of_water_breathing'),
  ('srd_grimoire_bundled_potion_of_invisibility', '2014', 'srd_srd_potion_of_invisibility'),
  ('srd_grimoire_bundled_potion_of_invisibility', '2024', 'srd_srd_2024_potion_of_invisibility'),
  ('srd_grimoire_bundled_shield', '2024', 'srd_srd_2024_shield'),
  ('srd_grimoire_bundled_net', '2014', 'srd_srd_net'),
  ('srd_grimoire_bundled_potion_of_healing', '2014', 'srd_srd_potion_of_healing'),
  ('srd_grimoire_bundled_potion_of_greater_healing', '2014', 'srd_srd_potion_of_greater_healing');

-- A target the library does not hold (a stack that never seeded the SRD) is
-- skipped here, and step 2 then stops on the reference it left behind.
delete from workshop_srd m
where not exists (select 1 from public.library_items l where l.id = m.target_id);

-- 1. Move references.

update public.party_inventory t
set library_item_id = m.target_id
from public.campaigns c, workshop_srd m
where c.id = t.campaign_id
  and m.bundled_id = t.library_item_id
  and m.ruleset = c.ruleset;

update public.npc_inventory t
set library_item_id = m.target_id
from public.campaigns c, workshop_srd m
where c.id = t.campaign_id
  and m.bundled_id = t.library_item_id
  and m.ruleset = c.ruleset;

update public.crafting_recipe_outputs t
set library_item_id = m.target_id
from public.crafting_recipes r
join public.campaigns c on c.id = r.campaign_id
join workshop_srd m on m.ruleset = c.ruleset
where r.id = t.recipe_id
  and m.bundled_id = t.library_item_id;

update public.crafting_recipe_ingredients t
set library_item_id = m.target_id
from public.crafting_recipes r
join public.campaigns c on c.id = r.campaign_id
join workshop_srd m on m.ruleset = c.ruleset
where r.id = t.recipe_id
  and m.bundled_id = t.library_item_id;

update public.faction_items t
set library_item_id = m.target_id
from public.factions f
left join public.campaigns c on c.id = f.campaign_id
join workshop_srd m on m.ruleset = coalesce(c.ruleset, '2014')
where f.id = t.faction_id
  and m.bundled_id = t.library_item_id;

update public.store_items t
set library_item_id = m.target_id
from public.locations l
left join public.campaigns c on c.id = l.campaign_id
join workshop_srd m on m.ruleset = coalesce(c.ruleset, '2014')
where l.id = t.location_id
  and m.bundled_id = t.library_item_id;

-- 2. Delete the copies the SRD covers in both editions.

do $$
declare
  superseded text[] := array[
    'srd_grimoire_bundled_shortbow',
    'srd_grimoire_bundled_dagger',
    'srd_grimoire_bundled_handaxe',
    'srd_grimoire_bundled_javelin',
    'srd_grimoire_bundled_spear',
    'srd_grimoire_bundled_light_hammer',
    'srd_grimoire_bundled_trident',
    'srd_grimoire_bundled_leather_armour',
    'srd_grimoire_bundled_potion_of_climbing',
    'srd_grimoire_bundled_potion_of_water_breathing',
    'srd_grimoire_bundled_potion_of_invisibility'
  ];
  remaining bigint;
begin
  select count(*) into remaining
  from (
    select library_item_id from public.party_inventory
    union all select library_item_id from public.npc_inventory
    union all select library_item_id from public.crafting_recipe_outputs
    union all select library_item_id from public.crafting_recipe_ingredients
    union all select library_item_id from public.faction_items
    union all select library_item_id from public.store_items
  ) refs
  where refs.library_item_id = any (superseded);

  if remaining > 0 then
    raise exception 'workshop_outputs_resolve_to_srd_items: % reference(s) to a superseded bundled item were not moved; deleting would cascade them away', remaining;
  end if;

  delete from public.library_items where id = any (superseded);
end;
$$;

-- 3. Restrict the copies the SRD covers in one edition to the other.

update public.library_items set ruleset = '2014'
where id = 'srd_grimoire_bundled_shield';

update public.library_items set ruleset = '2024'
where id in (
  'srd_grimoire_bundled_net',
  'srd_grimoire_bundled_potion_of_healing',
  'srd_grimoire_bundled_potion_of_greater_healing'
);
