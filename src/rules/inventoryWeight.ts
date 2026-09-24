import { inventoryItemRef, type ItemRefColumns } from "@/lib/itemRef";

/**
 * Per-unit weight (lb) of an inventory row, resolved through its catalogue
 * reference — vault (`item_id`) or shared library (`library_item_id`) — via
 * {@link inventoryItemRef}, against a map of catalogue id → weight.
 *
 * A row with no catalogue entry, or whose entry isn't in the map, weighs 0
 * rather than throwing: free-text loot ("a bloodied ledger") is legal and
 * common, and a not-yet-loaded weight map must not make carried items vanish
 * from the total.
 */
export function inventoryItemWeightPerUnit(
  row: ItemRefColumns,
  weightMap: Map<string, number>,
): number {
  const ref = inventoryItemRef(row);
  return ref ? (weightMap.get(ref) ?? 0) : 0;
}

/** Total weight (lb) of an inventory row — per-unit weight times quantity. */
export function inventoryItemWeight(
  row: ItemRefColumns & { quantity: number },
  weightMap: Map<string, number>,
): number {
  return inventoryItemWeightPerUnit(row, weightMap) * row.quantity;
}
