// Walls found in the picture (#1197, canvas Picture Maps frame 07).
//
// A map that is a picture usually shows a lit building or cave on a dark, even ground: the page round the drawing.
// That ground is the one thing in the picture that can be told apart without understanding it, so this finds the
// OUTLINE of what is drawn: it floods the ground in from the picture's edge, and what the flood cannot reach is the
// map. Its boundary is proposed as rings of wall for the DM to keep or drop. Walls inside the map (between two rooms)
// look like floor, furniture and shadow to a rule this simple, so they are not found; the DM traces those.
//
// No model is called. The result is ordinary rings in cell units, fitted to few nodes like a brushed wall, never a mask.

import { AREA_RES } from "./area";
import { fitLoop } from "./brushWalls";
import { traceField, type Grid } from "./groundRaster";
import { ringArea } from "@/lib/locations/polygon";

type P = [number, number];

/** RGBA pixels, row by row, as a canvas gives them. */
export interface TracePixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** Where the picture lies on the map's grid: the cell coordinate of its top-left corner and how many cells it spans. */
export interface TracePlacement {
  left: number;
  top: number;
  across: number;
}

export interface TraceOptions {
  /** 0 to 1: how far a colour may be from the ground's and still count as ground. Higher eats further into the map. */
  tolerance: number;
  /** Cells to pull the outline in from the ground's edge, so the wall sits in the drawn wall and not on its outer face. */
  inset: number;
  /** Pull outline points that lie near a grid line onto it, for a building drawn on the grid. A cave wants this off. */
  snapToGrid: boolean;
}

/** Tried on seven painted building maps (grey gridded page and black page): 0.15 to 0.35 found every outline; above
 *  0.5 the flood starts to enter dark stone floors. */
export const DEFAULT_TRACE_OPTIONS: TraceOptions = { tolerance: 0.2, inset: 0.15, snapToGrid: true };

/** A ring smaller than this many squares is a speck (a watermark, a stray prop), not a map. */
const MIN_RING_AREA = 2;
/** How near a grid line (cells) an outline point must lie to be pulled onto it. */
const SNAP_REACH = 0.3;
/** Colour distance (0 to 441, RGB) the tolerance spans, from strict to loose. */
const DISTANCE_MIN = 18;
const DISTANCE_SPAN = 110;

/** How much more a difference of hue counts than one of brightness. A grey page and dark timber are close in
 *  brightness and far apart in hue; a page's own grid lines and paper grain differ in brightness only. */
const HUE_WEIGHT = 9;

