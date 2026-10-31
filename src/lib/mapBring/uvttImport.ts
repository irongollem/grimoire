/**
 * A Universal VTT file as the app's own data (#1125 decision 7): the picture's grid, and the walls, doors and
 * lights as a Drawing over that picture. The Drawing's cells are the picture's cells (calibration origin 0,0), so
 * a point in the file's grid units is a point in the Drawing as it stands. The same facts are also written as the
 * live snapshot, so the battle map has sight and light the moment the map is added, without a bake.
 */
import { FEET_PER_CELL, MAX_LIGHT_FEET, type TileLight } from "@/cartographer/packSchema";
import { emptyLayers, type DarknessLevel, type DungeonMapLayers, type PackRef, type WallEdge } from "@/types/dungeonMap.types";
import { MAP_LIVE_VERSION, type MapLive } from "@/types/mapLive.types";
import type { GridCalibration } from "@/types/location.types";
import type { UniversalVttMap, UvttLight } from "@/lib/mapImport/universalVtt";

/** Walls of the file are real to sight and light but the picture already shows them, so they are not drawn. */
const INVISIBLE = false;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * A file's light: `rangeCells` is how far it reaches in all. In the app a light has a bright radius and a further
 * dim ring in feet, so half the reach is bright and half dim (app convention: dim light is the second half of a
 * light's reach), and 5 ft to the cell.
 */
export function lightFromUvtt(l: UvttLight): TileLight {
  const reachFeet = clamp(l.rangeCells * FEET_PER_CELL, 0, MAX_LIGHT_FEET * 2);
  const half = reachFeet / 2;
  return {
    color: l.color,
    bright: clamp(half, 0, MAX_LIGHT_FEET),
    dim: clamp(half, 0, MAX_LIGHT_FEET),
    // Some tools export 2 or 3 for "brighter"; the app's glow alpha stops at 1.
    intensity: clamp(l.intensity, 0.05, 1),
  };
}

/** Bright ambient light in the file means a day map; a dimmer one a twilight map. */
export function darknessFromAmbient(ambient: string | undefined): DarknessLevel {
  if (!ambient) return "daylight";
  const r = parseInt(ambient.slice(1, 3), 16);
  const g = parseInt(ambient.slice(3, 5), 16);
  const b = parseInt(ambient.slice(5, 7), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance >= 128 ? "daylight" : "dim";
}

export interface UvttDrawing {
  calibration: GridCalibration;
  layers: DungeonMapLayers;
  darkness: DarknessLevel;
  mapLive: MapLive;
}

/**
 * @param natural  the picture's size in pixels (the file carries the image, not its decoded size).
 * @param pack     a tile set to name on the Drawing's walls; a `WallEdge` is a pack tile, and these draw nothing.
 */
export function uvttToDrawing(map: UniversalVttMap, natural: { width: number; height: number }, pack: PackRef): UvttDrawing {
  const layers = emptyLayers();
  const live: MapLive = {
    version: MAP_LIVE_VERSION,
    darkness: darknessFromAmbient(map.ambient),
    groups: [],
    lights: [],
    sprites: [],
    walls: [],
    doors: [],
    solid: [],
  };

  const edge = (type: WallEdge["type"], a: [number, number], b: [number, number]): WallEdge => ({
    ...pack,
    type,
    a,
    b,
    visible: INVISIBLE,
  });

  for (const w of map.walls) {
    const id = crypto.randomUUID();
    layers.walls[id] = edge("wall", w.a, w.b);
    live.walls.push({ id, a: w.a, b: w.b });
  }
  for (const d of map.doors) {
    const id = crypto.randomUUID();
    layers.walls[id] = edge(d.open ? "doorOpen" : "doorClosed", d.a, d.b);
    live.doors.push({ id, a: d.a, b: d.b, open: d.open, leaf: null });
  }
  for (const l of map.lights) {
    const light = lightFromUvtt(l);
    layers.lights[crypto.randomUUID()] = { x: l.x, y: l.y, light };
    live.lights.push({ x: l.x, y: l.y, color: light.color, bright: light.bright, dim: light.dim, intensity: light.intensity, phase: 0 });
  }

  return {
    calibration: {
      cells_per_image_width: natural.width / map.pixelsPerGrid,
      origin_x_pct: 0,
      origin_y_pct: 0,
      origin_cell_x: 0,
      origin_cell_y: 0,
    },
    layers,
    darkness: live.darkness,
    mapLive: live,
  };
}
