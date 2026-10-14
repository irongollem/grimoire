// Pack-independent image loading for Dressing props (epic #1062). A prop's art
// is one library image, not part of any tile pack, so it is loaded and cached
// by url on its own. No vue.

import { loadImage } from "./packLoader";
import type { LibraryDressing } from "@/types/dressing.types";
import type { DressingCatalog, DressingProp } from "./dressing";

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

/** Resolves null when the image fails, like the pack loader: a missing picture
 *  falls back to the placeholder instead of breaking the map. */
export function loadDressingImage(url: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const pending = loadImage(url);
  imageCache.set(url, pending);
  return pending;
}

/** Test seam: forget every cached image. */
export function clearDressingImageCache(): void {
  imageCache.clear();
}

/** `images` is keyed by image url; a prop whose url has no loaded image draws as a placeholder. */
export function buildDressingCatalog(
  rows: readonly LibraryDressing[],
  images: ReadonlyMap<string, CanvasImageSource>,
): DressingCatalog {
  const catalog = new Map<string, DressingProp>();
  for (const row of rows) {
    catalog.set(row.id, {
      id: row.id,
      name: row.name,
      footprint_w: row.footprint_w,
      footprint_h: row.footprint_h,
      image: row.image_url === null ? null : (images.get(row.image_url) ?? null),
    });
  }
  return catalog;
}
