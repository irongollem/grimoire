// The ways OFF a map (#1203): the squares a creature that flees may walk out of the fight by. Pure and
// edge-importable. Nothing new is stored: both kinds are read from what the map system already has.
//
// - An Entrance zone is where the party walks IN, and so where anyone walks out: the outer gate of a site.
// - A map whose place is open country (a `wilds`) can be left over any edge: every cell on the border of its bounds.
//
// A sealed dungeon level has neither, so it has no way off and a fleeing creature just runs from its enemies.

import type { CellKey } from "../../types/dungeonMap.types.ts";
import type { GridCalibration } from "../../types/location.types.ts";
import type { LocationMapRegion } from "../../types/locationMapRegion.types.ts";
import { regionCellToBattleCell } from "./roomBridge.ts";

/** One square a creature can leave the map from, in battle (image) cells. */
export interface MapExit {
  /** `"x,y"`. */
  cell: string;
  /** The Entrance zone's name when it has one; null for an unnamed zone and for the edge of open country. */
  label: string | null;
  kind: "entrance" | "edge";
}

/** What the Entrance zones need of a map region: the plan row's own columns. */
export type ExitRegion = Pick<LocationMapRegion, "region_role" | "zone_kind" | "label" | "cells">;

/** The squares of every Entrance zone on the map (not only the ones that touch a room: a goblin flees the room, then the site). */
export function entranceExits(regions: readonly ExitRegion[], calibration: GridCalibration): MapExit[] {
  const byCell = new Map<string, MapExit>();
  for (const region of regions) {
    if (region.region_role !== "zone" || region.zone_kind !== "entrance") continue;
    const label = region.label === null || region.label.trim() === "" ? null : region.label.trim();
    for (const c of region.cells as CellKey[]) {
      const cell = regionCellToBattleCell(c, calibration);
      const known = byCell.get(cell);
      // Two zones over one square: the one with a name is the better thing to say.
      if (known === undefined || (known.label === null && label !== null)) byCell.set(cell, { cell, label, kind: "entrance" });
    }
  }
  return [...byCell.values()];
}

/**
 * Every cell on the border of the bounds. When the picture's height is not recorded (`rowsKnown` false) the bottom
 * bound is only a guess at where the known rows end, so it is NOT an edge: left, top and right are real.
 */
export function edgeExits(bounds: { minX: number; minY: number; maxX: number; maxY: number }, rowsKnown: boolean): MapExit[] {
  const out: MapExit[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const onBorder = x === bounds.minX || x === bounds.maxX || y === bounds.minY || (rowsKnown && y === bounds.maxY);
      if (onBorder) out.push({ cell: `${x},${y}`, label: null, kind: "edge" });
    }
  }
  return out;
}
