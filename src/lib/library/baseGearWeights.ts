/**
 * Weights (lb) of the mundane weapons and armor, by name.
 *
 * Open5e v2 `/weapons/` and `/armor/` carry no weight at all (checked against
 * the live API), so the importer wrote null and a player's carried weight
 * ignored their sword and armor. The Player's Handbook (2014) and the 2024
 * Player's Handbook give identical weights, so one table serves both editions.
 * Keys are lowercase with a trailing " armor" removed; see `baseGearWeight`.
 */
const WEIGHTS_LB: Readonly<Record<string, number>> = {
  // Armor and shields
  padded: 8,
  leather: 10,
  "studded leather": 13,
  hide: 12,
  "chain shirt": 20,
  "scale mail": 45,
  breastplate: 20,
  "half plate": 40,
  "ring mail": 40,
  "chain mail": 55,
  splint: 60,
  plate: 65,
  shield: 6,
  // Weapons
  battleaxe: 4,
  blowgun: 1,
  club: 2,
  dagger: 1,
  dart: 0.25,
  flail: 2,
  glaive: 6,
  greataxe: 7,
  greatclub: 10,
  greatsword: 6,
  halberd: 6,
  handaxe: 2,
  "hand crossbow": 3,
  "heavy crossbow": 18,
  javelin: 2,
  lance: 6,
  "light crossbow": 5,
  "light hammer": 2,
  longbow: 2,
  longsword: 3,
  mace: 4,
  maul: 10,
  morningstar: 4,
  musket: 10,
  net: 3,
  pike: 18,
  pistol: 3,
  quarterstaff: 4,
  rapier: 2,
  scimitar: 3,
  shortbow: 2,
  shortsword: 2,
  sickle: 2,
  sling: 0,
  spear: 3,
  trident: 4,
  "war pick": 2,
  warhammer: 2,
  whip: 3,
};

/** "Crossbow, Hand" and "Hand Crossbow" are one weapon; "Plate Armor" and "Plate" are one armor. */
function normalise(name: string): string {
  const lower = name.trim().toLowerCase();
  const comma = /^crossbow,\s*(hand|heavy|light)$/.exec(lower);
  const base = comma ? `${comma[1]} crossbow` : lower;
  return base.replace(/ armor$/, "");
}

/** The book weight of a mundane base weapon or armor, or null when the name is not one. */
export function baseGearWeight(name: string): number | null {
  return WEIGHTS_LB[normalise(name)] ?? null;
}

/** The table as [name, weight] pairs, for generating the SQL twin. */
export function baseGearWeightEntries(): Array<[string, number]> {
  return Object.entries(WEIGHTS_LB);
}
