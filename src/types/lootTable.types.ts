// ── Loot tables (issue #121) ─────────────────────────────────────────────────
//
// Each entry can be one of two kinds:
//   "item"     — FK into the Item Vault; qty is dice-rolled or fixed.
//                Art objects are just vault items of type "art_object".
//   "currency" — Flat coin amounts (PP/GP/EP/SP/CP); the whole pool drops as
//                one claimable atom.
//
// All entries share drop_chance (1–100) and an optional DM note.
// Rolling logic: src/lib/lootTableRoll.ts.

import { parseExpression, maxExpression } from "@/lib/dice/dice";

export const LOOT_CR_TIERS = ["any", "0-4", "5-10", "11-16", "17+"] as const;
export type LootCrTier = (typeof LOOT_CR_TIERS)[number];
export type LootEntryType = "item" | "currency" | "random";

export const LOOT_CR_TIER_LABELS: Record<LootCrTier, string> = {
  "any":   "Any tier",
  "0-4":   "CR 0–4",
  "5-10":  "CR 5–10",
  "11-16": "CR 11–16",
  "17+":   "CR 17+",
};

export interface LootEntry {
  /** Stable client-side uuid for v-for keying + reorder safety. */
  id: string;
  /** Entry kind. Absent in legacy entries → treated as "item". */
  type?: LootEntryType;
  /** 1–100 — chance this entry appears in a single roll. 100 = always. */
  drop_chance: number;
  /** Free-form DM note — editor-only, not shown to players. */
  notes?: string | null;

  // ── Item fields (type === "item") ──────────────────────────────────────────
  /** FK into `items`. Required when type = "item". Art objects are vault items
   *  of type "art_object" — no separate inline struct needed. */
  item_id?: string;
  /** Quantity dice expression (e.g. "3d6", "1d4+1"). Also used by "random". */
  dice?: string | null;
  /** Fixed quantity fallback when `dice` is null/empty. Also used by "random". */
  fixed_qty?: number | null;

  // ── Random-pick fields (type === "random") ─────────────────────────────────
  /** Required rarity filter — only vault items of this rarity are eligible. */
  rarity?: string;
  /** Optional item-type filter — narrows the pool further (e.g. "potion"). */
  item_type_filter?: string | null;

  // ── Currency fields (type === "currency") ──────────────────────────────────
  /** Optional label shown in chat (e.g. "Belt pouch"). */
  currency_label?: string | null;
  pp?: number;
  gp?: number;
  ep?: number;
  sp?: number;
  cp?: number;
}

export interface LootTable {
  id: string;
  user_id: string;
  campaign_id: string | null;
  name: string;
  description: string | null;
  cr_tier: LootCrTier;
  entries: LootEntry[];
  tags: string[];
  notes: string | null;
  monster_ids: string[];
  created_at: string;
  updated_at: string;
}

export type LootTableInsert = Omit<LootTable, "id" | "user_id" | "created_at" | "updated_at">;
export type LootTableUpdate = Partial<LootTableInsert>;

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Guard a quantity-bearing entry ("item"/"random") against configurations that
 * always hit but can never drop anything — a dice expression that can't roll
 * positive (e.g. "1d4-10") or a fixed quantity of 0 with no dice. These would
 * otherwise resolve to an `unresolved` result at roll time and under-deliver
 * silently, so we block them at save. (issue #487)
 */
function validateQuantity(e: LootEntry): string | null {
  if (e.dice !== null && e.dice !== undefined && e.dice !== "" && typeof e.dice !== "string") {
    return "Quantity dice must be a string like '2d4' or '3d6+2'.";
  }
  if (typeof e.dice === "string" && e.dice.trim()) {
    const parsed = parseExpression(e.dice);
    if (!parsed) return `"${e.dice}" isn't a valid quantity — try "1d4", "2d6+1", or a plain number.`;
    if (maxExpression(parsed) <= 0) {
      return `"${e.dice}" can never roll a positive quantity, so this entry would always drop nothing.`;
    }
    return null; // a valid dice expression takes precedence over fixed_qty
  }
  if (e.fixed_qty !== null && e.fixed_qty !== undefined) {
    if (!Number.isInteger(e.fixed_qty) || e.fixed_qty < 0) {
      return "Fixed quantity must be a non-negative integer.";
    }
    if (e.fixed_qty === 0) {
      return "Fixed quantity is 0 with no dice, so this entry would always drop nothing.";
    }
  }
  return null;
}

/** Returns a human-readable error message if any entry is malformed, or null. */
export function validateEntries(entries: LootEntry[]): string | null {
  for (const e of entries) {
    if (!Number.isFinite(e.drop_chance) || e.drop_chance < 1 || e.drop_chance > 100) {
      return "Drop chance must be between 1 and 100.";
    }
    const type = e.type ?? "item";
    if (type === "item") {
      if (!e.item_id) return "Every item entry must reference an item from the Vault.";
      const qtyError = validateQuantity(e);
      if (qtyError) return qtyError;
    } else if (type === "random") {
      if (!e.rarity) return "Random entries must have a rarity selected.";
      const qtyError = validateQuantity(e);
      if (qtyError) return qtyError;
    }
    // currency entries are valid as long as drop_chance is in range
  }
  return null;
}
