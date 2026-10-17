// What blocks light and sight on a map, read off its layers. Shared by the live snapshot (image cells), the editor's
// illumination preview and the glow baked into the picture (map cells, origin 0). In its own module so drawMap can use
// it without importing mapLive, which imports drawMap.

import { areaBlockingEdges } from "@/cartographer/area";
import type { CellKey, DungeonMapLayers, FloorCell } from "@/types/dungeonMap.types";
import type { MapLiveDoor } from "@/types/mapLive.types";

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
): { walls: string[]; doors: MapLiveDoor[]; solid: string[] } {
  const walls: string[] = [];
  const doors: MapLiveDoor[] = [];
  for (const [key, cell] of Object.entries(layers.floor) as [CellKey, FloorCell][]) {
    const at = toImageCell(key, originCellX, originCellY);
    for (const [side, seg] of [["N", cell.wallN], ["W", cell.wallW]] as const) {
      if (!seg) continue;
      const edge = `${at}:${side}`;
      if (seg.type === "wall" || seg.type === "sluice") walls.push(edge);
      else if (seg.type === "doorClosed") doors.push({ edge, open: false });
      else if (seg.type === "doorOpen") doors.push({ edge, open: true });
    }
  }
  // A brushed area's edge is a wall to light and sight wherever it meets non-floor, curved or not.
  for (const edge of areaBlockingEdges(layers)) {
    const [cell, side] = edge.split(":");
    walls.push(`${toImageCell(cell as CellKey, originCellX, originCellY)}:${side}`);
  }
  const solid = Object.keys(layers.solidBlock).map((key) => toImageCell(key as CellKey, originCellX, originCellY));
  return { walls, doors, solid };
}
