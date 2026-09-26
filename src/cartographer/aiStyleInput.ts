// ── AI Style input for Atlas Build (epic #884, site map stack) ─────────────
//
// The styler restyles what the DM actually sees in Build: the Picture
// underneath (if any, placed by its own `grid_calibration`) with the
// Drawing's live bake on top, transparent wherever nothing is painted — the
// same two visual layers `MapStackImage.vue` composes for display
// (`showsUnderlyingPicture`, `placePicture`). The Plan (regions, doors,
// zones) and the runtime-only layers (tokens, fog) never go into this image
// — they aren't visual art, they're data drawn as an overlay elsewhere.
//
// The standalone `/cartographer/:id` route has no site Picture at all, so
// `useMapExport` keeps calling `bakeMapForAI` directly there rather than
// through this module — see that composable's `site` option. Both paths fit
// to the resolved provider's accepted aspect window and pixel budget before
// sending (`bake.ts`'s `fitStyleInputCanvas`) — see `bakeMapForAI`'s own doc
// for why — and both return the fitting geometry a save uses to write
// `grid_calibration` for the styled result.

import { bakeMap, bakeMapForAI, computeBakedDimensions, fitStyleInputCanvas } from "./bake";
import type { AspectPadGeometry, StyleImageProvider } from "./bake";
import { BASE_TILE_SIZE } from "./packSchema";
import type { PackCategory } from "./packSchema";
import type { TilePackRuntime } from "./packLoader";
import { placePicture } from "@/lib/locations/mapStack";
import type { MapImageLayer, MapStack } from "@/lib/locations/mapStack";
import { DEFAULT_GRID_OPACITY, type GridCalibration } from "@/types/location.types";
import type { CellKey, DungeonMap } from "@/types/dungeonMap.types";

/**
 * The calibration the Drawing's CURRENT bake would carry if it were
 * published right now — the same formula Publish itself writes to
 * `map_layer_calibration` (`useMapPublish.ts`'s `publish()`), just not
 * written anywhere. Lets `bakeAiStyleInput` place a Picture correctly
 * beneath a live, possibly-unpublished bake, without waiting for the DM to
 * publish first. Also the source of `origin_cell_x/y` for
 * `styledPictureCalibration` below — padding shifts *where* an image cell
 * (0,0) sits in the frame, never *which map cell* it is.
 */
export function liveDrawingCalibration(map: DungeonMap, paddingCells?: number): GridCalibration {
  const dims = computeBakedDimensions(map, paddingCells);
  return {
    cells_per_image_width: dims.cols,
    origin_x_pct: 0,
    origin_y_pct: 0,
    origin_cell_x: dims.originCellX,
    origin_cell_y: dims.originCellY,
  };
}

/**
 * The `grid_calibration` a styled render can be saved with — built entirely
 * from the padding geometry computed *before* sending, never from measuring
 * whatever comes back. That's safe because the edge function derives the
 * size it asks the provider for from this same sent image's own dimensions
 * (`supabase/functions/style-map/index.ts`), so the request always matches
 * what we sent: any resize between send and result is then a plain fit onto
 * the same aspect ratio, and `cells_per_image_width` / `origin_x_pct` /
 * `origin_y_pct` are ratios that leaves unchanged — see `bake.ts`'s
 * `fitStyleInputCanvas` doc for the full argument. `origin_cell_x/y` carry
 * over from the Drawing's own cell space (`liveDrawingCalibration`)
 * untouched by padding, so a fresh correction drawing started after this
 * save still registers on the right cells (see `MapWorkbench.vue`'s
 * reference-ghost layer, keyed on exactly these three calibration fields).
 * This is a first guess, not a guarantee: the model can still shrink or grow
 * the grid a little in its own render, which is exactly what the Layers
 * panel's Calibrate action stays available to correct.
 */
