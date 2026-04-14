// ── Loot tables (issue #121) ─────────────────────────────────────────────────
//
// Every entry references an Item Vault row — no free-text loot. The item is
// the source of truth for name, rarity, image, and full detail. Coin/gems/
// consumables should already exist as Items (e.g. "Gold Piece", "Ruby").
//
// Each entry has a per-item drop chance (videogame-style loot rarity) and a
// quantity expression. Rolling the table walks each entry, rolls the chance,
// then rolls the quantity for hits — see `src/lib/lootTableRoll.ts`.

export const LOOT_CR_TIERS = ["any", "0-4", "5-10", "11-16", "17+"] as const;
export type LootCrTier = (typeof LOOT_CR_TIERS)[number];

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
  /** Required FK into `items`. Display name resolved by the editor / roller. */
  item_id: string;
  /** 1–100 — chance this entry appears in a single roll. 100 = always. */
  drop_chance: number;
  /** Quantity dice expression (e.g. "3d6", "1d4 + 1") — preferred when set. */
  dice?: string | null;
  /** Fixed quantity fallback (used when `dice` is null/empty). Defaults to 1. */
  fixed_qty?: number | null;
  /** Free-form DM note shown in the editor only — not in the roll output. */
  notes?: string | null;
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
  created_at: string;
  updated_at: string;
}

export type LootTableInsert = Omit<LootTable, "id" | "user_id" | "created_at" | "updated_at">;
export type LootTableUpdate = Partial<LootTableInsert>;

// ── Validation ───────────────────────────────────────────────────────────────

/** Returns a human-readable error message if any entry is malformed, or null. */
export function validateEntries(entries: LootEntry[]): string | null {
  for (const e of entries) {
    if (!e.item_id) return "Every loot entry must reference an item from the Vault.";
    if (!Number.isFinite(e.drop_chance) || e.drop_chance < 1 || e.drop_chance > 100) {
      return "Drop chance must be between 1 and 100.";
    }
    if (e.dice === null || e.dice === undefined || e.dice === "") {
      // OK — fixed_qty path
    } else if (typeof e.dice !== "string") {
      return "Quantity dice must be a string like '2d4' or '3d6 + 2'.";
    }
    if (e.fixed_qty != null && (!Number.isInteger(e.fixed_qty) || e.fixed_qty < 0)) {
      return "Fixed quantity must be a non-negative integer.";
    }
  }
  return null;
}
