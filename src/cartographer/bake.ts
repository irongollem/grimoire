// Offline map renderer — produces a full-resolution OffscreenCanvas composite
// from a DungeonMap and its already-loaded TilePackRuntimes.
//
// bakeMap()       → WebP Blob (Atlas upload / Save to Atlas)
// bakeMapAsPng()  → PNG Blob  (client-side Download)
//
// Mirrors the render logic in CartographerEditorView but without viewport/zoom
// dependencies: cells are drawn at 1:1 scale (BASE_TILE_SIZE px per cell).

import { BASE_TILE_SIZE, type PackCategory } from "./packSchema";
import { drawMapContent, offscreenMakeCanvas } from "./drawMap";
import type { MapPass } from "./drawFrame";
import type { TilePackRuntime } from "./packLoader";
import type { CellKey, DungeonMap } from "@/types/dungeonMap.types";
import { nearestGeminiAspect } from "@edge-shared/geminiAspect.ts";
import { encodeWebp } from "@/lib/webpEncode";
import { dressingCellBounds, type DressingCatalog } from "./dressing";

export interface BakeOptions {
  /** Cells of black padding around the painted extent. Default: 3. */
  paddingCells?: number;
  /**
   * Skip the opaque `#000` ground fill so a cell with no floor stays alpha 0
   * — the Drawing layer (epic #884) sits over a Picture, which must show
   * through wherever nothing is painted. Wall-joint fill (the pack palette)
   * is unaffected: that paints per-cell where a joint is actually drawn, not
   * the whole canvas, so it stays opaque even in transparent mode. Default
   * false — the PNG download and the AI-styler input both want an opaque
   * backing, same as before.
   */
  transparent?: boolean;
  /**
   * Which part of the map to bake: `ground` (floor, shadows, rock) or
   * `standing` (props, walls, glyphs, labels). Both come out the same size and
   * at the same origin and padding, so one calibration fits both. Default
   * `all`, the whole map in one image.
   */
  pass?: MapPass;
  /**
   * Leave out the objects and Dressing the live battle map draws swaying (#1073), for the standing image that
   * rides under the live layer. Default false: every other surface shows the full standing image.
   */
  omitSway?: boolean;
}

export const DEFAULT_BAKE_PADDING_CELLS = 3;

/**
 * Computes the dimensions (in cells) the bake will produce for a given map.
 * Useful for downstream consumers like VTT grid calibration that need to know
 * the cell count without re-rasterising the map.
 *
 * Also returns the map cell that the baked image's cell (0,0) corresponds to
 * — what a `GridCalibration` stores as `origin_cell_x/y`
 * (`src/types/location.types.ts`). That is the *padded* corner, not the
 * painted bounding box's own min: the bake insets the drawing by
 * `paddingCells` on every side, so the image starts that many cells before
 * the first painted one.
 *
 * Deliberately returned already-padded rather than as a raw `minX`/`minY` the
 * caller subtracts from: `paddingCells` is a parameter, so a caller doing its
 * own subtraction with the default constant is correct only for as long as
 * nobody passes a different one.
 */
export function computeBakedDimensions(
  map: DungeonMap,
  dressing: DressingCatalog,
  paddingCells: number = DEFAULT_BAKE_PADDING_CELLS,
): { cols: number; rows: number; originCellX: number; originCellY: number } {
  const { minX, minY, maxX, maxY } = paintedExtent(map, dressing);
  return {
    cols: maxX - minX + 1 + paddingCells * 2,
    rows: maxY - minY + 1 + paddingCells * 2,
    originCellX: minX - paddingCells,
    originCellY: minY - paddingCells,
  };
}

/**
 * The painted bounding box in cells. One helper for both the dimensions and
 * the raster, because they must agree: a Dressing prop counts by every cell
 * its rotated footprint reaches, not by its anchor, so a table at the edge
 * is never cut off.
 */
function paintedExtent(map: DungeonMap, dressing: DressingCatalog): { minX: number; minY: number; maxX: number; maxY: number } {
  const layers = map.layers;
  const allKeys = [
    ...Object.keys(layers.floor),
    ...Object.keys(layers.solidBlock),
    ...Object.keys(layers.object),
    ...Object.keys(layers.annotation),
  ];
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  let any = false;
  const include = (x: number, y: number, x2 = x, y2 = y): void => {
    if (!any || x < minX) minX = x;
    if (!any || y < minY) minY = y;
    if (!any || x2 > maxX) maxX = x2;
    if (!any || y2 > maxY) maxY = y2;
    any = true;
  };
  for (const k of allKeys) {
    const [xs, ys] = k.split(",");
    include(Number(xs), Number(ys));
  }
  for (const placement of Object.values(layers.dressing)) {
    const b = dressingCellBounds(placement, dressing);
    include(b.minX, b.minY, b.maxX, b.maxY);
  }
  return { minX, minY, maxX, maxY };
}

