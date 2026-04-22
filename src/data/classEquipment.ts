/** Starting-equipment bundles per SRD class.
 *
 * Each class offers Choice A or Choice B per the PHB. Item names are matched
 * case-insensitively against the item vault at character creation time — vault
 * items are linked by id; unrecognised names fall back to free-text entries.
 *
 * Ammunition uses the same names as the vault packs ("Arrows (20)", etc.) so
 * that the one vault item covers the whole bundle.
 */

export interface EquipmentEntry {
  /** Item name — matched against the vault's `name` column (case-insensitive). */
  name: string;
  /** Defaults to 1. Useful for identical items (e.g. quantity: 2 Daggers). */
  quantity?: number;
}

export interface EquipmentBundle {
  label: string;
  items: EquipmentEntry[];
}

export interface ClassEquipmentPack {
  a: EquipmentBundle;
  b: EquipmentBundle;
}

export const CLASS_EQUIPMENT: Record<string, ClassEquipmentPack> = {
  Barbarian: {
    a: {
      label: "Greataxe + Handaxes",
      items: [
        { name: "Greataxe" },
        { name: "Handaxe", quantity: 2 },
        { name: "Explorer's Pack" },
        { name: "Javelin", quantity: 4 },
      ],
    },
    b: {
      label: "Longsword + Handaxes",
      items: [
        { name: "Longsword" },
        { name: "Handaxe", quantity: 2 },
        { name: "Explorer's Pack" },
        { name: "Javelin", quantity: 4 },
      ],
    },
  },

  Bard: {
    a: {
      label: "Rapier + Diplomat's Pack",
      items: [
        { name: "Rapier" },
        { name: "Diplomat's Pack" },
        { name: "Lute" },
        { name: "Leather Armor" },
        { name: "Dagger" },
      ],
    },
    b: {
      label: "Longsword + Entertainer's Pack",
      items: [
        { name: "Longsword" },
        { name: "Entertainer's Pack" },
        { name: "Lute" },
        { name: "Leather Armor" },
        { name: "Dagger" },
      ],
    },
  },

  Cleric: {
    a: {
      label: "Mace + Scale Mail",
      items: [
        { name: "Mace" },
        { name: "Scale Mail" },
        { name: "Light Crossbow" },
        { name: "Crossbow Bolts (20)" },
        { name: "Priest's Pack" },
        { name: "Shield" },
        { name: "Holy Symbol" },
      ],
    },
    b: {
      label: "Warhammer + Chain Mail",
      items: [
        { name: "Warhammer" },
        { name: "Chain Mail" },
        { name: "Light Crossbow" },
        { name: "Crossbow Bolts (20)" },
        { name: "Explorer's Pack" },
        { name: "Shield" },
        { name: "Holy Symbol" },
      ],
    },
  },

  Druid: {
    a: {
      label: "Shield + Scimitar",
      items: [
        { name: "Shield" },
        { name: "Scimitar" },
        { name: "Leather Armor" },
        { name: "Explorer's Pack" },
        { name: "Druidic Focus" },
      ],
    },
    b: {
      label: "Shield + Quarterstaff",
      items: [
        { name: "Shield" },
        { name: "Quarterstaff" },
        { name: "Leather Armor" },
        { name: "Explorer's Pack" },
        { name: "Druidic Focus" },
      ],
    },
  },

  Fighter: {
    a: {
      label: "Chain Mail + Longsword & Shield",
      items: [
        { name: "Chain Mail" },
        { name: "Longsword" },
        { name: "Shield" },
        { name: "Light Crossbow" },
        { name: "Crossbow Bolts (20)" },
        { name: "Dungeoneer's Pack" },
      ],
    },
    b: {
      label: "Leather Armor + Longbow",
      items: [
        { name: "Leather Armor" },
        { name: "Longbow" },
        { name: "Arrows (20)" },
        { name: "Handaxe", quantity: 2 },
        { name: "Light Crossbow" },
        { name: "Crossbow Bolts (20)" },
        { name: "Explorer's Pack" },
      ],
    },
  },

  Monk: {
    a: {
      label: "Shortsword + Dungeoneer's Pack",
      items: [
        { name: "Shortsword" },
        { name: "Dungeoneer's Pack" },
        { name: "Dart", quantity: 10 },
      ],
    },
    b: {
      label: "Quarterstaff + Explorer's Pack",
      items: [
        { name: "Quarterstaff" },
        { name: "Explorer's Pack" },
        { name: "Dart", quantity: 10 },
      ],
    },
  },

  Paladin: {
    a: {
      label: "Longsword & Shield",
      items: [
        { name: "Longsword" },
        { name: "Shield" },
        { name: "Javelin", quantity: 5 },
        { name: "Priest's Pack" },
        { name: "Chain Mail" },
        { name: "Holy Symbol" },
      ],
    },
    b: {
      label: "Two Longswords",
      items: [
        { name: "Longsword", quantity: 2 },
        { name: "Javelin", quantity: 5 },
        { name: "Explorer's Pack" },
        { name: "Chain Mail" },
        { name: "Holy Symbol" },
      ],
    },
  },

  Ranger: {
    a: {
      label: "Scale Mail + Two Shortswords",
      items: [
        { name: "Scale Mail" },
        { name: "Shortsword", quantity: 2 },
        { name: "Dungeoneer's Pack" },
        { name: "Longbow" },
        { name: "Arrows (20)" },
      ],
    },
    b: {
      label: "Leather Armor + Two Shortswords",
      items: [
        { name: "Leather Armor" },
        { name: "Shortsword", quantity: 2 },
        { name: "Explorer's Pack" },
        { name: "Longbow" },
        { name: "Arrows (20)" },
      ],
    },
  },

  Rogue: {
    a: {
      label: "Rapier + Shortbow",
      items: [
        { name: "Rapier" },
        { name: "Shortbow" },
        { name: "Arrows (20)" },
        { name: "Burglar's Pack" },
        { name: "Leather Armor" },
        { name: "Dagger", quantity: 2 },
        { name: "Thieves' Tools" },
      ],
    },
    b: {
      label: "Shortsword + Shortbow",
      items: [
        { name: "Shortsword" },
        { name: "Shortbow" },
        { name: "Arrows (20)" },
        { name: "Dungeoneer's Pack" },
        { name: "Leather Armor" },
        { name: "Dagger", quantity: 2 },
        { name: "Thieves' Tools" },
      ],
    },
  },

  Sorcerer: {
    a: {
      label: "Light Crossbow + Component Pouch",
      items: [
        { name: "Light Crossbow" },
        { name: "Crossbow Bolts (20)" },
        { name: "Component Pouch" },
        { name: "Dungeoneer's Pack" },
        { name: "Dagger", quantity: 2 },
      ],
    },
    b: {
      label: "Quarterstaff + Component Pouch",
      items: [
        { name: "Quarterstaff" },
        { name: "Component Pouch" },
        { name: "Explorer's Pack" },
        { name: "Dagger", quantity: 2 },
      ],
    },
  },

  Warlock: {
    a: {
      label: "Light Crossbow + Scholar's Pack",
      items: [
        { name: "Light Crossbow" },
        { name: "Crossbow Bolts (20)" },
        { name: "Component Pouch" },
        { name: "Scholar's Pack" },
        { name: "Leather Armor" },
        { name: "Dagger", quantity: 2 },
      ],
    },
    b: {
      label: "Quarterstaff + Dungeoneer's Pack",
      items: [
        { name: "Quarterstaff" },
        { name: "Component Pouch" },
        { name: "Dungeoneer's Pack" },
        { name: "Leather Armor" },
        { name: "Dagger", quantity: 2 },
      ],
    },
  },

  Wizard: {
    a: {
      label: "Quarterstaff + Scholar's Pack",
      items: [
        { name: "Quarterstaff" },
        { name: "Component Pouch" },
        { name: "Scholar's Pack" },
        { name: "Spellbook" },
      ],
    },
    b: {
      label: "Dagger + Explorer's Pack",
      items: [
        { name: "Dagger" },
        { name: "Component Pouch" },
        { name: "Explorer's Pack" },
        { name: "Spellbook" },
      ],
    },
  },
};
