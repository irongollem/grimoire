import type { RulesetKey } from "@/types/ruleset.types";

/**
 * Workshop outputs the SRD already defines, mapped per edition to that SRD's
 * `library_items` row. Crafting one of these produces the real item, with its
 * range, category and AC, instead of a thinner Workshop copy of it (#957).
 *
 * An edition left out has no SRD row for the item, so the Workshop keeps its
 * own copy there, and that copy is stamped with only the uncovered editions
 * (`src/data/provisions.ts`, `src/data/gear.ts`) so no campaign ever lists the
 * item twice. 2014 Open5e has no plain Shield; 2024 has no Net (it is gear in
 * 2024) and no Potion of Healing / Greater Healing.
 *
 * Names cannot do this matching: 2014 calls the armour "Leather" and 2024
 * "Leather Armor". Hence explicit ids, which `stableSrdId` keeps stable.
 */
export const WORKSHOP_LIBRARY_EQUIVALENTS: Readonly<Record<string, Partial<Record<RulesetKey, string>>>> = {
  Shortbow: { "2014": "srd_srd_shortbow", "2024": "srd_srd_2024_shortbow" },
  Dagger: { "2014": "srd_srd_dagger", "2024": "srd_srd_2024_dagger" },
  Handaxe: { "2014": "srd_srd_handaxe", "2024": "srd_srd_2024_handaxe" },
  Javelin: { "2014": "srd_srd_javelin", "2024": "srd_srd_2024_javelin" },
  Spear: { "2014": "srd_srd_spear", "2024": "srd_srd_2024_spear" },
  "Light Hammer": { "2014": "srd_srd_light_hammer", "2024": "srd_srd_2024_light_hammer" },
  Trident: { "2014": "srd_srd_trident", "2024": "srd_srd_2024_trident" },
  "Leather Armor": { "2014": "srd_srd_leather", "2024": "srd_srd_2024_leather_armor" },
  Shield: { "2024": "srd_srd_2024_shield" },
  Net: { "2014": "srd_srd_net" },
  "Potion of Healing": { "2014": "srd_srd_potion_of_healing" },
  "Potion of Greater Healing": { "2014": "srd_srd_potion_of_greater_healing" },
  "Potion of Climbing": { "2014": "srd_srd_potion_of_climbing", "2024": "srd_srd_2024_potion_of_climbing" },
  "Potion of Water Breathing": { "2014": "srd_srd_potion_of_water_breathing", "2024": "srd_srd_2024_potion_of_water_breathing" },
  "Potion of Invisibility": { "2014": "srd_srd_potion_of_invisibility", "2024": "srd_srd_2024_potion_of_invisibility" },
};
