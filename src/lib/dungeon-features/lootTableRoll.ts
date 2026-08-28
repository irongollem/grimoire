/**
 * Rolling a loot table.
 *
 * Walks each entry, rolls its drop_chance (1d100 ≤ chance), and for hits
 * resolves the entry into a RolledLootEntry record.
 *
 * Entry types:
 *   "item"     — rolls quantity (dice or fixed); one result per hit
 *   "random"   — picks one matching Vault item at random, then rolls quantity
 *   "currency" — no quantity roll; whole coin pool drops as one result
 *
 * A hit that resolves to nothing (deleted item, empty candidate pool, or a
 * quantity of ≤ 0) is NOT silently dropped: it produces an `unresolved` result
 * carrying the reason, so callers can tell "the chest under-delivered" apart
 * from "the entry simply didn't drop". (issue #487)
 *
 * Art objects are vault items of type "art_object" — use item entries.
 */

import { rollDie } from "@/lib/dice/dice";
import { rollParsed } from "@/lib/dice/roller";
import { parseExpression } from "@/lib/dice/dice";
import type { Item } from "@/types/item.types";
import { ITEM_RARITY_LABELS, ITEM_TYPE_LABELS } from "@/types/item.types";
import type { LootEntry, LootTable } from "@/types/lootTable.types";

// ── Result types ──────────────────────────────────────────────────────────────

interface RolledBase {
  entry_id: string;
  notes?: string | null;
}

export interface RolledItemEntry extends RolledBase {
  type: "item";
  item_id: string;
  item_name: string;
  item_image_url: string | null;
  qty: number;
}

export interface RolledCurrencyEntry extends RolledBase {
  type: "currency";
  currency_label?: string | null;
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

/** Why a hit entry produced no loot. */
export type UnresolvedReason =
  | "no_matching_items"      // "random" entry: nothing in the Vault matched the filter
  | "non_positive_quantity"  // dice/fixed quantity resolved to ≤ 0
  | "item_deleted";          // "item" entry pointing at a Vault item that no longer exists

/**
 * A hit that couldn't be turned into loot. Kept in the result set (rather than
 * dropped) so the DM sees the chest under-delivered before dropping it.
 */
export interface RolledUnresolvedEntry extends RolledBase {
  type: "unresolved";
  reason: UnresolvedReason;
  /** What the entry would have granted, for display (item name / "Rare weapon"). */
  wanted: string;
}

export type RolledLootEntry =
  | RolledItemEntry
  | RolledCurrencyEntry
  | RolledUnresolvedEntry;

/** DM-facing explanation for each unresolved reason. */
export function unresolvedReasonLabel(reason: UnresolvedReason): string {
  switch (reason) {
    case "no_matching_items":
      return "nothing in the Vault matched";
    case "non_positive_quantity":
      return "quantity rolled to zero";
    case "item_deleted":
      return "item no longer in the Vault";
  }
}

// ── Core roller ───────────────────────────────────────────────────────────────

/** Roll the table once. `itemsById` snapshots Vault items for display. */
export function rollLootTable(
  table: LootTable,
  itemsById: Map<string, Item>,
): RolledLootEntry[] {
  const results: RolledLootEntry[] = [];

  for (const entry of table.entries) {
    if (!entryHits(entry)) continue;
    const type = entry.type ?? "item";

    if (type === "item") {
      const item = itemsById.get(entry.item_id ?? "");
      if (!item) {
        results.push(unresolved(entry, "item_deleted", entry.notes?.trim() || "A removed item"));
        continue;
      }
      const qty = rollQuantity(entry);
      if (qty <= 0) {
        results.push(unresolved(entry, "non_positive_quantity", item.name));
        continue;
      }
      results.push({
        type: "item",
        entry_id: entry.id,
        item_id: entry.item_id!,
        item_name: item.name,
        item_image_url: item.image_url,
        qty,
        notes: entry.notes ?? null,
      });
    } else if (type === "random") {
      // Build a pool of matching vault items then pick one at random.
      const pool = [...itemsById.values()].filter(
        (it) =>
          it.rarity === entry.rarity &&
          (!entry.item_type_filter || it.item_type === entry.item_type_filter),
      );
      if (pool.length === 0) {
        results.push(unresolved(entry, "no_matching_items", randomWantedLabel(entry)));
        continue;
      }
      const item = pool[Math.floor(Math.random() * pool.length)];
      const qty = rollQuantity(entry);
      if (qty <= 0) {
        results.push(unresolved(entry, "non_positive_quantity", item.name));
        continue;
      }
      results.push({
        type: "item",
        entry_id: entry.id,
        item_id: item.id,
        item_name: item.name,
        item_image_url: item.image_url,
        qty,
        notes: entry.notes ?? null,
      });
    } else {
      // currency
      results.push({
        type: "currency",
        entry_id: entry.id,
        currency_label: entry.currency_label ?? null,
        pp: entry.pp ?? 0,
        gp: entry.gp ?? 0,
        ep: entry.ep ?? 0,
        sp: entry.sp ?? 0,
        cp: entry.cp ?? 0,
        notes: entry.notes ?? null,
      });
    }
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function entryHits(entry: LootEntry): boolean {
  if (entry.drop_chance >= 100) return true;
  return rollDie(100) <= entry.drop_chance;
}

function unresolved(
  entry: LootEntry,
  reason: UnresolvedReason,
  wanted: string,
): RolledUnresolvedEntry {
  return { type: "unresolved", entry_id: entry.id, reason, wanted, notes: entry.notes ?? null };
}

/** Human label for what a "random" entry was trying to drop (e.g. "Rare weapon"). */
function randomWantedLabel(entry: LootEntry): string {
  const rarity = entry.rarity
    ? (ITEM_RARITY_LABELS[entry.rarity as keyof typeof ITEM_RARITY_LABELS] ?? entry.rarity)
    : "";
  const type = entry.item_type_filter
    ? (ITEM_TYPE_LABELS[entry.item_type_filter as keyof typeof ITEM_TYPE_LABELS] ?? entry.item_type_filter)
    : "item";
  return [rarity, type].filter(Boolean).join(" ") || "item";
}

function rollQuantity(entry: LootEntry): number {
  if (entry.dice && entry.dice.trim()) {
    const parsed = parseExpression(entry.dice);
    if (parsed) {
      const { total } = rollParsed(parsed);
      return Math.max(0, Math.floor(total));
    }
  }
  // An explicit fixed_qty — including 0, which means "hits but grants nothing" —
  // is honored as-is; the ≤ 0 case surfaces as an unresolved entry upstream.
  // Only a null/undefined fixed_qty falls through to the default of 1.
  if (entry.fixed_qty !== null && entry.fixed_qty !== undefined) return entry.fixed_qty;
  return 1;
}
