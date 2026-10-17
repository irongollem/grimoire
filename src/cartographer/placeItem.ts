// Helpers for what the Place tool holds (`PlaceItem`, tools.ts): comparing two selections,
// naming one, and the short "recent" list the catalogue keeps. Pure, so the drawer, the
// options slip and the workbench agree on all three.

import type { PlaceItem } from "@/cartographer/tools";
import { stampLabel, variantLabel } from "@/cartographer/stampCategories";
import type { TilePackManifest } from "@/cartographer/packSchema";

export const RECENT_PLACE_ITEMS = 8;

export function samePlaceItem(a: PlaceItem | null, b: PlaceItem | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "prop") return b.kind === "prop" && a.propId === b.propId;
  return b.kind === "object" && a.category === b.category && a.variant === b.variant;
}

/** `item` first, any earlier copy of it dropped, the list cut to `max`. */
export function pushRecent(list: readonly PlaceItem[], item: PlaceItem, max = RECENT_PLACE_ITEMS): PlaceItem[] {
  return [item, ...list.filter((entry) => !samePlaceItem(entry, item))].slice(0, max);
}

/** What an item is called on screen. A prop whose row is gone from the library is "Unknown prop". */
export function placeItemLabel(
  item: PlaceItem,
  manifest: Pick<TilePackManifest, "labels"> | null,
  propName: (id: string) => string | undefined,
): string {
  if (item.kind === "prop") return propName(item.propId) ?? "Unknown prop";
  const type = stampLabel(manifest, item.category);
  return item.variant === "any" ? `${type} (any)` : variantLabel(manifest, item.category, item.variant);
}
