// What blocks light and sight on a map, read off its layers. Shared by the live snapshot (image cells), the editor's
// illumination preview and the glow baked into the picture (map cells, origin 0). In its own module so drawMap can use
// it without importing mapLive, which imports drawMap.

import { areaBlockingEdges } from "@/cartographer/area";
import type { CellKey, DungeonMapLayers, FloorCell } from "@/types/dungeonMap.types";
import { latticeKey, latticeSegment, type WallSegment } from "@/lib/battlemap/walls";

export function toImageCell(key: CellKey, originCellX: number, originCellY: number): string {
  const [xs, ys] = key.split(",");
  return `${Number(xs) - originCellX},${Number(ys) - originCellY}`;
}

/**
 * What blocks light and sight on a map, with every key shifted by the origin (0,0 for the editor, the image origin for
 * a snapshot). Walls and sluices are solid; doors keep their drawn state; grates are bars you can see through; solid
 * rock is its own cell layer.
 */
export function collectOcclusion(
  layers: DungeonMapLayers,
  originCellX: number,
  originCellY: number,
): { walls: WallSegment[]; doors: (WallSegment & { open: boolean })[]; solid: string[] } {
  const walls: WallSegment[] = [];
  const doors: (WallSegment & { open: boolean })[] = [];
  for (const [key, cell] of Object.entries(layers.floor) as [CellKey, FloorCell][]) {
    const [xs, ys] = toImageCell(key, originCellX, originCellY).split(",");
    for (const [side, seg] of [["N", cell.wallN], ["W", cell.wallW]] as const) {
      if (!seg) continue;
      // The id is the image-cell edge key: what `door_states` and `location_doors.edge_key` already name a door by.
      const wall = latticeSegment(latticeKey(Number(xs), Number(ys), side));
      if (seg.type === "wall" || seg.type === "sluice") walls.push(wall);
      else if (seg.type === "doorClosed") doors.push({ ...wall, open: false });
      else if (seg.type === "doorOpen") doors.push({ ...wall, open: true });
    }
  }
  // A brushed area's edge is a wall to light and sight wherever it meets non-floor, curved or not.
  for (const edge of areaBlockingEdges(layers)) {
    const [cell, side] = edge.split(":");
    walls.push(latticeSegment(`${toImageCell(cell as CellKey, originCellX, originCellY)}:${side}`));
  }
  const solid = Object.keys(layers.solidBlock).map((key) => toImageCell(key as CellKey, originCellX, originCellY));
  return { walls, doors, solid };
}
