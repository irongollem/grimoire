/**
 * Paper-doll layout (#975): measures the figure on the underclothes cell and
 * how far each outfit cell's figure drifted from it. Pure arithmetic over
 * decoded RGBA, so the edge function, the doll script and the tests all run
 * the same code.
 */
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  DOLL_OUTFITS,
  OUTFIT_CELL,
  SHEET_WIDTH,
  type CellShift,
  type DollAnatomy,
  type DollCellIndex,
  type DollLayout,
  type DollOutfit,
  type DollSheetKey,
} from "./types.ts";

type Pixels = Uint8Array | Uint8ClampedArray;

const OPAQUE = 128;
/** Rows at the top of the figure whose centre is its axis. */
const CROWN_ROWS = 40;

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Opaque extent of every row of one cell; `null` rows have no opaque pixel. */
function rowSpans(rgba: Pixels, sheetWidth: number, cell: DollCellIndex): Array<{ min: number; max: number } | null> {
  const spans: Array<{ min: number; max: number } | null> = [];
  const xOffset = cell * CELL_WIDTH;
  for (let y = 0; y < CELL_HEIGHT; y++) {
    let min = -1;
    let max = -1;
    const rowStart = (y * sheetWidth + xOffset) * 4;
    for (let x = 0; x < CELL_WIDTH; x++) {
      if (rgba[rowStart + x * 4 + 3] > OPAQUE) {
        if (min < 0) min = x;
        max = x;
      }
    }
    spans.push(min < 0 ? null : { min, max });
  }
  return spans;
}

/** Center of the combined horizontal extent across inclusive rows; the cell midpoint if all are empty. */
function bandCenter(spans: Array<{ min: number; max: number } | null>, from: number, to: number): number {
  let min = CELL_WIDTH;
  let max = -1;
  for (let y = Math.max(0, from); y <= Math.min(spans.length - 1, to); y++) {
    const s = spans[y];
    if (!s) continue;
    min = Math.min(min, s.min);
    max = Math.max(max, s.max);
  }
  return max < 0 ? CELL_WIDTH / 2 : (min + max) / 2;
}

/**
 * Estimate head, shoulders, soles, and crown axis from alpha values above 128
 * in one 512x1024 cell of decoded RGBA. `sheetWidth` is the row stride in pixels;
 * returned coordinates are relative to the cell, which defaults to underclothes.
 * @throws {Error} If the selected cell has no pixels with alpha above 128.
 */
export function measureAnatomy(rgba: Pixels, sheetWidth: number = SHEET_WIDTH, cell: DollCellIndex = 0): DollAnatomy {
  const spans = rowSpans(rgba, sheetWidth, cell);
  let y0 = -1;
  let y1 = -1;
  spans.forEach((s, y) => {
    if (!s) return;
    if (y0 < 0) y0 = y;
    y1 = y;
  });
  if (y0 < 0) throw new Error("measureAnatomy: the cell has no opaque pixels");

  const h = y1 - y0;
  const width = (y: number) => {
    const s = spans[y];
    return s ? s.max - s.min : 0;
  };

  // The neck is the narrowest row between the head and the shoulders.
  const neckFrom = Math.floor(y0 + 0.08 * h);
  const neckTo = Math.min(y1, Math.ceil(y0 + 0.24 * h));
  let neck = neckFrom;
  for (let y = neckFrom; y <= neckTo; y++) if (width(y) < width(neck)) neck = y;

  let headX0 = CELL_WIDTH;
  let headX1 = -1;
  for (let y = y0; y <= Math.max(neck - 1, y0); y++) {
    const s = spans[y];
    if (!s) continue;
    headX0 = Math.min(headX0, s.min);
    headX1 = Math.max(headX1, s.max);
  }

  const shoulderTo = Math.min(y1, neck + Math.floor(0.12 * h));
  let shoulderY = neck;
  for (let y = neck; y <= shoulderTo; y++) if (width(y) > width(shoulderY)) shoulderY = y;
  const shoulderSpan = spans[shoulderY];

  return {
    head: { x0: headX0, x1: headX1, y0, y1: neck },
    shoulders: {
      x0: shoulderSpan ? shoulderSpan.min : headX0,
      x1: shoulderSpan ? shoulderSpan.max : headX1,
      y: shoulderY,
    },
    feetY: y1,
    // The crown, not the bounding box: arms, sleeves and robes widen the box
    // unevenly, while the top of the head sits on the figure's axis.
    centerX: Math.round(bandCenter(spans, y0, y0 + CROWN_ROWS)),
  };
}