export function styledPictureCalibration(map: DungeonMap, geometry: AspectPadGeometry): GridCalibration {
  const { origin_cell_x, origin_cell_y } = liveDrawingCalibration(map);
  return {
    cells_per_image_width: geometry.cellsPerImageWidth,
    origin_x_pct: geometry.originXPct,
    origin_y_pct: geometry.originYPct,
    origin_cell_x,
    origin_cell_y,
    grid_opacity: DEFAULT_GRID_OPACITY,
  };
}

/** Fetches and decodes an image URL for canvas compositing. Bytes are read
 *  through `fetch` rather than an `<img crossorigin>` element so the result
 *  is a plain `Blob` — never a tainted canvas source — as long as the host
 *  allows the cross-origin read (the same requirement `FocalImage.vue`'s
 *  `crossOrigin = "anonymous"` smartcrop probe already relies on for these
 *  same public location-image URLs). */
async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the Picture for AI styling (${res.status})`);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

/**
 * Builds the AI styler's input for a site in Build. With a calibrated
 * Picture, composites it beneath a transparent live bake of the Drawing, at
 * the place `placePicture` puts it — exactly the pair `MapStackImage.vue`
 * shows the DM — then fits the composite to the resolved provider's accepted
 * aspect window and pixel budget exactly like `bakeMapForAI` does. Without a
 * calibrated Picture (a fresh Drawing with nothing underneath yet), falls
 * back to `bakeMapForAI`'s own plain, already-fitted Drawing bake unchanged.
 */
export async function bakeAiStyleInput(
  map: DungeonMap,
  runtimes: Map<string, TilePackRuntime>,
  picture: MapImageLayer | null,
  glyphs: Record<CellKey, PackCategory> = {},
  provider: StyleImageProvider = "openai",
): Promise<{ blob: Blob; geometry: AspectPadGeometry; size: { width: number; height: number } }> {
  if (!picture?.calibration) return bakeMapForAI(map, runtimes, {}, glyphs, provider);

  const ts = BASE_TILE_SIZE;
  const dims = computeBakedDimensions(map);
  const frameW = dims.cols * ts;
  const frameH = dims.rows * ts;

  const [drawingBlob, pictureBitmap] = await Promise.all([
    bakeMap(map, runtimes, { transparent: true }, glyphs),
    loadBitmap(picture.url),
  ]);
  const drawingBitmap = await createImageBitmap(drawingBlob);

  // `placePicture` only reads `.drawing` and `.picture` off the stack — the
  // rest of this shape is never consulted, so it's filled with inert values.
  const stackForPlacement: MapStack = {
    picture,
    drawing: { kind: "drawing", url: "", calibration: liveDrawingCalibration(map) },
    primary: null,
    frameCalibration: null,
    blank: null,
    hasAnyLayer: true,
  };
  const rect = placePicture(
    stackForPlacement,
    { w: frameW, h: frameH },
    { w: pictureBitmap.width, h: pictureBitmap.height },
  );

  const canvas = new OffscreenCanvas(frameW, frameH);
  const ctx = canvas.getContext("2d")!;
  // Opaque backing: if the two calibrations don't overlap the Picture is
  // simply drawn covering the frame below (mirroring `MapStackImage.vue`'s
  // own "reasonable placement to start from" fallback), so there's no gap
  // for this fill to actually show through in practice — kept for the same
  // reason `bakeMapForAI`'s plain bake keeps one: a stray sliver at the
  // frame edge should read as backing, never as attacker-visible transparency.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, frameW, frameH);
  if (rect) {
    ctx.drawImage(pictureBitmap, rect.left * frameW, rect.top * frameH, rect.width * frameW, rect.height * frameH);
  } else {
    ctx.drawImage(pictureBitmap, 0, 0, frameW, frameH);
  }
  ctx.drawImage(drawingBitmap, 0, 0, frameW, frameH);

  const { canvas: fitted, geometry, size } = fitStyleInputCanvas(canvas, dims.cols, provider);
  const blob = await fitted.convertToBlob({ type: "image/png" });
  return { blob, geometry, size };
}
