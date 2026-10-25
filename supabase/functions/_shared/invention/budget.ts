import type { CraftingDiscipline, InventionRecipe, ItemRarity, ItemType } from "./types.ts";

export const RARITY_ORDER: readonly ItemRarity[] = [
  "mundane",
  "common",
  "uncommon",
  "rare",
  "very_rare",
  "legendary",
  "artifact",
];

export function rarityIndex(r: ItemRarity): number {
  return RARITY_ORDER.indexOf(r);
}

/** Artifact is priced and budgeted as legendary. */
export function tierOf(r: ItemRarity): Exclude<ItemRarity, "artifact"> {
  return r === "artifact" ? "legendary" : r;
}

/** The rarest ingredient, but never below common and never above legendary. */
export function rarityCeiling(rarities: readonly ItemRarity[]): ItemRarity {
  let top = rarityIndex("common");
  for (const r of rarities) top = Math.max(top, rarityIndex(r));
  return RARITY_ORDER[Math.min(top, rarityIndex("legendary"))];
}

export function rarityLabel(r: ItemRarity): string {
  return r.replace(/_/g, " ");
}

// Price band per unit for a NEW item (DMG 7-1). max null = open ended.
export const PRICE_BANDS: Record<Exclude<ItemRarity, "artifact">, { min: number; max: number | null }> = {
  mundane: { min: 1, max: null },
  common: { min: 5000, max: 10000 },
  uncommon: { min: 10100, max: 50000 },
  rare: { min: 50100, max: 500000 },
  very_rare: { min: 500100, max: 5000000 },
  legendary: { min: 5000100, max: null },
};

export function bandFor(r: ItemRarity): { min: number; max: number | null } {
  return PRICE_BANDS[tierOf(r)];
}

const LANES: Record<CraftingDiscipline, readonly ItemType[]> = {
  alchemy: ["potion", "gear", "crafting_material", "trade_good"],
  smithing: ["weapon", "armor", "shield", "ammunition", "gear", "tool", "trade_good"],
  leathercraft: ["armor", "gear", "pack", "trade_good"],
  woodcraft: ["weapon", "shield", "staff", "rod", "wand", "ammunition", "gear", "tool", "vehicle"],
  jewelcrafting: ["ring", "wondrous_item", "art_object", "trade_good"],
  herbalism: ["potion", "provision", "crafting_material", "gear"],
  poisoncraft: ["gear", "potion"],
  tinkering: ["gear", "tool", "wondrous_item", "weapon", "ammunition", "vehicle"],
  cooking: ["provision"],
  scribing: ["scroll", "gear"],
  forgery: ["gear", "trade_good"],
  brewing: ["provision", "potion"],
  weaving: ["gear", "armor", "wondrous_item", "trade_good"],
  masonry: ["gear", "art_object", "trade_good"],
  painting: ["art_object", "gear"],
};

export function laneFor(discipline: CraftingDiscipline): readonly ItemType[] {
  return LANES[discipline];
}

export const MAGIC_ONLY_TYPES: readonly ItemType[] = ["wondrous_item", "ring", "rod", "staff", "wand", "scroll"];

export interface PowerBudget {
  effectsMax: number;
  minorOnly: boolean;
  bonusMax: number;
  extraDamageAvgMax: number;
  healingAvgMax: number;
  spellLevelMax: number | null;
  chargesMax: number;
  resistanceTypes: number;
  advantage: boolean;
}

export const POWER_BUDGETS: Record<Exclude<ItemRarity, "artifact">, PowerBudget> = {
  mundane: { effectsMax: 1, minorOnly: true, bonusMax: 0, extraDamageAvgMax: 0, healingAvgMax: 0, spellLevelMax: null, chargesMax: 0, resistanceTypes: 0, advantage: false },
  common: { effectsMax: 1, minorOnly: false, bonusMax: 0, extraDamageAvgMax: 0, healingAvgMax: 7, spellLevelMax: 1, chargesMax: 3, resistanceTypes: 0, advantage: false },
  uncommon: { effectsMax: 2, minorOnly: false, bonusMax: 1, extraDamageAvgMax: 2.5, healingAvgMax: 14, spellLevelMax: 3, chargesMax: 7, resistanceTypes: 0, advantage: true },
  rare: { effectsMax: 3, minorOnly: false, bonusMax: 2, extraDamageAvgMax: 7, healingAvgMax: 28, spellLevelMax: 5, chargesMax: 10, resistanceTypes: 1, advantage: true },
  very_rare: { effectsMax: 4, minorOnly: false, bonusMax: 3, extraDamageAvgMax: 10.5, healingAvgMax: 45, spellLevelMax: 8, chargesMax: 20, resistanceTypes: 2, advantage: true },
  legendary: { effectsMax: 5, minorOnly: false, bonusMax: 3, extraDamageAvgMax: 14, healingAvgMax: 45, spellLevelMax: 9, chargesMax: 50, resistanceTypes: 3, advantage: true },
};

export function budgetFor(r: ItemRarity): PowerBudget {
  return POWER_BUDGETS[tierOf(r)];
}

/** The attunement rule: uncommon and above only. */
export function canAttune(r: ItemRarity): boolean {
  return rarityIndex(r) >= rarityIndex("uncommon");
}

const MAGIC_DC: Record<Exclude<ItemRarity, "mundane" | "artifact">, number> = {
  common: 15,
  uncommon: 18,
  rare: 21,
  very_rare: 24,
  legendary: 27,
};

export const MUNDANE_DC = { min: 8, max: 15, fallback: 10 } as const;

/** Fixed DC of a magic result; null for a mundane one, whose DC the model proposes. */
export function magicDcFor(r: ItemRarity): number | null {
  const t = tierOf(r);
  return t === "mundane" ? null : MAGIC_DC[t];
}

const TIME_FLOOR: Record<Exclude<ItemRarity, "artifact">, { value: number; unit: InventionRecipe["crafting_time_unit"] }> = {
  mundane: { value: 1, unit: "hours" },
  common: { value: 5, unit: "days" },
  uncommon: { value: 10, unit: "days" },
  rare: { value: 50, unit: "days" },
  very_rare: { value: 125, unit: "days" },
  legendary: { value: 250, unit: "days" },
};

export function timeFloorFor(r: ItemRarity): { value: number; unit: InventionRecipe["crafting_time_unit"] } {
  return TIME_FLOOR[tierOf(r)];
}

const UNIT_MINUTES: Record<InventionRecipe["crafting_time_unit"], number> = { minutes: 1, hours: 60, days: 1440 };

export function toMinutes(value: number, unit: InventionRecipe["crafting_time_unit"]): number {
  return value * UNIT_MINUTES[unit];
}

/** "NdM", "NdM+K", "NdM-K" (spaces ignored). Null when it is anything else. */
export function parseDice(text: string): { count: number; sides: number; mod: number } | null {
  const m = /^(\d{1,3})d(\d{1,3})(?:([+-])(\d{1,4}))?$/i.exec(text.replace(/\s+/g, ""));
  if (!m) return null;
  const count = Number(m[1]);
  const sides = Number(m[2]);
  if (count < 1 || sides < 1) return null;
  const mod = m[3] ? Number(m[4]) * (m[3] === "-" ? -1 : 1) : 0;
  return { count, sides, mod };
}

export function diceAverage(d: { count: number; sides: number; mod: number }): number {
  return (d.count * (d.sides + 1)) / 2 + d.mod;
}
