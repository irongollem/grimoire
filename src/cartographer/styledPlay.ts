// What keeps playing once an AI-styled painting replaces a site's Picture (8 Nov 2026). The painting draws everything
// the tiles used to, so walls and doors stop being *seen*, but they still stop sight and light, and the water waves
// and light flicker still run. Two pure pieces: the walls-only Drawing the site stays linked to, and the live snapshot
// with every tile-art redraw taken out. Both are in the source Drawing's own cell space, which is the styled
// picture's: `styledPictureCalibration` carries the Drawing's `origin_cell_x/y`, so map cells do not move.

import { buildMapLive, type MapLiveSource } from "@/cartographer/mapLive";
import type { DressingCatalog } from "@/cartographer/dressing";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { emptyLayers, type DungeonMap, type DungeonMapInsert, type DungeonMapLayers, type WallEdge } from "@/types/dungeonMap.types";
import type { MapLive } from "@/types/mapLive.types";
import type { GridCalibration } from "@/types/location.types";
import { resolveOriginCell } from "@/lib/locations/gridCalibration";

/** The edges that stop sight or light (the same types `collectOcclusion` reads); a window or grate blocks nothing. */
const OCCLUDING_EDGES: ReadonlySet<WallEdge["type"]> = new Set(["wall", "sluice", "doorClosed", "doorOpen"]);

/**
 * The layers of the Drawing a styled site stays linked to: every wall and door of the source with `visible: false`
 * (kept under the same key, so lattice edges and door ids still match), and its placed lights. Floor, terrain,
 * objects, dressing and annotations are the painting's job now.
 */
export function wallsOnlyLayers(map: Pick<DungeonMap, "layers">): DungeonMapLayers {
  const layers = emptyLayers();
  for (const [key, wall] of Object.entries(map.layers.walls)) {
    if (!OCCLUDING_EDGES.has(wall.type)) continue;
    layers.walls[key] = { ...wall, visible: false };
  }
  // Copied by spreading, not structuredClone: the editor hands over its reactive map, and a Vue proxy cannot be cloned.
  layers.lights = Object.fromEntries(
    Object.entries(map.layers.lights).map(([key, placed]) => [key, { ...placed, light: { ...placed.light } }]),
  );
  return layers;
}

/**
 * The snapshot with nothing that would draw tile art over the painting: sprites (swaying props) and door leaves go.
 * Water groups, lights, walls, doors, rock and darkness stay, so the waves, flicker and sight keep working.
 */
export function snapshotOverPainting(live: MapLive): MapLive {
  return { ...live, sprites: [], doors: live.doors.map((door) => ({ ...door, leaf: null })) };
}

export interface StyledPlay {
  /** The walls drawing to create and link: plain name, same pack, darkness and campaign as the source. */
  drawing: Pick<DungeonMapInsert, "name" | "layers" | "darkness" | "default_pack_id" | "campaign_id">;
  mapLive: MapLive;
}

export function buildStyledPlay(
  siteName: string,
  map: MapLiveSource & Pick<DungeonMap, "default_pack_id" | "campaign_id">,
  runtimes: Map<string, TilePackRuntime>,
  dressing: DressingCatalog,
  calibration: GridCalibration,
): StyledPlay {
  const origin = resolveOriginCell(calibration);
  return {
    drawing: {
      name: `${siteName} walls`,
      layers: wallsOnlyLayers(map),
      darkness: map.darkness,
      default_pack_id: map.default_pack_id,
      campaign_id: map.campaign_id,
    },
    mapLive: snapshotOverPainting(buildMapLive(map, runtimes, dressing, origin.x, origin.y)),
  };
}
