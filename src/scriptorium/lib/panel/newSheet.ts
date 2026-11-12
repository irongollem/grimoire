/*
 * A blank sheet (#1181, Paintbox frame 09): the maths behind "Blank sheet" in the panel's Add to this page.
 * A sheet is the stock paper tiled to a chosen size, stored as the picture's original, with a paint step in
 * its recipe that names the paper and the sheet's exact size.
 */
import { MAX_BAKE_EDGE } from "@/scriptorium/illuminator/lib/renderBake";
import type { IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";

export interface SheetSize {
  width: number;
  height: number;
}

export interface SheetPreset extends SheetSize {
  id: string;
  label: string;
}

/** A4 at 300 dpi is 3508 px: a full page prints sharp and stays under the bake cap. */
const FULL_PAGE_EDGE = 3300;

/** The size with this width-over-height ratio whose long edge is `longEdge`, never past the bake cap. */
export function sheetSize(aspect: number, longEdge: number): SheetSize {
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const long = Math.min(Math.max(1, Math.round(longEdge)), MAX_BAKE_EDGE);
  return safe >= 1
    ? { width: long, height: Math.max(1, Math.round(long / safe)) }
    : { width: Math.max(1, Math.round(long * safe)), height: long };
}

/** The named sizes: the page's own shape, a half of it, a square and a wide one. */
export function sheetPresets(pageAspect: number): SheetPreset[] {
  const page = Number.isFinite(pageAspect) && pageAspect > 0 ? pageAspect : 1 / 1.414;
  return [
    { id: "full", label: "Full page", ...sheetSize(page, FULL_PAGE_EDGE) },
    { id: "half", label: "Half page", ...sheetSize(page * 2, FULL_PAGE_EDGE * page) },
    { id: "square", label: "Square", ...sheetSize(1, 2400) },
    { id: "wide", label: "Wide", ...sheetSize(16 / 10, 3200) },
  ];
}

/** The minimal slice of a 2D context the tiling uses, so a test can count the draws. */
export interface TileContext {
  drawImage: (image: CanvasImageSource, x: number, y: number, width: number, height: number) => void;
}

/**
 * Lay the seamless tile over the whole sheet from the top left, drawn `scale` times larger than it is, the last
 * row and column running off the edge.
 */
export function tileSurface(ctx: TileContext, tile: CanvasImageSource, tileWidth: number, tileHeight: number, width: number, height: number, scale = 1): number {
  if (tileWidth <= 0 || tileHeight <= 0 || !(scale > 0)) throw new Error("The paper has no size to tile.");
  const w = tileWidth * scale;
  const h = tileHeight * scale;
  let drawn = 0;
  for (let y = 0; y < height; y += h) {
    for (let x = 0; x < width; x += w) {
      ctx.drawImage(tile, x, y, w, h);
      drawn++;
    }
  }
  return drawn;
}

/** The recipe of a blank sheet: one paint step on the paper, no layers yet. */
export function blankSheetRecipe(paperId: string, size: SheetSize, seed: number): IlluminateSettings {
  return { v: 1, seed, steps: [{ type: "paint", width: size.width, height: size.height, paper: paperId, layers: [] }] };
}
