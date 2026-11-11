/*
 * Every stored picture a book's page furniture holds (#1176 story 9). A
 * treated art item keeps its `src` (the bake), its `original` and the pictures
 * its recipe points at, all in `props`. Cleanup diffs these between two saves,
 * so a superseded bake is deleted and an original only once nothing holds it.
 */
import { parseSettings, pictureUrls } from "@/scriptorium/illuminator/lib/treatment";
import type { PageFurnitureItem } from "@/scriptorium/types";

export function furniturePictureUrls(items: readonly PageFurnitureItem[]): string[] {
  const urls = new Set<string>();
  for (const item of items) {
    if (item.kind !== "art") continue;
    const { src, original, illuminate } = item.props;
    for (const url of [src, original, ...pictureUrls(parseSettings(illuminate))]) {
      if (typeof url === "string" && url !== "") urls.add(url);
    }
  }
  return [...urls];
}

/** URLs the old list held that the new one no longer does. */
export function removedFurnitureUrls(previous: readonly PageFurnitureItem[], next: readonly PageFurnitureItem[]): string[] {
  const kept = new Set(furniturePictureUrls(next));
  return furniturePictureUrls(previous).filter((url) => !kept.has(url));
}
