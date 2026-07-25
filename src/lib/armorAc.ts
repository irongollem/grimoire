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
 * The base integer must anchor the start of the string (optional leading
 * whitespace) — armor bases are never negative, so this deliberately does NOT
 * scan for the first digit anywhere in the string. Scanning would misparse
 * free-text like "+1 (12 + Dex modifier)" (a magic-item bonus written before
 * the base) as base 1 instead of 12.
 *
 * Returns null when the string does not begin with an integer — e.g.
 * magic-armor rows whose `armor_class` is null or opaque, or descriptive text
 * that doesn't lead with the base. Callers fall back to the stored `ac`,
 * which is safer than a wrong base.
 */
export function parseArmorClass(armorClass: string | null | undefined): ParsedArmor | null {
  if (!armorClass) return null;
  const baseMatch = armorClass.match(/^\s*(\d+)/);
  if (!baseMatch) return null;
  const base = parseInt(baseMatch[1], 10);
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
 * Resolve a member's base AC (before shield) given their `ac_formula`, stored
 * `ac`, currently-equipped body armor (or null if none/unparseable), and Dex
 * score. Pure function — the reactive wiring (which armor is equipped) lives
 * in `useShieldAc`; this is the actual 5e-rules decision table:
 *
 *  - `"armor"`                       → derived from equipped armor; falls
 *                                       back to the stored `ac` when nothing
 *                                       parseable is equipped.
 *  - `"unarmored:*"` / `"mage_armor"` → these formulas only function while NOT
 *                                       wearing body armor. If parseable body
 *                                       armor is equipped it silently replaces
 *                                       the formula (real 5e semantics — you
 *                                       lose Unarmored Defense / Mage Armor's
 *                                       benefit while armored); otherwise the
 *                                       stored `ac` (which bakes the formula).
 *  - `"natural:*"`                   → natural armor: use whichever is
 *                                       higher, the stored `ac` (bakes the
 *                                       formula) or the armor-derived AC —
 *                                       the 5e rule that you use natural
 *                                       armor only if worn armor would leave
 *                                       you with a lower AC.
 *  - null / manual / unrecognized     → stored `ac` unchanged. Equipped armor
 *                                       never silently overrides a manual AC.
 */
export function resolveBaseAc(
  formula: string | null | undefined,
  storedAc: number,
  parsedArmor: ParsedArmor | null,
  dex: number,
): number {
  if (!formula) return storedAc;
  if (formula === "armor") {
    return parsedArmor ? armorAcFor(parsedArmor, dex) : storedAc;
  }
  if (formula.startsWith("unarmored:") || formula === "mage_armor") {
    return parsedArmor ? armorAcFor(parsedArmor, dex) : storedAc;
  }
  if (formula.startsWith("natural:")) {
    return parsedArmor ? Math.max(storedAc, armorAcFor(parsedArmor, dex)) : storedAc;
  }
  return storedAc;
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