// ── Internal helpers ───────────────────────────────────────────────────────

function renderToCanvas(
  map: DungeonMap,
  runtimes: Map<string, TilePackRuntime>,
  dressing: DressingCatalog,
  paddingCells: number,
  glyphs: Record<CellKey, PackCategory> = {},
  transparent: boolean = false,
  pass: MapPass = "all",
  omitSway: boolean = false,
): OffscreenCanvas {
  const ts = BASE_TILE_SIZE;
  const layers = map.layers;

  const { minX, minY, maxX, maxY } = paintedExtent(map, dressing);

  const cols = maxX - minX + 1 + paddingCells * 2;
  const rows = maxY - minY + 1 + paddingCells * 2;
  const canvas = new OffscreenCanvas(cols * ts, rows * ts);
  const ctx = canvas.getContext("2d")!;
  if (!transparent) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cols * ts, rows * ts);
  }

  // Pack content is drawn by the module the live editor shares (drawMap.ts),
  // so the two cannot drift again. The resolver has NO fallback runtime on
  // purpose: a bake must not draw a map in a pack it was not painted with, so
  // a cell whose pack is not loaded is skipped rather than redrawn in another.
  drawMapContent({
    ctx,
    tilePx: ts,
    origin: { x: (minX - paddingCells) * ts, y: (minY - paddingCells) * ts },
    bounds: { minX, minY, maxX, maxY },
    layers,
    runtime: (packId) => runtimes.get(packId) ?? null,
    defaultPackId: null,
    glyphs,
    // There is no "currently active pack" once baking runs headless, so
    // glyphs draw against the map's own persisted default pack.
    glyphPackId: map.default_pack_id,
    dressing,
    lights: true,
    shadows: true,
    makeCanvas: offscreenMakeCanvas(),
    pass,
    omitSway,
  });

  const dx = (cx: number) => (cx - minX + paddingCells) * ts;
  const dy = (cy: number) => (cy - minY + paddingCells) * ts;

  // Annotation layer: labels stand on the map, so the ground image has none.
  if (pass === "ground") return canvas;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fontSize = Math.round(ts * 0.16);
  ctx.font = `bold ${fontSize}px sans-serif`;
  for (const [k, ann] of Object.entries(layers.annotation)) {
    if (!ann.text) continue;
    const [xs, ys] = k.split(",");
    const x = Number(xs), y = Number(ys);
    const px = dx(x), py = dy(y);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(ann.text, px + ts / 2 + 1, py + ts / 2 + 1, ts - 8);
    ctx.fillStyle = "rgba(255,240,180,0.95)";
    ctx.fillText(ann.text, px + ts / 2, py + ts / 2, ts - 8);
  }

  return canvas;
}

const MAX_BYTES = 5 * 1024 * 1024;

/** Bake a map to a WebP Blob suitable for Atlas upload. `glyphs` is the
 *  resolved trap/feature hazard glyph map (#804) — see cartographer/glyphs.ts;
 *  defaults to none for callers that don't care about hazard/feature art. */
export async function bakeMap(
  map: DungeonMap,
  runtimes: Map<string, TilePackRuntime>,
  dressing: DressingCatalog,
  options: BakeOptions = {},
  glyphs: Record<CellKey, PackCategory> = {},
): Promise<Blob> {
  const canvas = renderToCanvas(map, runtimes, dressing, options.paddingCells ?? 3, glyphs, options.transparent ?? false, options.pass ?? "all", options.omitSway ?? false);
  let blob = await encodeWebp(canvas, 0.9);
  if (blob.size > MAX_BYTES) {
    blob = await encodeWebp(canvas, 0.75);
    if (blob.size > MAX_BYTES) {
      throw new Error("Map too large to publish. Crop more aggressively or split into sections.");
    }
  }
  return blob;
}

/** Bake a map to a PNG Blob for client-side download. */
export async function bakeMapAsPng(
  map: DungeonMap,
  runtimes: Map<string, TilePackRuntime>,
  dressing: DressingCatalog,
  options: BakeOptions = {},
  glyphs: Record<CellKey, PackCategory> = {},
): Promise<Blob> {
  const canvas = renderToCanvas(map, runtimes, dressing, options.paddingCells ?? 3, glyphs);
  return canvas.convertToBlob({ type: "image/png" });
}

