// What blocks light and sight on a map, read off its layers. Shared by the live snapshot (image cells), the editor's
// illumination preview and the glow baked into the picture (map cells, origin 0). In its own module so drawMap can use
// it without importing mapLive, which imports drawMap.

import type { CellKey, DungeonMapLayers, WallEdge } from "@/types/dungeonMap.types";
import { latticeSegment, type WallSegment } from "@/lib/battlemap/walls";
import { isLatticeKey } from "@/cartographer/wallGraph";
import { cachedWallGeometry, type WallGeometry } from "@/cartographer/wallGeometry";

export function toImageCell(key: CellKey, originCellX: number, originCellY: number): string {
  const [xs, ys] = key.split(",");
  return `${Number(xs) - originCellX},${Number(ys) - originCellY}`;
}

/**
 * One lattice wall as the segment sight and light test, shifted by the origin. Its id is its image-cell edge key, which
 * is what `door_states` and `location_doors.edge_key` already name a door by.
 */
export function latticeOcclusionSegment(key: string, originCellX: number, originCellY: number): WallSegment {
  const [cell, side] = key.split(":");
  return latticeSegment(`${toImageCell(cell as CellKey, originCellX, originCellY)}:${side}`);
}

/**
 * The segments of one wall, shifted by the origin. A lattice wall is one segment named by its edge key; an angled wall
 * is the pieces of its drawn line (several when it curves through a smooth node), each named by the wall's uuid plus a
 * sub-index, so sight stops at the curve the player sees and not at its chord.
 */
export function occlusionSegments(
  key: string,
  wall: WallEdge,
  geometry: WallGeometry,
  originCellX: number,
  originCellY: number,
): WallSegment[] {
  if (isLatticeKey(key)) return [latticeOcclusionSegment(key, originCellX, originCellY)];
  const pieces = geometry.lines.get(key)?.pieces ?? [{ id: key, a: wall.a, b: wall.b }];
  return pieces.map((p) => ({
    id: p.id,
    a: [p.a[0] - originCellX, p.a[1] - originCellY],
    b: [p.b[0] - originCellX, p.b[1] - originCellY],
  }));
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
  const geometry = cachedWallGeometry(layers.walls);
  for (const [key, wall] of Object.entries(layers.walls)) {
    const segments = occlusionSegments(key, wall, geometry, originCellX, originCellY);
    if (wall.type === "wall" || wall.type === "sluice") walls.push(...segments);
    // A door is never curved (a door end is a corner), so it is the one segment.
    else if (wall.type === "doorClosed") doors.push({ ...segments[0], open: false });
    else if (wall.type === "doorOpen") doors.push({ ...segments[0], open: true });
  }
  const solid = Object.keys(layers.solidBlock).map((key) => toImageCell(key as CellKey, originCellX, originCellY));
  return { walls, doors, solid };
}
