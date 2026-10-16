// The live snapshot a publish writes beside the Drawing (epic #1073). Pure: the map, the pack runtimes and the
// dressing catalogue in, a JSON-able `MapLive` out. Players cannot read `dungeon_maps`, so whatever the battle map's
// live layer needs (water cells and their motion now, lights and vision later) is captured here, in the Drawing's
// own image-cell space (cell (0,0) = the image's top-left cell, the space the fog mask and tokens use).

import type { DungeonMap, CellKey } from "@/types/dungeonMap.types";
import type { MapLive, MapLiveGroup, MotionOverlay } from "@/types/mapLive.types";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { DressingCatalog } from "@/cartographer/dressing";
import { gatherLightSources } from "@/cartographer/drawMap";

function toImageCell(key: CellKey, originCellX: number, originCellY: number): string {
  const [xs, ys] = key.split(",");
  return `${Number(xs) - originCellX},${Number(ys) - originCellY}`;
}

function groupByPack(
  cells: Record<CellKey, { pack_id: string }>,
  originCellX: number,
  originCellY: number,
): Map<string, string[]> {
  const byPack = new Map<string, string[]>();
  for (const [key, cell] of Object.entries(cells) as [CellKey, { pack_id: string }][]) {
    const list = byPack.get(cell.pack_id);
    const imageKey = toImageCell(key, originCellX, originCellY);
    if (list) list.push(imageKey);
    else byPack.set(cell.pack_id, [imageKey]);
  }
  return byPack;
}

/**
 * Snapshot of a map for the live layer. A pack's painted water always makes a group (later stories read its cells
 * even when the pack declares no motion); outer mass is many cells and useless without overlays, so a pack with
 * none makes no `outer` group. `originCellX/Y` come from `computeBakedDimensions`, the same numbers the Drawing's
 * calibration stores.
 */
export function buildMapLive(
  map: DungeonMap,
  runtimes: Map<string, TilePackRuntime>,
  dressing: DressingCatalog,
  originCellX: number,
  originCellY: number,
): MapLive {
  const groups: MapLiveGroup[] = [];
  const overlaysOf = (packId: string, key: "terrainWater" | "solidBlock"): MotionOverlay[] =>
    runtimes.get(packId)?.manifest.motion?.[key] ?? [];

  for (const [packId, cells] of groupByPack(map.layers.terrain, originCellX, originCellY)) {
    groups.push({ kind: "water", cells, overlays: overlaysOf(packId, "terrainWater") });
  }
  for (const [packId, cells] of groupByPack(map.layers.solidBlock, originCellX, originCellY)) {
    const overlays = overlaysOf(packId, "solidBlock");
    if (overlays.length > 0) groups.push({ kind: "outer", cells, overlays });
  }

  const lights = gatherLightSources(map.layers, (packId) => runtimes.get(packId) ?? null, dressing, null).map(
    ({ x, y, light }) => ({
      x: x - originCellX,
      y: y - originCellY,
      color: light.color,
      bright: light.bright,
      dim: light.dim,
      ...(light.intensity !== undefined ? { intensity: light.intensity } : {}),
    }),
  );

  return { version: 1, groups, lights };
}