/** How far from the nominal cell edge a gap between figures is looked for. */
const CUT_SEARCH = 80;

/**
 * The two cuts of one sheet, each in the middle of the widest run of empty
 * columns near its nominal edge (512, 1024). The transparent background is
 * what makes this possible: a gap between two figures is a run of columns
 * with no alpha value above 32. Search within 80 pixels of each edge over
 * 1024 rows; `sheetWidth` is the RGBA row stride in pixels. `clean` is false
 * when either search window has no gap, and that cut uses its nominal edge.
 * Cuts are sheet x coordinates in pixels; empty sheets are considered clean.
 */
export function sheetCuts(rgba: Pixels, sheetWidth: number = SHEET_WIDTH): { cuts: [number, number]; clean: boolean } {
  const empty = (x: number) => {
    for (let y = 0; y < CELL_HEIGHT; y++) if (rgba[(y * sheetWidth + x) * 4 + 3] > 32) return false;
    return true;
  };
  let clean = true;
  const cutAt = (edge: number): number => {
    let best: { from: number; len: number } | null = null;
    let runFrom = -1;
    for (let x = edge - CUT_SEARCH; x <= edge + CUT_SEARCH + 1; x++) {
      const isEmpty = x <= edge + CUT_SEARCH && empty(x);
      if (isEmpty && runFrom < 0) runFrom = x;
      if (!isEmpty && runFrom >= 0) {
        const len = x - runFrom;
        // Prefer the widest gap; between equal gaps, the one nearer the nominal edge.
        const nearer = best && Math.abs(runFrom + len / 2 - edge) < Math.abs(best.from + best.len / 2 - edge);
        if (!best || len > best.len || (len === best.len && nearer)) best = { from: runFrom, len };
        runFrom = -1;
      }
    }
    if (!best) {
      clean = false;
      return edge;
    }
    return Math.round(best.from + best.len / 2);
  };
  return { cuts: [cutAt(CELL_WIDTH), cutAt(2 * CELL_WIDTH)], clean };
}

/**
 * Measure anatomy, outfit shifts, and sheet cuts from decoded RGBA sheets with
 * a shared row stride of `sheetWidth` pixels. Shifts use cell pixels; cuts use
 * sheet x coordinates. Boundaries with no gap retain their nominal cut.
 * @throws {Error} If any garb or armor cell has no pixels with alpha above 128.
 */
export function buildDollLayout(
  garbRgba: Pixels,
  armourRgba: Pixels,
  burdenRgba: Pixels,
  sheetWidth: number = SHEET_WIDTH,
): DollLayout {
  const anatomy = measureAnatomy(garbRgba, sheetWidth, 0);
  const figureShift = {} as Record<DollOutfit, CellShift>;
  for (const outfit of DOLL_OUTFITS) {
    const { sheet, cell } = OUTFIT_CELL[outfit];
    const own = measureAnatomy(sheet === "garb" ? garbRgba : armourRgba, sheetWidth, cell);
    figureShift[outfit] = { dx: round2(anatomy.centerX - own.centerX), dy: round2(anatomy.feetY - own.feetY) };
  }
  const cuts: Record<DollSheetKey, [number, number]> = {
    garb: sheetCuts(garbRgba, sheetWidth).cuts,
    armour: sheetCuts(armourRgba, sheetWidth).cuts,
    burden: sheetCuts(burdenRgba, sheetWidth).cuts,
  };
  return { anatomy, figureShift, cuts };
}
