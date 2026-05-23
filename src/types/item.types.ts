import type { DamageRoll } from "@/lib/dice";
import { OPEN5E_SOURCE_LABELS } from "@/types/spell.types";

// Prefer the stored title from the DB; fall back to our hardcoded map, then the raw slug.
export function itemSourceLabel(
  slug: string | null,
  title?: string | null,
): string {
  if (!slug) return "Custom";
  if (title) return title;
  return OPEN5E_SOURCE_LABELS[slug] ?? slug;
}

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
  "crafting_material",
  "provision",
  "art_object",
  "service",
  "pack",
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
  crafting_material: "Crafting Material",
  provision: "Provision",
  art_object: "Art Object",
  service: "Service",
  pack: "Pack / Bundle",
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

/** DMG Table 7-1 price guidance, keyed by rarity — used in tooltips and hints. */
export const RARITY_PRICE_HINTS: Partial<Record<ItemRarity, string>> = {
  mundane:   "Mundane — market price",
  common:    "Common — ~50–100 gp",
  uncommon:  "Uncommon — ~101–500 gp",
  rare:      "Rare — ~501–5,000 gp",
  very_rare: "Very Rare — ~5,001–50,000 gp",
  legendary: "Legendary — 50,000+ gp",
  artifact:  "Artifact — priceless",
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
  mundane: "#9ca3af",
  common: "#d1d5db",
  uncommon: "#4ade80",
  rare: "#60a5fa",
  very_rare: "#c084fc",
  legendary: "#fb923c",
  artifact: "#f87171",
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
  // 2024 PHB mastery properties
  "cleave",
  "graze",
  "nick",
  "push",
  "sap",
  "slow",
  "topple",
  "vex",
] as const;
export type WeaponProperty = (typeof WEAPON_PROPERTIES)[number];

/** One entry in a pack/bundle's contents list. */
export interface BundleItemEntry {
  name: string;
  quantity?: number;
}

export interface Item {
  id: string;
  user_id: string;
  name: string;
  item_type: ItemType;
  subtype: string | null; // e.g. "longsword", "chain mail", "saddle"
  rarity: ItemRarity;
  requires_attunement: boolean;
  attunement_requirements: string | null; // e.g. "by a spellcaster"
  weight: number | null;
  cost: string | null; // e.g. "50 gp"
  damage_rolls: DamageRoll[] | null; // for weapons
  armor_class: string | null; // e.g. "13 + DEX modifier (max 2)"
  properties: string[]; // weapon properties
  charges: number | null; // max charges (staff/wand/rod) or quantity (ammunition)
  recharge: string | null; // e.g. "Regains 1d6+4 charges daily at dawn"
  spell_ids: string[]; // UUIDs referencing spells in the spells table
  weapon_range?: string | null; // e.g. "80/320 ft." for ranged weapons
  versatile_damage?: string | null; // e.g. "1d10" two-handed damage for versatile weapons
  description: string;
  source: string | null; // open5e document slug, used for filtering
  source_title?: string | null; // human-readable document title, e.g. "Vault of Magic"
  source_url?: string | null; // link to the product page
  tags: string[];
  bundle_items?: BundleItemEntry[] | null;
  image_url: string | null;
  image_focal_point?: { x: number; y: number } | null;
  is_arcane_focus: boolean;
  mundane_description: string | null; // shown to players before identification
  mundane_image_url: string | null; // artwork shown before identification
  mundane_image_focal_point?: { x: number; y: number } | null;
  curse_description: string | null;
  /** NULL = general (visible in all campaigns); set = only visible when that campaign is active. */
  campaign_id: string | null;
  /** DM-only rich-text notes never shown to players. */
  dm_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ItemInsert = Omit<
  Item,
  "id" | "user_id" | "created_at" | "updated_at" | "mundane_description" | "mundane_image_url" | "mundane_image_focal_point" | "campaign_id" | "dm_notes"
> & {
  mundane_description?: string | null;
  mundane_image_url?: string | null;
  mundane_image_focal_point?: { x: number; y: number } | null;
  campaign_id?: string | null;
  dm_notes?: string | null;
};
export type ItemUpdate = Partial<ItemInsert>;
/** Subset used by static data files — fields managed by the DB are omitted */
export type StaticItemData = Omit<ItemInsert, "user_id" | "curse_description" | "is_arcane_focus">;

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

/** Item types that are inherently magical — showing the type before identification reveals the magic */
export const MAGIC_ONLY_ITEM_TYPES = new Set<ItemType>([
  "wondrous_item",
  "ring",
  "rod",
  "staff",
  "wand",
  "scroll",
]);
