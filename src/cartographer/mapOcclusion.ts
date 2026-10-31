// What blocks light and sight on a map, read off its layers. Shared by the live snapshot (image cells), the editor's
// illumination preview and the glow baked into the picture (map cells, origin 0). In its own module so drawMap can use
// it without importing mapLive, which imports drawMap.

import { areaBlockingEdges } from "@/cartographer/area";
import type { CellKey, DungeonMapLayers, WallEdge } from "@/types/dungeonMap.types";
import { latticeSegment, type WallSegment } from "@/lib/battlemap/walls";
import { isLatticeKey } from "@/cartographer/wallGraph";

export function toImageCell(key: CellKey, originCellX: number, originCellY: number): string {
  const [xs, ys] = key.split(",");
  return `${Number(xs) - originCellX},${Number(ys) - originCellY}`;
}

/**
 * One wall as the segment sight and light test, shifted by the origin. A lattice wall's id is its image-cell edge key,
 * which is what `door_states` and `location_doors.edge_key` already name a door by; an angled wall keeps its uuid.
 */
export function occlusionSegment(key: string, wall: WallEdge, originCellX: number, originCellY: number): WallSegment {
  if (isLatticeKey(key)) {
    const [cell, side] = key.split(":");
    return latticeSegment(`${toImageCell(cell as CellKey, originCellX, originCellY)}:${side}`);
  }
  return {
    id: key,
    a: [wall.a[0] - originCellX, wall.a[1] - originCellY],
    b: [wall.b[0] - originCellX, wall.b[1] - originCellY],
  };
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
  for (const [key, wall] of Object.entries(layers.walls)) {
    const segment = occlusionSegment(key, wall, originCellX, originCellY);
    if (wall.type === "wall" || wall.type === "sluice") walls.push(segment);
    else if (wall.type === "doorClosed") doors.push({ ...segment, open: false });
    else if (wall.type === "doorOpen") doors.push({ ...segment, open: true });
  }
  // A brushed area's edge is a wall to light and sight wherever it meets non-floor, curved or not.
  for (const edge of areaBlockingEdges(layers)) {
    const [cell, side] = edge.split(":");
    walls.push(latticeSegment(`${toImageCell(cell as CellKey, originCellX, originCellY)}:${side}`));
  }
  const solid = Object.keys(layers.solidBlock).map((key) => toImageCell(key as CellKey, originCellX, originCellY));
  return { walls, doors, solid };
}