// ── AI style input sizing (epic #884) ───────────────────────────────────────
//
// OpenAI and Gemini accept genuinely different output shapes — OpenAI any
// size within a window, Gemini one of ten fixed aspect ratios — so the input
// is fitted to whichever one the campaign will actually use, resolved
// client-side (`useMapExport.ts`'s `imageProviderKey`) rather than assumed.
// Fitting to the wrong shape here is exactly what the provider (or
// `style-map`'s own re-bucketing) would otherwise do server-side, and that's
// a resize that changes aspect, which breaks the calibration argument below.

/** Which shape the AI style input is fitted to — resolved client-side from
 *  the campaign's `image_provider`. `"openai"` is flexible-size (any 1:3..3:1
 *  window, `padToStyleAspect`); `"gemini"` pads to the nearest of its own
 *  ten fixed aspect ratios instead. */
export type StyleImageProvider = "openai" | "gemini";

/** OpenAI's supported aspect-ratio window for this endpoint. Content more
 *  extreme than this gets padded, never cropped, to reach the boundary. */
const STYLE_MIN_ASPECT = 1 / 3;
const STYLE_MAX_ASPECT = 3;

/**
 * The pixel budget this pipeline spends on every render: 2560×1440,
 * OpenAI's own largest non-experimental size. Sites are increasingly played
 * fullscreen on a TV built into the table, so resolution is worth spending
 * in full here — cost is governed separately, by the flat credit charge,
 * not by trimming pixels.
 */
const STYLE_PIXEL_BUDGET = 2560 * 1440; // 3,686,400 px
const STYLE_MAX_EDGE = 3840;
const STYLE_SIZE_STEP = 16;

function roundDownToStep(n: number, step: number): number {
  return Math.max(step, Math.floor(n / step) * step);
}

/**
 * Pure geometry for centering a `contentWidth × contentHeight` render onto a
 * canvas whose aspect ratio is exactly `targetAspect` — no rescale, only an
 * added border on whichever axis is short, so a cell that was
 * `contentWidth / contentCellsPerWidth` px wide stays exactly that many
 * pixels wide on the padded canvas. `cellsPerImageWidth` grows by the same
 * ratio the canvas itself grew by (`effWidth / contentWidth`) because more
 * of that unchanged pixel grid now fits across the wider canvas;
 * `originXPct`/`originYPct` place a `GridCalibration`'s origin exactly
 * where the un-padded content used to start, so the map-cell that used to
 * sit at image cell (0,0) still does. A no-op (zero offset) when the
 * content already has `targetAspect`.
 */
export interface AspectPadGeometry {
  effWidth: number;
  effHeight: number;
  offsetX: number;
  offsetY: number;
  cellsPerImageWidth: number;
  originXPct: number;
  originYPct: number;
}

export function padToAspect(
  contentWidth: number,
  contentHeight: number,
  contentCellsPerWidth: number,
  targetAspect: number,
): AspectPadGeometry {
  const aspect = contentWidth > 0 && contentHeight > 0 ? contentWidth / contentHeight : targetAspect;
  const effWidth = aspect < targetAspect ? contentHeight * targetAspect : contentWidth;
  const effHeight = aspect > targetAspect ? contentWidth / targetAspect : contentHeight;
  const offsetX = Math.round((effWidth - contentWidth) / 2);
  const offsetY = Math.round((effHeight - contentHeight) / 2);
  return {
    effWidth,
    effHeight,
    offsetX,
    offsetY,
    cellsPerImageWidth: contentWidth > 0 ? contentCellsPerWidth * (effWidth / contentWidth) : contentCellsPerWidth,
    originXPct: effWidth > 0 ? offsetX / effWidth : 0,
    originYPct: effHeight > 0 ? offsetY / effHeight : 0,
  };
}

/** `padToAspect` clamped into OpenAI's accepted window — the shape every AI
 *  style input pads to before the pixel budget below decides its resolution. */
export function padToStyleAspect(
  contentWidth: number,
  contentHeight: number,
  contentCellsPerWidth: number,
): AspectPadGeometry {
  const aspect = contentWidth > 0 && contentHeight > 0 ? contentWidth / contentHeight : 1;
  const clamped = Math.min(STYLE_MAX_ASPECT, Math.max(STYLE_MIN_ASPECT, aspect));
  return padToAspect(contentWidth, contentHeight, contentCellsPerWidth, clamped);
}

