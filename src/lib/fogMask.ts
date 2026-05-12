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
