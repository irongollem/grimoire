// The notice board's one coordinate space and the maths around it (#1064). Everything on a board is sized in board
// units, never pixels, so the DM's layout reads the same on every screen; this module owns the units, the seeded
// look of a pin, and the scaling rule that decides how a board meets a viewport.
import type { NoticePinSize, NoticePinStyle } from "@/types/noticeBoard.types";

/** The board is a fixed 3:2 stage. A pin's x/y are fractions of it, so "top left, red tack" means one place everywhere. */
export const BOARD_W = 1600;
export const BOARD_H = (BOARD_W * 2) / 3;

/**
 * Below this a pin's type stops being readable, so a small viewport pans a board held at this scale instead of fitting
 * a strip. 1 unit = 0.5px puts a medium note at 150px, its body type at about 13px.
 */
export const READABLE_FLOOR = 0.5;
/** Pinch and the + button stop here; past it the board is a magnifier, not a board. */
export const MAX_SCALE = 2.5;

export interface BoardScale {
  /** The scale at which the whole board just fits. */
  fit: number;
  /** The scale the board is shown at: the fit when that stays readable, else the floor. */
  scale: number;
  overflowX: boolean;
  overflowY: boolean;
}

/** A board wider or taller than its viewport by a sub-pixel is not overflowing; it is rounding. */
const EPSILON = 0.5;

export function boardScale(viewportW: number, viewportH: number): BoardScale {
  const fit = Math.min(viewportW / BOARD_W, viewportH / BOARD_H);
  const scale = Math.max(fit, READABLE_FLOOR);
  return overflowAt(viewportW, viewportH, scale, fit);
}

function overflowAt(viewportW: number, viewportH: number, scale: number, fit: number): BoardScale {
  return {
    fit,
    scale,
    overflowX: BOARD_W * scale > viewportW + EPSILON,
    overflowY: BOARD_H * scale > viewportH + EPSILON,
  };
}

/** The scale a pinch or button asked for, held between "the whole board fits" and MAX_SCALE. */
export function clampScale(scale: number, fit: number): number {
  return Math.min(Math.max(scale, Math.min(fit, MAX_SCALE)), MAX_SCALE);
}

export interface PanOffset {
  x: number;
  y: number;
}

/** The board's top-left inside its viewport, in px: centred on an axis it fits, held against the edges on one it does not. */
export function constrainPan(viewportW: number, viewportH: number, scale: number, pan: PanOffset): PanOffset {
  return { x: constrainAxis(viewportW, BOARD_W * scale, pan.x), y: constrainAxis(viewportH, BOARD_H * scale, pan.y) };
}

function constrainAxis(viewport: number, board: number, offset: number): number {
  if (board <= viewport) return (viewport - board) / 2;
  return Math.min(0, Math.max(viewport - board, offset));
}

/** Zoom about a point in the viewport (a pinch's midpoint, the cursor) so what is under it stays under it. */
export function zoomAt(
  viewportW: number,
  viewportH: number,
  from: { scale: number; pan: PanOffset },
  toScale: number,
  focus: PanOffset,
): PanOffset {
  const k = toScale / from.scale;
  return constrainPan(viewportW, viewportH, toScale, {
    x: focus.x - (focus.x - from.pan.x) * k,
    y: focus.y - (focus.y - from.pan.y) * k,
  });
}

// ── Seeded look ──────────────────────────────────────────────────────────────

/** FNV-1a: a pin's id has to give the same tilt and tack on every device and every render, and nothing here needs more. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Avalanche, or ids that differ only in their last character land on nearly the same tilt and tack.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A value in [0, 1) for this id and purpose. Salted so one id's tilt and tack are not the same number. */
function unit(id: string, salt: string): number {
  return hash(`${salt}:${id}`) / 0x100000000;
}

export const MAX_TILT = 4;

/** Degrees, within about +-4, to a tenth. */
export function seededRotation(id: string): number {
  return Math.round((unit(id, "tilt") * 2 - 1) * MAX_TILT * 10) / 10;
}

export const TACKS = ["tack-brass", "tack-iron", "tack-red", "tack-blue", "tack-green"] as const;
export type TackName = (typeof TACKS)[number] | "nail";

/** A wanted poster is nailed up; everything else gets a tack. */
export function seededTack(id: string, style: NoticePinStyle): TackName {
  if (style === "poster") return "nail";
  return TACKS[Math.floor(unit(id, "tack") * TACKS.length)];
}

