/*
 * Every stored picture a book's page furniture holds (#1176 story 9). A
 * treated art item keeps its `src` (the bake), its `original` and the pictures
 * its recipe points at, all in `props`. Cleanup diffs these between two saves.
 *
 * Only what the Illuminator made is ever removed (ownedPictures.ts): art can be
 * any picture of ours, so its `src` and `original` may be a place's art or a
 * picture the author keeps elsewhere, and leaving the page must not delete it.
 */
import { heldUrls, madeUrls } from "@/scriptorium/illuminator/lib/ownedPictures";
import type { PageFurnitureItem } from "@/scriptorium/types";

/** Every picture the art items refer to, originals included. */
export function furniturePictureUrls(items: readonly PageFurnitureItem[]): string[] {
  const urls = new Set<string>();
  for (const item of items) {
    if (item.kind !== "art") continue;
    for (const url of heldUrls(item.props)) urls.add(url);
  }
  return [...urls];
}

/** What the old list held that the Illuminator made for this author and the new one no longer holds. */
export function removedFurnitureUrls(
  previous: readonly PageFurnitureItem[],
  next: readonly PageFurnitureItem[],
  userId: string | null | undefined,
): string[] {
  const kept = new Set(furniturePictureUrls(next));
  const made = previous.flatMap((item) => (item.kind === "art" ? madeUrls(item.props, userId) : []));
  return [...new Set(made)].filter((url) => !kept.has(url));
}
