import { isUuid } from "@/lib/library/contentIdentity";

/**
 * A `party_inventory` row points at its catalogue entry through one of two
 * columns, and this module is the only place that should care which.
 *
 * `item_id` is a uuid FK to `items(id)` — the owner's own vault row. It was the
 * only option until #815, because it predates the shared library entirely.
 * `library_items.id` is text, so a player picking anything from the shared
 * catalogue produced `invalid input syntax for type uuid` on the insert: the
 * whole library was selectable and none of it addable.
 *
 * `library_item_id` is the second reference, added by migration
 * 20260905092259. Referencing shared content beats copying it — the copy is
 * what `useEnsureOwnedItem` does, and 673 such rows on a single long-standing
 * account are exactly the per-account duplication the shared library exists to
 * remove.
 *
 * A database check constraint allows at most one of the two. Both null is
 * legal and common: a row can be free text with no catalogue entry behind it
 * at all, which is how improvised loot ("a bloodied ledger") is recorded.
 */

/** The two reference columns as stored on a `party_inventory` row. */
export interface ItemRefColumns {
  item_id: string | null;
  library_item_id: string | null;
}

/**
 * The id to look up in the merged item list (`useItems` / `usePlayerVisibleItems`
 * return vault rows keyed by uuid and library rows keyed by text in one array,
 * so a single `find` resolves either once handed the right id).
 *
 * Returns `null` for a row with no catalogue entry — callers must handle that
 * rather than substituting a placeholder id.
 */
export function inventoryItemRef(row: ItemRefColumns): string | null {
  return row.item_id ?? row.library_item_id;
}

/**
 * Split a picked id into the column it belongs in, for writes.
 *
 * The shape of the id is the only signal available at the picker — a uuid is a
 * vault row, anything else is library content — which is why `isUuid` decides
 * rather than a flag threaded down from the UI.
 */
export function itemRefColumns(pickedId: string | null | undefined): ItemRefColumns {
  if (!pickedId) return { item_id: null, library_item_id: null };
  return isUuid(pickedId)
    ? { item_id: pickedId, library_item_id: null }
    : { item_id: null, library_item_id: pickedId };
}

/** True when two rows reference the same catalogue entry — stack/ingredient matching. */
export function sameItemRef(a: ItemRefColumns, b: ItemRefColumns): boolean {
  const left = inventoryItemRef(a);
  const right = inventoryItemRef(b);
  return left !== null && left === right;
}
