/**
 * Lining a grid up with a picture (#1125, canvas frames 06 and 07): the maths behind "Bring a map" and the
 * Picture layer's "Line up the grid". A calibration is the grid in the picture's own frame: how many squares
 * span its width, and where a grid line crosses the top-left corner area (0..1 of its size).
 */
import { gridFromFileName, pixelsPerCellFromFileName } from "@/lib/mapImport/gridFromFileName";
import type { GridCalibration } from "@/types/location.types";

/** Squares across when nothing says otherwise: a battle map's usual width. */
export const DEFAULT_SQUARES_ACROSS = 30;

/** Smallest box, in picture pixels, that can be "one square". Under this the drag was a slip of the hand. */
const MIN_BOX_PX = 4;

export interface ImageSize {
  width: number;
  height: number;
}

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Where a grid of `squaresAcross` squares sits on a picture, its lines crossing at (originPxX, originPxY). */
export function calibrationFor(
  natural: ImageSize,
  squaresAcross: number,
  origin: { x: number; y: number } = { x: 0, y: 0 },
): GridCalibration {
  if (squaresAcross <= 0 || natural.width <= 0 || natural.height <= 0) {
    throw new Error("A grid needs a picture with a size and at least one square across.");
  }
  const cellPx = natural.width / squaresAcross;
  return {
    cells_per_image_width: squaresAcross,
    origin_x_pct: mod(origin.x, cellPx) / natural.width,
    origin_y_pct: mod(origin.y, cellPx) / natural.height,
  };
}

/** How many squares tall the picture is, "from the picture's shape" (frame 06). */
export function squaresDown(cal: Pick<GridCalibration, "cells_per_image_width">, natural: ImageSize): number {
  return (natural.height * cal.cells_per_image_width) / natural.width;
}

/** The grid slid by (dx, dy) picture pixels, wrapping at one square: a grid repeats, so there is no "off the edge". */
export function shiftGrid(cal: GridCalibration, natural: ImageSize, dx: number, dy: number): GridCalibration {
  const cellPx = natural.width / cal.cells_per_image_width;
  return {
    ...cal,
    origin_x_pct: mod(cal.origin_x_pct * natural.width + dx, cellPx) / natural.width,
    origin_y_pct: mod(cal.origin_y_pct * natural.height + dy, cellPx) / natural.height,
  };
}

/**
 * "Draw a box over one square on the map and the rest follows": the box's side is the square's size, and its
 * top-left corner a grid crossing. A box is a rectangle dragged in any direction, so the corners are sorted first.
 */
export function calibrationFromBox(
  box: { x0: number; y0: number; x1: number; y1: number },
  natural: ImageSize,
): GridCalibration | null {
  const left = Math.min(box.x0, box.x1);
  const top = Math.min(box.y0, box.y1);
  const w = Math.abs(box.x1 - box.x0);
  const h = Math.abs(box.y1 - box.y0);
  if (w < MIN_BOX_PX || h < MIN_BOX_PX) return null;
  // Hands are not square; the average of the two sides is the better guess at a square's size.
  const side = (w + h) / 2;
  return calibrationFor(natural, natural.width / side, { x: left, y: top });
}

/** Grid line positions in picture pixels, for drawing the overlay. */
export function gridLines(cal: GridCalibration, natural: ImageSize): { xs: number[]; ys: number[] } {
  const cellPx = natural.width / cal.cells_per_image_width;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = cal.origin_x_pct * natural.width; x <= natural.width + 0.5; x += cellPx) xs.push(x);
  for (let y = cal.origin_y_pct * natural.height; y <= natural.height + 0.5; y += cellPx) ys.push(y);
  return { xs, ys };
}

/**
 * A pointer position on screen as a pixel of a picture shown `object-fit: contain` inside `rect`: the picture is
 * scaled to fit and centred, so the margins around it are not part of it.
 */
export function clientToImage(
  rect: { left: number; top: number; width: number; height: number },
  natural: ImageSize,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const scale = Math.min(rect.width / natural.width, rect.height / natural.height);
  const offsetX = (rect.width - natural.width * scale) / 2;
  const offsetY = (rect.height - natural.height * scale) / 2;
  return { x: (clientX - rect.left - offsetX) / scale, y: (clientY - rect.top - offsetY) / scale };
}

export type GridSource = "name" | "default";

/**
 * The grid a file arrives with: the size its name states ("riverside_30x20.webm", "forest_100ppi.png"),
 * else {@link DEFAULT_SQUARES_ACROSS}. `source` lets the screen say which it was.
 */
export function initialGrid(fileName: string, natural: ImageSize): { calibration: GridCalibration; source: GridSource } {
  const named = gridFromFileName(fileName);
  if (named) return { calibration: calibrationFor(natural, named.cols), source: "name" };
  const ppc = pixelsPerCellFromFileName(fileName);
  if (ppc !== null) return { calibration: calibrationFor(natural, natural.width / ppc), source: "name" };
  return { calibration: calibrationFor(natural, DEFAULT_SQUARES_ACROSS), source: "default" };
}

export type SquareFeet = 5 | 10;

/**
 * The calibration the battle map reads counts 5 ft cells, so a map drawn in 10 ft squares is written with twice
 * the squares across: its play grid then lines up with the picture's. Each 10 ft line is a 5 ft line too, so the
 * origin only needs wrapping into the smaller cell.
 */
export function fiveFootCalibration(cal: GridCalibration, natural: ImageSize, squareFeet: SquareFeet): GridCalibration {
  if (squareFeet === 5) return cal;
  const doubled: GridCalibration = { ...cal, cells_per_image_width: cal.cells_per_image_width * (squareFeet / 5) };
  return shiftGrid(doubled, natural, 0, 0);
}

/**
 * The same grid with another number of squares across; a line stays where it was, wrapped into the new square.
 * Everything else the calibration carries (its opacity, the origin cell a publish wrote) is not the stepper's to lose.
 */
export function withSquaresAcross(cal: GridCalibration, natural: ImageSize, squaresAcross: number): GridCalibration {
  return {
    ...cal,
    ...calibrationFor(natural, squaresAcross, { x: cal.origin_x_pct * natural.width, y: cal.origin_y_pct * natural.height }),
  };
}
