/**
 * Small builders the scripted Cartographer maps share (`dev-showcase-map.ts`, `demo-inn-map.ts`). Pure: they only
 * shape `DungeonMapLayers`, the way the editor stores them.
 */

import { cellBoundary, putGroundRegion } from "@/cartographer/groundRegions";
import { latticeWall } from "@/cartographer/wallGraph";
import type { CanonicalSide } from "@/cartographer/edges";
import type { ObjectCategory } from "@/cartographer/packSchema";
import type { EdgeSegType } from "@/types/dungeonMap.types";
import {
  cellKey,
  type CellKey,
  type DungeonMapLayers,
  type GroundRegion,
  type PackRef,
} from "@/types/dungeonMap.types";

export interface TileSet {
  pack_id: string;
  pack_version: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A uuid factory: keys things the layers key by uuid. Fixed, so a re-run writes the same map. */
export function uuidFactory(prefix: string): (kind: number, n: number) => string {
  return (kind, n) => {
    const pad = (v: number, len: number) => v.toString(16).padStart(len, "0");
    return `${prefix}${pad(kind, 4)}-0000-4000-8000-${pad(n, 12)}`;
  };
}

/** Ground the way the editor stores it: one material region per surface, its tile variants kept per square.
 *  Fixed ids keep a re-run writing the same map; `putGroundRegion` projects the region onto floor/terrain. */
export function groundRegion(
  layers: DungeonMapLayers,
  id: string,
  name: string,
  cells: ReadonlySet<CellKey>,
  material: PackRef,
  category: GroundRegion["category"],
  variantOf: (x: number, y: number) => number,
): DungeonMapLayers {
  const variants: GroundRegion["variants"] = {};
  for (const k of cells) {
    const [x, y] = k.split(",").map(Number);
    variants[k] = variantOf(x, y);
  }
  const z = Math.max(-1, ...Object.values(layers.ground).map((r) => r.z)) + 1;
  return putGroundRegion(layers, id, {
    name,
    material,
    category,
    z,
    boundary: cellBoundary(cells, material),
    variants,
    walls: { mode: "none", material, ids: [], segments: {}, excluded: [] },
  });
}

export function rectCells(r: Rect, skip: ReadonlySet<string> = new Set()): Set<CellKey> {
  const cells = new Set<CellKey>();
  for (let y = r.y0; y <= r.y1; y++)
    for (let x = r.x0; x <= r.x1; x++)
      if (!skip.has(`${x},${y}`)) cells.add(cellKey(x, y));
  return cells;
}

export function setWall(
  layers: DungeonMapLayers,
  tiles: TileSet,
  x: number,
  y: number,
  side: CanonicalSide,
  type: EdgeSegType,
  extra: { decal?: number; visible?: boolean } = {},
): void {
  const key = `${x},${y}:${side}`;
  layers.walls[key] = latticeWall(
    x,
    y,
    side,
    {
      ...tiles,
      type,
      variant: 0,
      ...(extra.decal !== undefined ? { decal: extra.decal } : {}),
    },
    extra.visible,
  );
}

/** Walls round a rectangle of rooms. Existing doors are left alone so order of calls does not matter. */
export function perimeter(
  layers: DungeonMapLayers,
  tiles: TileSet,
  r: Rect,
  skip: (key: string) => boolean = () => false,
): void {
  const put = (x: number, y: number, side: CanonicalSide) => {
    const key = `${x},${y}:${side}`;
    if (skip(key) || layers.walls[key]) return;
    setWall(layers, tiles, x, y, side, "wall");
  };
  for (let x = r.x0; x <= r.x1; x++) {
    put(x, r.y0, "N");
    put(x, r.y1 + 1, "N");
  }
  for (let y = r.y0; y <= r.y1; y++) {
    put(r.x0, y, "W");
    put(r.x1 + 1, y, "W");
  }
}

export function object(
  layers: DungeonMapLayers,
  x: number,
  y: number,
  category: ObjectCategory | "rubble",
  variant: number,
  pack: TileSet,
): void {
  layers.object[cellKey(x, y)] = { ...pack, category, variant };
}