/** Squared distance between a colour and the ground's, brightness and hue weighed apart. */
function colourDistance(r: number, g: number, b: number, ground: readonly [number, number, number]): number {
  const light = (r + g + b - ground[0] - ground[1] - ground[2]) / 3;
  const warm = r - g - (ground[0] - ground[1]);
  const cool = g - b - (ground[1] - ground[2]);
  return light * light + HUE_WEIGHT * (warm * warm + cool * cool);
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

/**
 * The sample grid over the picture and, per sample, whether it is map (1) or ground (0). A sample outside the picture
 * is ground, so the flood always has a border to start from.
 */
export function mapMask(pixels: TracePixels, placement: TracePlacement, tolerance: number): { grid: Grid; field: Uint8Array } {
  const down = (placement.across * pixels.height) / pixels.width;
  const ox = Math.floor(placement.left) - 1;
  const oy = Math.floor(placement.top) - 1;
  const grid: Grid = {
    ox,
    oy,
    w: (Math.ceil(placement.left + placement.across) + 1 - ox) * AREA_RES,
    h: (Math.ceil(placement.top + down) + 1 - oy) * AREA_RES,
  };
  const { w, h } = grid;
  const pxPerCell = pixels.width / placement.across;

  // Each sample's pixel, or -1 outside the picture.
  const at = new Int32Array(w * h);
  for (let j = 0; j < h; j++) {
    const py = Math.floor((oy + (j + 0.5) / AREA_RES - placement.top) * pxPerCell);
    for (let i = 0; i < w; i++) {
      const px = Math.floor((ox + (i + 0.5) / AREA_RES - placement.left) * pxPerCell);
      at[j * w + i] = px < 0 || py < 0 || px >= pixels.width || py >= pixels.height ? -1 : (py * pixels.width + px) * 4;
    }
  }

  // The ground's colour: the median along the picture's own edge, which a drawing rarely reaches on all four sides.
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const edge = (x: number, y: number): void => {
    const k = (y * pixels.width + x) * 4;
    rs.push(pixels.data[k]);
    gs.push(pixels.data[k + 1]);
    bs.push(pixels.data[k + 2]);
  };
  const stepX = Math.max(1, Math.floor(pixels.width / 200));
  const stepY = Math.max(1, Math.floor(pixels.height / 200));
  for (let x = 0; x < pixels.width; x += stepX) {
    edge(x, 0);
    edge(x, pixels.height - 1);
  }
  for (let y = 0; y < pixels.height; y += stepY) {
    edge(0, y);
    edge(pixels.width - 1, y);
  }
  const ground: [number, number, number] = [median(rs), median(gs), median(bs)];
  const limit = (DISTANCE_MIN + tolerance * DISTANCE_SPAN) ** 2;

  const groundLike = new Uint8Array(w * h);
  for (let n = 0; n < w * h; n++) {
    const k = at[n];
    if (k < 0) {
      groundLike[n] = 1;
      continue;
    }
    groundLike[n] = colourDistance(pixels.data[k], pixels.data[k + 1], pixels.data[k + 2], ground) <= limit ? 1 : 0;
  }

  // Flood the ground in from the raster's border. What it cannot reach is map, dark corners inside the map included.
  const reached = new Uint8Array(w * h);
  const stack: number[] = [];
  const visit = (n: number): void => {
    if (groundLike[n] && !reached[n]) {
      reached[n] = 1;
      stack.push(n);
    }
  };
  for (let i = 0; i < w; i++) {
    visit(i);
    visit((h - 1) * w + i);
  }
  for (let j = 0; j < h; j++) {
    visit(j * w);
    visit(j * w + w - 1);
  }
  while (stack.length > 0) {
    const n = stack.pop()!;
    const i = n % w;
    if (i > 0) visit(n - 1);
    if (i < w - 1) visit(n + 1);
    if (n >= w) visit(n - w);
    if (n < w * (h - 1)) visit(n + w);
  }

  const field = new Uint8Array(w * h);
  for (let n = 0; n < w * h; n++) field[n] = reached[n] ? 0 : 1;
  return { grid, field };
}

/** One pass of shrinking (`keep` 1) or growing (`keep` 0) the map by a sample, 4-connected. */
function step(field: Uint8Array, w: number, h: number, grow: boolean): Uint8Array {
  const out = new Uint8Array(field);
  const from = grow ? 0 : 1;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const n = j * w + i;
      if (field[n] !== from) continue;
      const flips =
        (i > 0 && field[n - 1] !== from) || (i < w - 1 && field[n + 1] !== from) || (j > 0 && field[n - w] !== from) || (j < h - 1 && field[n + w] !== from);
      if (flips) out[n] = grow ? 1 : 0;
    }
  }
  return out;
}

/**
 * The rings of wall the picture proposes, in cell units, largest first. Each is the outline of a piece of the map,
 * pulled in by `inset`, optionally snapped to the grid, and fitted to the few nodes a hand would place.
 */
export function proposeWallRings(pixels: TracePixels, placement: TracePlacement, options: TraceOptions = DEFAULT_TRACE_OPTIONS): P[][] {
  if (pixels.width === 0 || pixels.height === 0 || !(placement.across > 0)) return [];
  const { grid, field: raw } = mapMask(pixels, placement, options.tolerance);
  const { w, h } = grid;

  // Open by one sample (shrink, then grow): a grid line or a hair of text bridging the ground does not survive it.
  let field = step(step(raw, w, h, false), w, h, true);
  for (let k = Math.round(options.inset * AREA_RES); k > 0; k--) field = step(field, w, h, false);

  const rings: P[][] = [];
  for (const loop of traceField(grid, field)) {
    const snapped = options.snapToGrid
      ? loop.map(([x, y]): P => [Math.abs(x - Math.round(x)) <= SNAP_REACH ? Math.round(x) : x, Math.abs(y - Math.round(y)) <= SNAP_REACH ? Math.round(y) : y])
      : loop;
    const ring = fitLoop(snapped);
    if (ring.length >= 3 && ringArea(ring) >= MIN_RING_AREA) rings.push(ring);
  }
  return rings.sort((a, b) => ringArea(b) - ringArea(a));
}
