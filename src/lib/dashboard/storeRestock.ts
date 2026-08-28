import { STORE_LOCATION_TYPES, type Location } from "@/types/location.types";
import type { StoreStockRow } from "@/composables/items/useStoreItems";

/**
 * Which of a campaign's shops are not ready for the party to walk into (#764).
 *
 * Two states, and neither of them is "stale". A staleness rule would have to
 * invent a number of days after which stock counts as old, and nothing in the
 * data supports one — a village smith restocked once a year is not a problem,
 * and a `updated_at` older than N days says nothing about whether the shelves
 * are bare. What *is* checkable is whether there is anything on them, and
 * whether the party can see it:
 *
 * - **`empty`** — a store-type location with no stock rows at all. The DM
 *   made a shop and never filled it.
 * - **`hidden`** — it has stock, but not one row is `visible`. From the
 *   players' side that is indistinguishable from an empty shop, which is
 *   exactly why it is worth surfacing separately: the DM thinks this one is
 *   done.
 *
 * A shop with visible stock is ready and does not appear at all, however old
 * its rows are.
 */

export type StoreRestockReason = "empty" | "hidden";

export interface StoreRestockRow {
  locationId: string;
  name: string;
  reason: StoreRestockReason;
  /** Rows on the shelf, all of them hidden when `reason` is `"hidden"`. */
  stockCount: number;
}

/** Shops first, then taverns and inns — `STORE_LOCATION_TYPES` decides which
 *  location types can hold stock at all, and nothing here second-guesses it. */
export function storeLocations(locations: readonly Location[]): Location[] {
  return locations.filter((location) => STORE_LOCATION_TYPES.has(location.location_type));
}

/**
 * `empty` before `hidden`, then by name.
 *
 * An empty shop is the bigger gap — there is nothing to sell at all — while a
 * hidden one at least has stock the DM can reveal in a second. Within a
 * reason, alphabetical, so the list does not reshuffle as counts change.
 */
export function buildStoreRestockRows(
  locations: readonly Location[],
  stock: readonly StoreStockRow[],
): StoreRestockRow[] {
  const counts = new Map<string, { total: number; visible: number }>();
  for (const row of stock) {
    const entry = counts.get(row.location_id);
    if (entry === undefined) {
      counts.set(row.location_id, { total: 1, visible: row.visible ? 1 : 0 });
      continue;
    }
    entry.total += 1;
    if (row.visible) entry.visible += 1;
  }

  const rows: StoreRestockRow[] = [];
  for (const location of storeLocations(locations)) {
    const entry = counts.get(location.id);
    if (entry === undefined || entry.total === 0) {
      rows.push({ locationId: location.id, name: location.name, reason: "empty", stockCount: 0 });
      continue;
    }
    if (entry.visible === 0) {
      rows.push({
        locationId: location.id,
        name: location.name,
        reason: "hidden",
        stockCount: entry.total,
      });
    }
  }

  const order: Record<StoreRestockReason, number> = { empty: 0, hidden: 1 };
  return rows.sort(
    (a, b) => order[a.reason] - order[b.reason] || a.name.localeCompare(b.name),
  );
}