export const SCRAPS = ["scrap-0", "scrap-1", "scrap-2"] as const;
export const POSTER_SCRAPS = ["poster-scrap-0", "poster-scrap-1"] as const;
export type ScrapName = (typeof SCRAPS)[number] | (typeof POSTER_SCRAPS)[number];

/** The scrap a taken notice leaves matches the paper that was torn off it. */
export function seededScrap(id: string, style: NoticePinStyle): ScrapName {
  const pool = style === "poster" ? POSTER_SCRAPS : SCRAPS;
  return pool[Math.floor(unit(id, "scrap") * pool.length)];
}

// ── Sizes and free space ─────────────────────────────────────────────────────

export interface PinSize {
  w: number;
  h: number;
}

const WIDTHS: Record<NoticePinStyle, Record<NoticePinSize, number>> = {
  note: { sm: 220, md: 300, lg: 400 },
  poster: { sm: 230, md: 300, lg: 380 },
  letter: { sm: 220, md: 290, lg: 380 },
  image: { sm: 220, md: 300, lg: 400 },
};

/** Height over width: a poster is 3:4, a folded letter lies wide, a note and a picture are roughly square. */
const ASPECT: Record<NoticePinStyle, number> = { note: 0.9, poster: 4 / 3, letter: 0.68, image: 0.86 };

export function pinSize(style: NoticePinStyle, size: NoticePinSize): PinSize {
  const w = WIDTHS[style][size];
  return { w, h: Math.round(w * ASPECT[style]) };
}

/**
 * The nearest spot that keeps a pin of this kind and size wholly on the board, to the thousandth the row stores. The
 * far bound rounds down, so rounding never pushes a pin back over the edge. A drag clamps through it, and so does a
 * change of size or kind, which grows the paper from its top-left corner.
 */
export function keepOnBoard(x: number, y: number, style: NoticePinStyle, size: NoticePinSize): { x: number; y: number } {
  const { w, h } = pinSize(style, size);
  const fit = (value: number, max: number) => {
    const bound = Math.floor(max * 1000) / 1000;
    return Math.min(Math.max(Math.round(value * 1000) / 1000, 0), bound);
  };
  return { x: fit(x, 1 - w / BOARD_W), y: fit(y, 1 - h / BOARD_H) };
}

export interface PinSlot {
  style: NoticePinStyle;
  size: NoticePinSize;
  x: number;
  y: number;
}

/** Keep a new pin clear of the frame, which takes about 60 units of every side. */
const MARGIN = 80;
const GRID_X = 16;
const GRID_Y = 10;

type Box = { x: number; y: number; w: number; h: number };

/** Boxes are top-left anchored, like a pin's x/y. */
function overlap(a: Box, b: Box) {
  const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return dx > 0 && dy > 0 ? dx * dy : 0;
}

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/**
 * Where a new pin lands on a phone, where nobody is going to drag it: the emptiest spot, as the fractions of its
 * top-left corner (a pin's x/y is its corner before rotation). Candidates are a grid of corners; the winner overlaps
 * the least paper, then sits farthest from its nearest neighbour, then comes first in reading order, so the same
 * board always answers the same way.
 */
export function findFreeSpot(pins: readonly PinSlot[], style: NoticePinStyle, size: NoticePinSize): { x: number; y: number } {
  const me = pinSize(style, size);
  const others: Box[] = pins.map((p) => ({ x: p.x * BOARD_W, y: p.y * BOARD_H, ...pinSize(p.style, p.size) }));
  let best = { x: 0, y: 0, cost: Number.POSITIVE_INFINITY, gap: -1 };
  for (let row = 0; row < GRID_Y; row++) {
    for (let col = 0; col < GRID_X; col++) {
      const x = MARGIN + ((BOARD_W - 2 * MARGIN - me.w) * col) / (GRID_X - 1);
      const y = MARGIN + ((BOARD_H - 2 * MARGIN - me.h) * row) / (GRID_Y - 1);
      const probe: Box = { x, y, ...me };
      const c = centre(probe);
      const cost = others.reduce((sum, o) => sum + overlap(probe, o), 0);
      const gap = others.reduce((min, o) => Math.min(min, Math.hypot(centre(o).x - c.x, centre(o).y - c.y)), Number.POSITIVE_INFINITY);
      if (cost < best.cost || (cost === best.cost && gap > best.gap)) best = { x, y, cost, gap };
    }
  }
  return { x: Math.round((best.x / BOARD_W) * 1000) / 1000, y: Math.round((best.y / BOARD_H) * 1000) / 1000 };
}
