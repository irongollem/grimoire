// Test helper: puts a lattice wall on a layers object the way the editor stores it (`layers.walls`, keyed by edge key).
import type { DungeonMapLayers, EdgeSeg } from "@/types/dungeonMap.types";
import { latticeKey } from "@/lib/battlemap/walls";
import { latticeWall } from "@/cartographer/wallGraph";

export function putWall(layers: DungeonMapLayers, x: number, y: number, side: "N" | "W", seg: EdgeSeg, visible?: boolean): void {
  layers.walls[latticeKey(x, y, side)] = latticeWall(x, y, side, seg, visible);
}
