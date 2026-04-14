/**
 * Rolling a loot table.
 *
 * Walks each entry, rolls its drop_chance (1d100 ≤ chance), and for hits
 * resolves the entry into one or more RolledLootEntry records.
 *
 * Entry types:
 *   "item"       — rolls quantity (dice or fixed), one hit per qty unit
 *   "currency"   — no quantity roll; whole coin pool hits as one result
 *   "art_object" — drops as one result per hit
 *
 * Returns RolledLootEntry[] — only the entries that actually hit.
 */

import { rollDie } from "@/lib/dice";
import { rollParsed } from "@/lib/roller";
import { parseExpression } from "@/lib/dice";
import type { Item } from "@/types/item.types";
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

export interface RolledArtEntry extends RolledBase {
  type: "art_object";
  art_name: string;
  value_gp: number;
  art_image_url?: string | null;
  art_description?: string | null;
}

export type RolledLootEntry = RolledItemEntry | RolledCurrencyEntry | RolledArtEntry;

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
      if (!item) continue; // references a deleted item — skip silently
      const qty = rollQuantity(entry);
      if (qty <= 0) continue;
      results.push({
        type: "item",
        entry_id: entry.id,
        item_id: entry.item_id!,
        item_name: item.name,
        item_image_url: item.image_url,
        qty,
        notes: entry.notes ?? null,
      });
    } else if (type === "currency") {
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
    } else {
      // art_object
      if (!entry.art_name) continue;
      results.push({
        type: "art_object",
        entry_id: entry.id,
        art_name: entry.art_name,
        value_gp: entry.value_gp ?? 0,
        art_image_url: entry.art_image_url ?? null,
        art_description: entry.art_description ?? null,
        notes: entry.notes ?? null,
      });
    }
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function entryHits(entry: LootEntry): boolean {
  // Always-true entries skip the d100 roll (and avoid a wasted dice sound).
  if (entry.drop_chance >= 100) return true;
  return rollDie(100) <= entry.drop_chance;
}

function rollQuantity(entry: LootEntry): number {
  if (entry.dice && entry.dice.trim()) {
    const parsed = parseExpression(entry.dice);
    if (parsed) {
      const { total } = rollParsed(parsed);
      return Math.max(0, Math.floor(total));
    }
  }
  if (entry.fixed_qty !== null && entry.fixed_qty !== undefined && entry.fixed_qty > 0) return entry.fixed_qty;
  return 1;
}
