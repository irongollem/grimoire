/**
 * The 2014 Paladin spell list (SRD 5.1), which Open5e's v2 data leaves out:
 * not one of its `srd-2014` spells carries the Paladin class (8 Oct 2026), so
 * the library had no 2014 Paladin spells at all and every 2014 Paladin's spell
 * picks failed the class-list check. The DMs saw it from the start: "almost
 * none of their spells were tagged properly".
 *
 * The base list only, by the book. Open5e's v1 data does tag Paladin, on 54
 * spells, but those include every oath's spells (Vengeance's Hunter's Mark and
 * Haste, the Ancients' Moonbeam, Oathbreaker's Hellish Rebuke), and an oath's
 * spells belong to that oath alone. They are granted as always-prepared, which
 * the spell-source check already lets through. Subtracting the oath spells from
 * v1's 54 leaves exactly the SRD 5.1 list below, 31 spells.
 *
 * Applied only to the `srd-2014` document: other publishers have spells with
 * these names, and Open5e's `srd-2024` data tags the 2024 Paladin correctly.
 */
export const PALADIN_2014_SPELLS = new Set<string>([
  // ── 1st Level ─────────────────────────────────────────────────────────────
  "Bless",
  "Command",
  "Cure Wounds",
  "Detect Evil and Good",
  "Detect Magic",
  "Detect Poison and Disease",
  "Divine Favor",
  "Heroism",
  "Protection from Evil and Good",
  "Purify Food and Drink",
  "Shield of Faith",

  // ── 2nd Level ─────────────────────────────────────────────────────────────
  "Aid",
  "Branding Smite",
  "Find Steed",
  "Lesser Restoration",
  "Locate Object",
  "Magic Weapon",
  "Protection from Poison",
  "Zone of Truth",

  // ── 3rd Level ─────────────────────────────────────────────────────────────
  "Create Food and Water",
  "Daylight",
  "Dispel Magic",
  "Magic Circle",
  "Remove Curse",
  "Revivify",

  // ── 4th Level ─────────────────────────────────────────────────────────────
  "Banishment",
  "Death Ward",
  "Locate Creature",

  // ── 5th Level ─────────────────────────────────────────────────────────────
  "Dispel Evil and Good",
  "Geas",
  "Raise Dead",
]);
