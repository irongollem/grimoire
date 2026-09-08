import { supabase } from "@/lib/supabase";

/** A single row's new position in a drag-reordered list. */
export interface ReorderEntry {
  id: string;
  sort_order: number;
}

/**
 * The per-table reorder RPCs — the first 5 from
 * supabase/migrations/20260730000008_reorder_sort_order_rpc.sql, each a
 * SECURITY DEFINER function that re-derives the caller from auth.uid() and
 * verifies ownership of every id before writing anything. `reorder_locations`
 * (20260904014714) is SECURITY INVOKER instead — the table's own UPDATE
 * policy is the authorization there — but takes the same `p_ids`/`p_orders`
 * shape, so it fits this one call surface without a special case.
 *
 * The obvious `upsert(rows, { onConflict: "id" })` was tried and rejected:
 * sending only `{ id, sort_order }` violates NOT NULL on every other column
 * the moment the insert path is taken, and it would need an INSERT policy the
 * reorder path has no business holding. An RPC that only ever UPDATEs is the
 * narrower grant.
 */
export type ReorderRpc =
  | "reorder_notes"
  | "reorder_player_journal_entries"
  | "reorder_soundboard_pages"
  | "reorder_sounds"
  | "reorder_party_inventory"
  | "reorder_locations";

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
