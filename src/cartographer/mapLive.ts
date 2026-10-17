// The live snapshot a publish writes beside the Drawing (epic #1073). Pure: the map, the pack runtimes and the
// dressing catalogue in, a JSON-able `MapLive` out. Players cannot read `dungeon_maps`, so whatever the battle map's
// live layer needs (water cells and their motion now, lights and vision later) is captured here, in the Drawing's
// own image-cell space (cell (0,0) = the image's top-left cell, the space the fog mask and tokens use).

import type { DungeonMap, CellKey } from "@/types/dungeonMap.types";
import type { MapLive, MapLiveGroup, MapLiveSprite, MotionOverlay } from "@/types/mapLive.types";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { dressingCentre, dressingDrawOrder, type DressingCatalog } from "@/cartographer/dressing";
import { dressingSway, objectSway, phaseAt } from "@/cartographer/sway";
import { gatherLightSources } from "@/cartographer/drawMap";
import { collectOcclusion, toImageCell } from "@/cartographer/mapOcclusion";
import { cellKey } from "@/types/dungeonMap.types";

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
      ...(light.flicker !== undefined ? { flicker: light.flicker } : {}),
      ...(light.pulse !== undefined ? { pulse: light.pulse } : {}),
      phase: phaseAt(x - originCellX, y - originCellY),
    }),
  );

  return {
    version: 1,
    darkness: map.darkness,
    groups,
    lights,
    sprites: gatherSprites(map, runtimes, dressing, originCellX, originCellY),
    ...collectOcclusion(map.layers, originCellX, originCellY),
  };
}

/**
 * The things that sway, as sprites. Chosen by the same predicate the bake uses to leave them out (`objectSway`,
 * `dressingSway`), so a standing bake made with `omitSway` plus these sprites shows every prop exactly once.
 * Standing objects in row-major order (the order the bake paints them), then Dressing by z.
 */
function gatherSprites(
  map: DungeonMap,
  runtimes: Map<string, TilePackRuntime>,
  dressing: DressingCatalog,
  originCellX: number,
  originCellY: number,
): MapLiveSprite[] {
  const sprites: MapLiveSprite[] = [];
  const cells = Object.keys(map.layers.object).map((key) => {
    const [xs, ys] = key.split(",");
    return { x: Number(xs), y: Number(ys) };
  });
  cells.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const { x, y } of cells) {
    const obj = map.layers.object[cellKey(x, y)];
    if (!obj) continue;
    const art = objectSway(obj, runtimes.get(obj.pack_id) ?? null);
    if (!art) continue;
    const cx = x + 0.5 - originCellX;
    const cy = y + 0.5 - originCellY;
    sprites.push({ url: art.url, x: cx, y: cy, w: 1, h: 1, rotation: obj.rotation ?? 0, sway: { ...art.sway, phase: phaseAt(cx, cy) } });
  }
  for (const [, placement] of dressingDrawOrder(map.layers.dressing)) {
    const prop = dressing.get(placement.prop_id);
    const art = dressingSway(prop);
    if (!prop || !art) continue;
    const c = dressingCentre(placement, prop.footprint_w, prop.footprint_h);
    const cx = c.x - originCellX;
    const cy = c.y - originCellY;
    sprites.push({
      url: art.url,
      x: cx,
      y: cy,
      w: prop.footprint_w,
      h: prop.footprint_h,
      rotation: placement.rotation,
      sway: { ...art.sway, phase: phaseAt(cx, cy) },
    });
  }
  return sprites;
}
