/*
 * Make a blank sheet's original (#1181): the paper tiled to size, encoded as WebP and stored in asset-images
 * under the author's own id. Named `sheet-...`, never `ill-...`: it is the picture's original, the file the
 * recipe starts from, so cleanup (ownedPictures.ts) never deletes it while the picture exists.
 */
import { artUrl } from "@/lib/assets/artUrl";
import { uploadToBucket } from "@/lib/storage";
import { loadDomImage } from "@/scriptorium/illuminator/lib/loadImage";
import { encodeWebp } from "@/lib/webpEncode";
import type { Paper } from "@/scriptorium/papers/papers";
import { tileSurface, type SheetSize } from "@/scriptorium/lib/panel/newSheet";

export function sheetPath(userId: string, random: string = crypto.randomUUID().slice(0, 8)): string {
  return `${userId}/sheet-${random}.webp`;
}

/** Render the paper at this size and store it. Returns the public URL of the original. */
export async function uploadBlankSheet(paper: Paper, size: SheetSize, userId: string): Promise<string> {
  const tile = await loadDomImage(artUrl(paper.surfacePath));
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  tileSurface(ctx, tile, tile.naturalWidth, tile.naturalHeight, size.width, size.height, paper.surfaceScale);
  return storeSheet(canvas, userId);
}

/** Encode a sheet's canvas and store it under the author's own id. */
async function storeSheet(canvas: HTMLCanvasElement, userId: string): Promise<string> {
  const blob = await encodeWebp(canvas, 0.92);
  const url = await uploadToBucket({ bucket: "assetImages", blob, path: sheetPath(userId), contentType: "image/webp" });
  if (!url) throw new Error("Could not store the blank sheet.");
  return url;
}

/** A fully transparent sheet at this size (a painting on the page itself): nothing is drawn, the WebP keeps its alpha. */
export async function uploadTransparentSheet(size: SheetSize, userId: string): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  return storeSheet(canvas, userId);
}
