// ── The site map stack (epic #884) ──────────────────────────────────────────
//
// A site's map is a stack of independently-empty layers, bottom up: Picture
// (`locations.map_url` + `grid_calibration`, a scan the DM supplied or the
// AI styler produced) → Drawing (`locations.map_layer_url` +
// `map_layer_calibration`, a transparent bake of the Cartographer drawing in
// `source_map_id`) → a blank grid (`locations.plan_size`) when the site has
// neither image. See `supabase/migrations/20260914194936_site_map_stack.sql`
// for the column comments this module's docs mirror.
//
// This is the one place that stack is read. Every surface that used to ask
// "does this place have a map" or "which image + calibration do I draw"
// against `map_url`/`grid_calibration` directly goes through `buildMapStack`
// (or one of the narrow wrappers below) instead, so a site with only a
// Drawing is never silently treated as mapless.
//
// Five layers, not three (epic #884, wave 4, S12). Picture, Drawing and Plan
// above are AUTHORED — a DM sets them in Build. Two more are PLAYED, never
// authored: Tokens (the party, monsters and NPCs — "the only one players can
// interact with," and a player moves their own token and nothing else) and
// Fog (what has been revealed — by room for a site, by cell for an
// encounter; two resolutions of one layer, see `lib/battlemap/fogMask.ts`).
// `MAP_STACK_LAYERS` below documents all five in stack order so a surface
// that lists "what this map is made of" has one place to read the list from
// — it is deliberately just a description: the fog mask and the token set
// themselves are inputs a surface supplies (from `location_state_events` or
// a live encounter), never something this module fetches.

import type { GridCalibration, Location } from "@/types/location.types";

/** Pixel size of one cell in a blank grid's plan — there is no image to
 *  derive a size from, so this is simply the constant every blank-grid
 *  renderer uses. */
export const BLANK_CELL_PX = 64;

export type MapStackSource = Pick<
  Location,
  "map_url" | "grid_calibration" | "map_layer_url" | "map_layer_calibration" | "plan_size"
>;

export type MapLayerKind = "picture" | "drawing";

/** All five layers of the stack, in bottom-up render order. */
export type MapStackLayerName = "picture" | "drawing" | "plan" | "tokens" | "fog";

export interface MapStackLayerInfo {
  key: MapStackLayerName;
  label: string;
  /** Authored layers are set by the DM in Build (Picture, Drawing, Plan).
   *  Played layers are never authored — they are computed from live state
   *  (Tokens from combatants/party position, Fog from revealed cells) and a
   *  surface only ever offers them where that state actually exists (a run
   *  surface, an encounter, Build's player preview) — never on a plain
   *  Browse of a site with no play state at all. */
  authored: boolean;
}

/** The stack's own description of itself — see the module docstring above
 *  for why Tokens and Fog belong here even though `buildMapStack` never
 *  computes them. */
export const MAP_STACK_LAYERS: readonly MapStackLayerInfo[] = [
  { key: "picture", label: "Picture", authored: true },
  { key: "drawing", label: "Drawing", authored: true },
  { key: "plan", label: "Plan", authored: true },
  { key: "tokens", label: "Tokens", authored: false },
  { key: "fog", label: "Fog", authored: false },
];

export interface MapImageLayer {
  kind: MapLayerKind;
  url: string;
  calibration: GridCalibration | null;
}

export interface BlankGrid {
  cols: number;
  rows: number;
  cellPx: number;
}

export interface MapStack {
  /** `map_url` (+ `grid_calibration`). */
  picture: MapImageLayer | null;
  /** `map_layer_url` (+ `map_layer_calibration`). */
  drawing: MapImageLayer | null;
  /** The image whose natural pixel box IS the frame: drawing if present,
   *  else picture, else null. */
  primary: MapImageLayer | null;
  /** The plan's calibration in frame space: `primary.calibration`, else a
   *  synthetic one for a blank grid ({cells_per_image_width: cols, origin
   *  0/0, origin_cell 0/0}), else null. */
  frameCalibration: GridCalibration | null;
  /** Set only when there is no image layer and `plan_size` is set. */
  blank: BlankGrid | null;
  /** picture || drawing || blank. Does NOT consider `is_battle_map` —
   *  callers AND that themselves, as they did before this module existed. */
  hasAnyLayer: boolean;
}

const EMPTY_STACK: MapStack = {
  picture: null,
  drawing: null,
  primary: null,
  frameCalibration: null,
  blank: null,
  hasAnyLayer: false,
};

