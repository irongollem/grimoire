import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

/**
 * How a piece of body armor applies the wearer's Dexterity modifier to AC.
 * - "none"   → heavy armor: fixed base, Dex ignored.
 * - "full"   → light armor: base + full Dex modifier.
 * - "capped" → medium armor: base + Dex modifier, but no more than `maxDex`.
 */
export type ArmorDexMode = "none" | "full" | "capped";

export interface ParsedArmor {
  /** Base AC before any Dex contribution. */
  base: number;
  dex: ArmorDexMode;
  /** Upper bound on the Dex bonus when `dex === "capped"` (SRD medium armor = 2). */
  maxDex: number | null;
}

/**
 * Parse a body-armor `armor_class` string into structured AC components.
 * Handles the SRD forms the compendium stores:
 *   "18"                        → { base: 18, dex: "none" }
 *   "11 + Dex modifier"         → { base: 11, dex: "full" }
 *   "14 + Dex modifier (max 2)" → { base: 14, dex: "capped", maxDex: 2 }
 *
 * Returns null when there is no leading base integer — e.g. magic-armor rows
 * whose `armor_class` is null or opaque. Callers fall back to the stored `ac`.
 */
export function parseArmorClass(armorClass: string | null | undefined): ParsedArmor | null {
  if (!armorClass) return null;
  const baseMatch = armorClass.match(/-?\d+/);
  if (!baseMatch) return null;
  const base = parseInt(baseMatch[0], 10);
  if (!/dex/i.test(armorClass)) return { base, dex: "none", maxDex: null };
  const capMatch = armorClass.match(/max\s*(\d+)/i);
  if (capMatch) return { base, dex: "capped", maxDex: parseInt(capMatch[1], 10) };
  return { base, dex: "full", maxDex: null };
}

/** Resolve parsed armor to a concrete AC for a given Dexterity score. */
export function armorAcFor(parsed: ParsedArmor, dex: number): number {
  if (parsed.dex === "none") return parsed.base;
  const dexMod = Math.floor((dex - 10) / 2);
  // A cap only limits the *upper* bound; a penalty (negative mod) still applies.
  const applied = parsed.dex === "capped" ? Math.min(dexMod, parsed.maxDex ?? 0) : dexMod;
  return parsed.base + applied;
}

/**
 * Parsed body armor equipped by each party member, keyed by member id.
 * Mirrors `shieldAcBonusByMember` in `./shieldAc`: counts inventory rows that are
 * equipped, carried by a member, resolve to a vault item of type "armor", are not
 * ruined, and have a parseable `armor_class`. If more than one armor is somehow
 * equipped, the one yielding the higher base wins.
 */
export function equippedArmorByMember(
  inventory: PartyInventoryItem[],
  items: Item[],
): Record<string, ParsedArmor> {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const result: Record<string, ParsedArmor> = {};
  for (const inv of inventory) {
    if (inv.location !== "equipped" || !inv.carried_by || !inv.item_id || inv.is_ruined) continue;
    const item = itemById.get(inv.item_id);
    if (!item || item.item_type !== "armor") continue;
    const parsed = parseArmorClass(item.armor_class);
    if (!parsed) continue;
    const existing = result[inv.carried_by];
    if (!existing || parsed.base > existing.base) result[inv.carried_by] = parsed;
  }
  return result;
}
