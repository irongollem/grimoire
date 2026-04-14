/**
 * Rolling a loot table.
 *
 * Walks each entry, rolls its drop_chance (1d100 ≤ chance), and for hits
 * rolls the quantity expression. Falls back to fixed_qty (or 1) when no
 * dice expression is set.
 *
 * Returns `RolledLootEntry[]` — entries that hit, each with a final integer
 * quantity and the snapshot of the source item id/name/image so the result
 * can be rendered without a follow-up Item Vault query.
 */

import { rollDie } from "@/lib/dice";
import { rollParsed } from "@/lib/roller";
import { parseExpression } from "@/lib/dice";
import type { Item } from "@/types/item.types";
import type { LootEntry, LootTable } from "@/types/lootTable.types";

export interface RolledLootEntry {
  /** The matching entry's stable id — useful for chest-drop atom expansion. */
  entry_id: string;
  item_id: string;
  item_name: string;
  item_image_url: string | null;
  qty: number;
  notes?: string | null;
}

/** Roll the table once. `itemsById` snapshots Vault items for display. */
export function rollLootTable(
  table: LootTable,
  itemsById: Map<string, Item>,
): RolledLootEntry[] {
  const results: RolledLootEntry[] = [];
  for (const entry of table.entries) {
    if (!entryHits(entry)) continue;
    const item = itemsById.get(entry.item_id);
    if (!item) continue; // entry references a deleted item — skip silently
    const qty = rollQuantity(entry);
    if (qty <= 0) continue;
    results.push({
      entry_id: entry.id,
      item_id: entry.item_id,
      item_name: item.name,
      item_image_url: item.image_url,
      qty,
      notes: entry.notes ?? null,
    });
  }
  return results;
}

function entryHits(entry: LootEntry): boolean {
  // Always-true entries skip the d100 roll for clarity (and to avoid a
  // wasted dice sound on guaranteed loot).
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
