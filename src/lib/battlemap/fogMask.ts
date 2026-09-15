// Pure helpers for fog-of-war masks. The mask is the set of *revealed*
// cell keys ("x,y"). Empty mask = nothing revealed (full fog). The string
// encoding is a simple semicolon-joined list, compact enough for the
// 50–100 cell battle maps that fit in a browser viewport.

export type CellKey = string; // "x,y"

export function encodeFogMask(mask: Set<CellKey>): string {
  return [...mask].join(";");
}

export function decodeFogMask(encoded: string | null | undefined): Set<CellKey> {
  if (!encoded) return new Set();
  const result = new Set<CellKey>();
  for (const tok of encoded.split(";")) {
    if (/^-?\d+,-?\d+$/.test(tok)) result.add(tok);
  }
  return result;
}

/**
 * Whether a live encounter's fog has never been seeded. `null`/`undefined` is
 * that "never seeded" state — `goLive` writes `fog_mask: null` on every fresh
 * go-live, and nothing ever writes it back to null afterwards, so a seeded
 * row stays seeded across a remount (a refresh, or a second map window).
 * An empty string is "Hide all" — a real DM choice made *after* seeding —
 * and must read as already-seeded, not as "never seeded", or the next
 * surface recompute would silently undo it.
 */
export function shouldSeedFog(encoded: string | null | undefined): boolean {
  return encoded == null;
}

export interface BrushInput {
  pixelX: number;
  pixelY: number;
  cellPx: number;
  originX: number;
  originY: number;
  brushCells: number;
}

/**
 * Cells covered by a round brush. The brush radius is `brushCells / 2`
 * cells; cells whose centre falls within that radius (in cell units) are
 * included. A 1-cell brush returns just the cursor's cell; a 3-cell brush
 * covers ~3.14 cells in a roughly circular pattern.
 */
export function roundBrushCells(input: BrushInput): Set<CellKey> {
  if (input.cellPx <= 0 || input.brushCells <= 0) return new Set();
  const radius = input.brushCells / 2; // in cell units
  const cursorCellX = (input.pixelX - input.originX) / input.cellPx;
  const cursorCellY = (input.pixelY - input.originY) / input.cellPx;
  const span = Math.ceil(radius);
  const result = new Set<CellKey>();
  for (let dy = -span; dy <= span; dy++) {
    for (let dx = -span; dx <= span; dx++) {
      const cellX = Math.floor(cursorCellX) + dx;
      const cellY = Math.floor(cursorCellY) + dy;
      // Distance from cell *centre* to cursor.
      const cx = cellX + 0.5;
      const cy = cellY + 0.5;
      const dist = Math.hypot(cx - cursorCellX, cy - cursorCellY);
      if (dist <= radius) {
        result.add(`${cellX},${cellY}`);
      }
    }
  }
  return result;
}

/**
 * Cells covered by a square cell-brush centred on the cursor cell. Even
 * brush sizes are clamped down to the previous odd number so the brush
 * always has a well-defined centre cell.
 */
export function cellBrushCells(input: BrushInput): Set<CellKey> {
  if (input.cellPx <= 0 || input.brushCells <= 0) return new Set();
  const size = input.brushCells % 2 === 0 ? input.brushCells - 1 : input.brushCells;
  const half = (size - 1) / 2;
  const cursorCellX = Math.floor((input.pixelX - input.originX) / input.cellPx);
  const cursorCellY = Math.floor((input.pixelY - input.originY) / input.cellPx);
  const result = new Set<CellKey>();
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      result.add(`${cursorCellX + dx},${cursorCellY + dy}`);
    }
  }
  return result;
}

export type BrushMode = "reveal" | "rehide";

export function applyBrush(
  mask: Set<CellKey>,
  brushed: Set<CellKey>,
  mode: BrushMode,
): Set<CellKey> {
  const next = new Set(mask);
  if (mode === "reveal") {
    for (const k of brushed) next.add(k);
  } else {
    for (const k of brushed) next.delete(k);
  }
  return next;
}

// ── The feathered render (epic #884, wave 4, S12) ───────────────────────────
//
// The maintainer's ruling: "A blocked cell should be fully black and the
// feather should be OUTSIDE the blocked cell." So a hidden cell is fully
// opaque fog, edge to edge, with no exception near a border — and the
// softening lives entirely on the REVEALED side of that border, fading to
// nothing within half a cell. No light model: a cell's own membership in
// `mask` is the only input, never a wall, a door, or a viewing angle — "too
// complex for this pass... it's mostly to have a visual effect now."
//
// This is resolution-agnostic by construction: a site's fog mask keys on
// room cells, an encounter's on grid cells, but both are Sets of the same
// `CellKey` ("x,y") shape, so the exact same functions below serve both —
// "two resolutions of one layer, not two features."

/** A revealed cell is fully dark within this fraction of a cell, measured
 *  from the edge it shares with a hidden neighbour — "roughly half a
 *  cell." */
export const FEATHER_FRACTION = 0.5;

export type FeatherSide = "top" | "bottom" | "left" | "right";

export interface FeatherEdge {
  /** The REVEALED cell the feather is drawn into — never the hidden one. */
  cellX: number;
  cellY: number;
  /** Which side of that cell borders a hidden neighbour. */
  side: FeatherSide;
}

const NEIGHBOR_SIDES: ReadonlyArray<{ dx: number; dy: number; side: FeatherSide }> = [
  { dx: 0, dy: -1, side: "top" },
  { dx: 0, dy: 1, side: "bottom" },
  { dx: -1, dy: 0, side: "left" },
  { dx: 1, dy: 0, side: "right" },
];

