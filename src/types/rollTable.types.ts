// ── Random encounter / wandering monster tables (issue #120) ─────────────────
//
// Each table has a fixed die (1d4 ... 1d100) and a flat list of entries
// addressed by inclusive ranges. Entries can either reference an Encounter
// from the bestiary (the canonical source) or fall back to a free-text label
// for results the DM hasn't built an Encounter entity for yet.
//
// Entries live in JSONB on `roll_tables.entries` rather than a separate
// table — most tables have 4–20 entries, JSONB keeps reordering/batch edits
// a single update, and we don't need to query into individual entries.

export const ROLL_TABLE_DICE = ["1d4", "1d6", "1d8", "1d10", "1d12", "1d20", "1d100"] as const;
export type RollTableDie = (typeof ROLL_TABLE_DICE)[number];

/** Maximum face for each supported die — matches the right side of the dice string. */
export const ROLL_TABLE_DIE_MAX: Record<RollTableDie, number> = {
  "1d4":   4,
  "1d6":   6,
  "1d8":   8,
  "1d10":  10,
  "1d12":  12,
  "1d20":  20,
  "1d100": 100,
};

export interface RollTableEntry {
  /** Stable client-side uuid for v-for keying + reorder safety. */
  id: string;
  /** Inclusive range start (1..die_max). */
  min: number;
  /** Inclusive range end (>= min, <= die_max). */
  max: number;
  /** Display label / free-text description. Required even when an
   *  encounter is linked — used as the headline shown when the result is
   *  rolled, the encounter's name is shown as a sub-line. */
  label: string;
  /** Optional FK into `encounters` — we never JOIN on this server-side,
   *  the client resolves it via `useEncounters()` for display + navigation. */
  encounter_id?: string | null;
  /** Free-form DM note shown alongside the rolled entry. */
  notes?: string | null;
}

export interface RollTable {
  id: string;
  user_id: string;
  campaign_id: string | null;
  name: string;
  description: string | null;
  dice: RollTableDie;
  entries: RollTableEntry[];
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type RollTableInsert = Omit<RollTable, "id" | "user_id" | "created_at" | "updated_at">;
export type RollTableUpdate = Partial<RollTableInsert>;

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Returns a human-readable error message if the entry list has gaps or
 * overlaps within [1, die_max], or null if the coverage is clean.
 *
 * Sparse coverage (e.g. only 1–3 on a 1d6) is ALLOWED and intentional —
 * a DM may want "no encounter" on rolls 4–6 — but overlapping ranges and
 * out-of-bounds rolls are always errors.
 */
export function validateEntryRanges(entries: RollTableEntry[], die: RollTableDie): string | null {
  const max = ROLL_TABLE_DIE_MAX[die];
  for (const e of entries) {
    if (!Number.isInteger(e.min) || !Number.isInteger(e.max)) return `Entry "${e.label || "(unnamed)"}" has non-integer range.`;
    if (e.min < 1 || e.max > max) return `Entry "${e.label || "(unnamed)"}" has range ${e.min}–${e.max}, outside 1–${max}.`;
    if (e.min > e.max) return `Entry "${e.label || "(unnamed)"}" has min (${e.min}) greater than max (${e.max}).`;
  }
  // Overlap check — sort by min, then walk.
  const sorted = [...entries].sort((a, b) => a.min - b.min);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min <= sorted[i - 1].max) {
      return `Entries "${sorted[i - 1].label || "(unnamed)"}" and "${sorted[i].label || "(unnamed)"}" overlap.`;
    }
  }
  return null;
}
