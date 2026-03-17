import type { DamageRoll } from "@/lib/dice";

export const ITEM_TYPES = [
  "weapon",
  "armor",
  "shield",
  "potion",
  "wondrous_item",
  "ring",
  "rod",
  "staff",
  "wand",
  "scroll",
  "ammunition",
  "gear",
  "tool",
  "vehicle",
  "trade_good",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  weapon: "Weapon",
  armor: "Armor",
  shield: "Shield",
  potion: "Potion",
  wondrous_item: "Wondrous Item",
  ring: "Ring",
  rod: "Rod",
  staff: "Staff",
  wand: "Wand",
  scroll: "Scroll",
  ammunition: "Ammunition",
  gear: "Adventuring Gear",
  tool: "Tool",
  vehicle: "Vehicle",
  trade_good: "Trade Good",
};

export const ITEM_RARITIES = [
  "mundane",
  "common",
  "uncommon",
  "rare",
  "very_rare",
  "legendary",
  "artifact",
] as const;
export type ItemRarity = (typeof ITEM_RARITIES)[number];

export const ITEM_RARITY_LABELS: Record<ItemRarity, string> = {
  mundane: "Mundane",
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  very_rare: "Very Rare",
  legendary: "Legendary",
  artifact: "Artifact",
};

/** Frame colours for card printing, keyed by rarity */
export const RARITY_COLORS: Record<ItemRarity, string> = {
  mundane: "#3D3D3D",
  common: "#888888",
  uncommon: "#1A4A1A",
  rare: "#1A2A5C",
  very_rare: "#3D1A5C",
  legendary: "#5C3A1A",
  artifact: "#6B1C1C",
};

/** Vivid badge colours for UI display */
export const RARITY_BADGE_COLORS: Record<ItemRarity, string> = {
  mundane:   "#9ca3af",
  common:    "#d1d5db",
  uncommon:  "#4ade80",
  rare:      "#60a5fa",
  very_rare: "#c084fc",
  legendary: "#fb923c",
  artifact:  "#f87171",
};

export const WEAPON_PROPERTIES = [
  "ammunition",
  "finesse",
  "heavy",
  "light",
  "loading",
  "reach",
  "special",
  "thrown",
  "two-handed",
  "versatile",
  "silvered",
  "adamantine",
] as const;
export type WeaponProperty = (typeof WEAPON_PROPERTIES)[number];

export interface Item {
  id: string;
  user_id: string;
  name: string;
  item_type: ItemType;
  subtype: string | null; // e.g. "longsword", "chain mail", "saddle"
  rarity: ItemRarity;
  requires_attunement: boolean;
  attunement_requirements: string | null; // e.g. "by a spellcaster"
  weight: string | null; // e.g. "3 lb."
  cost: string | null; // e.g. "50 gp"
  damage_rolls: DamageRoll[] | null; // for weapons
  armor_class: string | null; // e.g. "13 + DEX modifier (max 2)"
  properties: string[]; // weapon properties
  charges: number | null; // max charges (staff/wand/rod)
  recharge: string | null; // e.g. "Regains 1d6+4 charges daily at dawn"
  spell_ids: string[]; // UUIDs referencing spells in the spells table
  description: string;
  source: string | null;
  tags: string[];
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export type ItemInsert = Omit<Item, "id" | "user_id" | "created_at" | "updated_at">;
export type ItemUpdate = Partial<ItemInsert>;

/** True for item types that can have weapon damage dice */
export function isWeaponType(t: ItemType): boolean {
  return t === "weapon" || t === "ammunition";
}

/** True for item types that can have an AC value */
export function isArmorType(t: ItemType): boolean {
  return t === "armor" || t === "shield";
}

/** True for item types that typically carry charges */
export function isChargeType(t: ItemType): boolean {
  return t === "staff" || t === "wand" || t === "rod" || t === "ring";
}