/**
 * Every (revealed cell, hidden neighbour) edge that needs a feather — one
 * entry per side of a revealed cell that borders a cell NOT in `mask`. A
 * revealed cell entirely surrounded by other revealed cells (the interior of
 * a fully-revealed area) contributes nothing, which is exactly what makes
 * "a fully-revealed mask draws nothing" true: there is no hidden neighbour
 * left to feather against. Only von-Neumann (4-way) neighbours count — a
 * diagonal touch is a corner case this pass doesn't model, same as the
 * maintainer's "no walls, no viewing angles" ruling.
 */
export function featherEdges(mask: Set<CellKey>): FeatherEdge[] {
  const edges: FeatherEdge[] = [];
  for (const key of mask) {
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    for (const n of NEIGHBOR_SIDES) {
      if (!mask.has(`${x + n.dx},${y + n.dy}`)) edges.push({ cellX: x, cellY: y, side: n.side });
    }
  }
  return edges;
}

/** A feather edge's canvas-pixel rectangle, and the line a linear gradient
 *  should be drawn along to fade from fully opaque (at the shared edge) to
 *  fully transparent (`FEATHER_FRACTION` of a cell into the revealed cell).
 *  `cellPx`/`originX`/`originY` are the same viewport geometry every other
 *  battle-map helper takes; passing `cellPx: 1, originX: 0, originY: 0`
 *  gives unit-cell coordinates for an SVG plan instead of a raster canvas. */
export interface FeatherRect {
  x: number;
  y: number;
  w: number;
  h: number;
  gradient: { x0: number; y0: number; x1: number; y1: number };
}

export function featherRect(edge: FeatherEdge, cellPx: number, originX: number, originY: number): FeatherRect {
  const featherPx = cellPx * FEATHER_FRACTION;
  const left = originX + edge.cellX * cellPx;
  const top = originY + edge.cellY * cellPx;
  switch (edge.side) {
    case "top":
      return { x: left, y: top, w: cellPx, h: featherPx, gradient: { x0: left, y0: top, x1: left, y1: top + featherPx } };
    case "bottom":
      return {
        x: left,
        y: top + cellPx - featherPx,
        w: cellPx,
        h: featherPx,
        gradient: { x0: left, y0: top + cellPx, x1: left, y1: top + cellPx - featherPx },
      };
    case "left":
      return { x: left, y: top, w: featherPx, h: cellPx, gradient: { x0: left, y0: top, x1: left + featherPx, y1: top } };
    case "right":
      return {
        x: left + cellPx - featherPx,
        y: top,
        w: featherPx,
        h: cellPx,
        gradient: { x0: left + cellPx, y0: top, x1: left + cellPx - featherPx, y1: top },
      };
  }
}

/**
 * The fog's opacity at one point in the same pixel space as `featherRect`
 * (0 = fully revealed, 1 = fully hidden). This is the renderer's contract
 * spelled out as a pure sampling function rather than canvas draw calls —
 * `BattleMapFogLayer.vue` draws the equivalent picture as a punch-hole fill
 * plus per-edge gradients (cheaper for a live canvas than sampling every
 * pixel), but what it draws must agree with this everywhere. A hidden cell
 * always returns 1, unconditionally — the feather never touches the hidden
 * side of a border, which is the maintainer's ruling structurally guaranteed
 * rather than merely aimed for.
 */
export function fogOpacityAt(
  pixelX: number,
  pixelY: number,
  mask: Set<CellKey>,
  cellPx: number,
  originX: number,
  originY: number,
): number {
  if (cellPx <= 0) return 1;
  const cellX = Math.floor((pixelX - originX) / cellPx);
  const cellY = Math.floor((pixelY - originY) / cellPx);
  if (!mask.has(`${cellX},${cellY}`)) return 1;

  const fracX = (pixelX - originX) / cellPx - cellX;
  const fracY = (pixelY - originY) / cellPx - cellY;
  let opacity = 0;
  if (!mask.has(`${cellX},${cellY - 1}`)) opacity = Math.max(opacity, featherFalloff(fracY));
  if (!mask.has(`${cellX},${cellY + 1}`)) opacity = Math.max(opacity, featherFalloff(1 - fracY));
  if (!mask.has(`${cellX - 1},${cellY}`)) opacity = Math.max(opacity, featherFalloff(fracX));
  if (!mask.has(`${cellX + 1},${cellY}`)) opacity = Math.max(opacity, featherFalloff(1 - fracX));
  return opacity;
}

/** Linear falloff: 1 at the shared edge (`dist` 0), 0 at `FEATHER_FRACTION`
 *  of a cell in, and clamped outside that range. */
function featherFalloff(dist: number): number {
  if (dist <= 0) return 1;
  if (dist >= FEATHER_FRACTION) return 0;
  return 1 - dist / FEATHER_FRACTION;
}

/**
 * Combatants whose anchor cell is under fog are omitted — the encounter
 * battle map's "tokens obey fog" rule (frame 08/13): a player never sees a
 * monster that has walked out of revealed space, even with the token layer
 * itself on. A combatant with no position (not yet placed) is always kept —
 * there is no cell to check it against. The DM's own view never calls this;
 * it reads `combatants` directly and sees every token regardless of fog.
 */
export function revealedCombatants<T extends { position?: { x: number; y: number } | null }>(
  combatants: readonly T[],
  mask: Set<CellKey>,
): T[] {
  return combatants.filter((c) => !c.position || mask.has(`${c.position.x},${c.position.y}`));
}
