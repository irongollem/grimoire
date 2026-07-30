import { supabase } from "@/lib/supabase";

/** A single row's new position in a drag-reordered list. */
export interface ReorderEntry {
  id: string;
  sort_order: number;
}

/**
 * The 5 per-table reorder RPCs — see
 * supabase/migrations/20260730000008_reorder_sort_order_rpc.sql. Each is a
 * SECURITY DEFINER function that re-derives the caller from auth.uid() and
 * verifies ownership of every id before writing anything.
 */
export type ReorderRpc =
  | "reorder_notes"
  | "reorder_player_journal_entries"
  | "reorder_soundboard_pages"
  | "reorder_sounds"
  | "reorder_party_inventory";

/**
 * Turns a drag-reordered list of ids into {id, sort_order} pairs, where an
 * id's position in the array becomes its new 0-based sort_order.
 */
export function toReorderEntries(orderedIds: string[]): ReorderEntry[] {
  return orderedIds.map((id, sort_order) => ({ id, sort_order }));
}

/**
 * Splits {id, sort_order} pairs into the parallel arrays the RPCs take,
 * preserving pairing (ids[i]/orders[i] belong together).
 */
export function toRpcArrays(entries: ReorderEntry[]): { ids: string[]; orders: number[] } {
  return {
    ids: entries.map((e) => e.id),
    orders: entries.map((e) => e.sort_order),
  };
}

/**
 * Persists a drag-to-reorder in a single round trip via one of the per-table
 * reorder RPCs, replacing the old `Promise.all` of N individual
 * `update ... where id = ...` calls. A caller passing an id it doesn't own
 * changes nothing — the RPC rejects the whole call.
 */
export async function persistReorder(rpc: ReorderRpc, entries: ReorderEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const { ids, orders } = toRpcArrays(entries);
  const { error } = await supabase.rpc(rpc, { p_ids: ids, p_orders: orders });
  if (error) throw error;
}