/**
 * The final send/request size for a canvas of `effWidth × effHeight` — the
 * full `STYLE_PIXEL_BUDGET` spent at that aspect ratio, each edge rounded
 * *down* to a multiple of 16 so the total never exceeds the budget (OpenAI
 * requires the multiple; rounding down is what keeps 2560×1440 itself exact
 * rather than nudging over it), capped at `STYLE_MAX_EDGE` regardless of
 * aspect. Independent of how large or small the original content actually
 * is — this only reads its aspect ratio, via `effWidth`/`effHeight`.
 */
export function chooseStyleImageSize(effWidth: number, effHeight: number): { width: number; height: number } {
  const aspect = effWidth > 0 && effHeight > 0 ? effWidth / effHeight : 1;
  const rawHeight = Math.sqrt(STYLE_PIXEL_BUDGET / aspect);
  const rawWidth = rawHeight * aspect;
  return {
    width: Math.min(STYLE_MAX_EDGE, roundDownToStep(rawWidth, STYLE_SIZE_STEP)),
    height: Math.min(STYLE_MAX_EDGE, roundDownToStep(rawHeight, STYLE_SIZE_STEP)),
  };
}

/**
 * Pads `source` to `provider`'s accepted shape and resizes the result to
 * the size that shape earns — the AI styler's own input, on every entry
 * point. Flexible OpenAI pads into `padToStyleAspect`'s 1:3..3:1 window and
 * spends `chooseStyleImageSize`'s pixel budget at whatever aspect that
 * leaves; Gemini pads to the *exact* nearest of its own ten fixed ratios
 * (`nearestGeminiAspect`) and is still sized by the same budget. Padding and
 * resizing are independent, pure steps — the pad only ever adds a border
 * (never rescales), and the resize is a plain fit onto the chosen canvas —
 * so `geometry`'s `cellsPerImageWidth`/`originXPct`/`originYPct`, computed
 * entirely from the pad step, carry over to the final canvas. One caveat:
 * `chooseStyleImageSize` rounds each edge down to a multiple of 16 on its
 * own, so the final aspect can differ from the padded one by up to about 1%.
 * `GridCalibration` has a single cell size, so that sliver shows up as rows
 * drifting slightly toward the bottom edge; the Layers panel's Calibrate is
 * the fix, as it is for the model's own drift. See `useMapExport.ts`'s
 * header for the rest of the calibration argument.
 */
export function fitStyleInputCanvas(
  source: OffscreenCanvas,
  contentCellsPerWidth: number,
  provider: StyleImageProvider = "openai",
): { canvas: OffscreenCanvas; geometry: AspectPadGeometry; size: { width: number; height: number } } {
  const geometry = provider === "gemini"
    ? padToAspect(
        source.width,
        source.height,
        contentCellsPerWidth,
        nearestGeminiAspect(source.width, source.height).ratio,
      )
    : padToStyleAspect(source.width, source.height, contentCellsPerWidth);
  const size = chooseStyleImageSize(geometry.effWidth, geometry.effHeight);

  const padded = new OffscreenCanvas(geometry.effWidth, geometry.effHeight);
  const pctx = padded.getContext("2d")!;
  pctx.fillStyle = "#000";
  pctx.fillRect(0, 0, geometry.effWidth, geometry.effHeight);
  pctx.drawImage(source, geometry.offsetX, geometry.offsetY);

  const canvas = new OffscreenCanvas(size.width, size.height);
  canvas.getContext("2d")!.drawImage(padded, 0, 0, size.width, size.height);

  return { canvas, geometry, size };
}

/**
 * Bake a map to a PNG Blob sized for AI image input — fitted to the
 * resolved provider's accepted aspect window and pixel budget
 * (`fitStyleInputCanvas`), so the geometry it returns describes whatever
 * comes back with no further measurement needed.
 */
export async function bakeMapForAI(
  map: DungeonMap,
  runtimes: Map<string, TilePackRuntime>,
  dressing: DressingCatalog,
  options: BakeOptions = {},
  glyphs: Record<CellKey, PackCategory> = {},
  provider: StyleImageProvider = "openai",
): Promise<{ blob: Blob; geometry: AspectPadGeometry; size: { width: number; height: number } }> {
  const paddingCells = options.paddingCells ?? 3;
  const canvas = renderToCanvas(map, runtimes, dressing, paddingCells, glyphs);
  const dims = computeBakedDimensions(map, dressing, paddingCells);
  const { canvas: fitted, geometry, size } = fitStyleInputCanvas(canvas, dims.cols, provider);
  const blob = await fitted.convertToBlob({ type: "image/png" });
  return { blob, geometry, size };
}