/** A blank grid has no image to calibrate against, so its frame calibration
 *  is invented: cell (0,0) sits at the frame's own origin, and one cell
 *  spans exactly `1 / cols` of the frame's width — the same shape
 *  `gridExtent` would derive from an image that width. */
function syntheticCalibration(cols: number): GridCalibration {
  return {
    cells_per_image_width: cols,
    origin_x_pct: 0,
    origin_y_pct: 0,
    origin_cell_x: 0,
    origin_cell_y: 0,
  };
}

export function buildMapStack(loc: MapStackSource | null | undefined): MapStack {
  if (!loc) return EMPTY_STACK;

  const picture: MapImageLayer | null = loc.map_url
    ? { kind: "picture", url: loc.map_url, calibration: loc.grid_calibration }
    : null;
  const drawing: MapImageLayer | null = loc.map_layer_url
    ? { kind: "drawing", url: loc.map_layer_url, calibration: loc.map_layer_calibration }
    : null;

  const primary = drawing ?? picture;

  const blank: BlankGrid | null =
    !primary && loc.plan_size
      ? { cols: loc.plan_size.cols, rows: loc.plan_size.rows, cellPx: BLANK_CELL_PX }
      : null;

  const frameCal: GridCalibration | null = primary
    ? primary.calibration
    : blank
      ? syntheticCalibration(blank.cols)
      : null;

  return {
    picture,
    drawing,
    primary,
    frameCalibration: frameCal,
    blank,
    hasAnyLayer: !!picture || !!drawing || !!blank,
  };
}

export function hasAnyMapLayer(loc: MapStackSource | null | undefined): boolean {
  return buildMapStack(loc).hasAnyLayer;
}

export function frameCalibration(loc: MapStackSource | null | undefined): GridCalibration | null {
  return buildMapStack(loc).frameCalibration;
}

/** The single image a legacy one-image surface (the battle map, for now)
 *  should draw, with the frame calibration. Null when no image layer. */
export function primaryImage(
  loc: MapStackSource | null | undefined,
): { url: string; calibration: GridCalibration | null } | null {
  const primary = buildMapStack(loc).primary;
  return primary ? { url: primary.url, calibration: primary.calibration } : null;
}

/** Fractions of the PRIMARY image box (0..1; may fall outside it). */
export interface PlacedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where the Picture sits beneath a Drawing, in fractions of the drawing's
 * box. Both calibrations map their own image to the same map-cell space, so
 * the picture's box is the drawing's cell grid measured in picture pixels,
 * then rescaled into drawing-box fractions. Null unless both layers exist
 * AND both are calibrated — there is nothing to reconcile otherwise.
 */
export function placePicture(
  stack: MapStack,
  primaryNatural: { w: number; h: number },
  pictureNatural: { w: number; h: number },
): PlacedRect | null {
  const drawing = stack.drawing;
  const picture = stack.picture;
  if (!drawing || !picture || !drawing.calibration || !picture.calibration) return null;
  const P = drawing.calibration;
  const S = picture.calibration;
  if (P.cells_per_image_width <= 0 || S.cells_per_image_width <= 0) return null;
  if (primaryNatural.w <= 0 || primaryNatural.h <= 0 || pictureNatural.w <= 0 || pictureNatural.h <= 0) {
    return null;
  }

  // Frame cell size, as fractions of the primary (drawing) box.
  const pCell = 1 / P.cells_per_image_width;
  const pCellH = (primaryNatural.w / P.cells_per_image_width) / primaryNatural.h;

  // Picture pixels per cell, and the scale from picture pixels into those
  // same frame fractions.
  const sCellPx = pictureNatural.w / S.cells_per_image_width;
  const sx = pCell / sCellPx;
  const sy = pCellH / sCellPx;

  const width = pictureNatural.w * sx;
  const height = pictureNatural.h * sy;

  const pOriginCellX = P.origin_cell_x ?? 0;
  const pOriginCellY = P.origin_cell_y ?? 0;
  const sOriginCellX = S.origin_cell_x ?? 0;
  const sOriginCellY = S.origin_cell_y ?? 0;

  const left = P.origin_x_pct + (sOriginCellX - pOriginCellX) * pCell - S.origin_x_pct * pictureNatural.w * sx;
  const top = P.origin_y_pct + (sOriginCellY - pOriginCellY) * pCellH - S.origin_y_pct * pictureNatural.h * sy;

  return { left, top, width, height };
}
