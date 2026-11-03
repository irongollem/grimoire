import { cellKey, type CellKey } from "@/types/dungeonMap.types";

/**
 * Which half-cell units of a room are taken. Tokens claim space in half cells so a Tiny token (half a square a side,
 * #1125 decision 13) takes a quarter square and four share one. `available` is the set of squares a token may stand on.
 * Shared by seeding the party (`roomBridge`) and scattering foes (`scatter`).
 */
export function createOccupancy(available: ReadonlySet<CellKey>) {
  const occupied = new Set<string>();

  /** Half-cell units a box starting at (x, y) with `size` cells per side covers. */
  function units(x: number, y: number, size: number): [number, number][] {
    const out: [number, number][] = [];
    const span = Math.round(size * 2);
    for (let dy = 0; dy < span; dy++) {
      for (let dx = 0; dx < span; dx++) out.push([Math.round(x * 2) + dx, Math.round(y * 2) + dy]);
    }
    return out;
  }

  /** True when the whole box lies on available squares and no claimed unit. */
  function fits(x: number, y: number, size: number): boolean {
    return units(x, y, size).every(([ux, uy]) =>
      available.has(cellKey(Math.floor(ux / 2), Math.floor(uy / 2))) && !occupied.has(`${ux},${uy}`));
  }

  function claim(x: number, y: number, size: number): void {
    for (const [ux, uy] of units(x, y, size)) occupied.add(`${ux},${uy}`);
  }

  return { fits, claim };
}

/** Where a token of `size` may start inside one square: the square itself, or its four quarters for a Tiny one, in reading order. */
export function startOffsets(size: number): [number, number][] {
  return size < 1 ? [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]] : [[0, 0]];
}
