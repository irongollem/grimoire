// Canvas-pixel ↔ grid-cell conversions for VTT token placement.
// The "anchor cell" is the top-left cell a token occupies; for footprints
// larger than 1×1 the token visually extends down-right from that anchor.

export interface SnapInput {
  /** Canvas-pixel coordinate the user dropped the token at. Interpreted as
   *  the desired *center* of the token. */
  pixelX: number;
  pixelY: number;
  /** Display-pixel size of one grid cell. */
  cellPx: number;
  /** Canvas-pixel coordinate of cell (0,0)'s top-left. */
  originX: number;
  originY: number;
  /** Token footprint in cells (1 / 2 / 3 / 4). */
  footprint: number;
}

export function snapPixelToCell(input: SnapInput): { x: number; y: number } {
  const halfFootprintPx = (input.footprint * input.cellPx) / 2;
  // Convert drop-point (center of token) to top-left pixel of token bounds,
  // then express in cell units relative to origin, then round to nearest cell.
  const anchorPxX = input.pixelX - halfFootprintPx;
  const anchorPxY = input.pixelY - halfFootprintPx;
  return {
    x: Math.round((anchorPxX - input.originX) / input.cellPx) + 0,
    y: Math.round((anchorPxY - input.originY) / input.cellPx) + 0,
  };
}

export interface CellToPixelInput {
  cellX: number;
  cellY: number;
  cellPx: number;
  originX: number;
  originY: number;
}

export function cellToPixel(input: CellToPixelInput): { x: number; y: number } {
  return {
    x: input.originX + input.cellX * input.cellPx,
    y: input.originY + input.cellY * input.cellPx,
  };
}
