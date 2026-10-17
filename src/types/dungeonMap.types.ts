// Cartographer map data — see context/features/cartographer.md

import type { PackCategory } from "@/cartographer/packSchema";

export type CellKey = `${number},${number}`;

export interface PackRef {
  pack_id: string;
  pack_version: number;
  variant: number;
  rotation?: number;
}

// `doorClosed` / `doorOpen` are the drawn state of a door edge and feed publish
// (`structure.ts DOOR_EDGE_KIND`); since schema 4 (#1065) they draw a doorway
// plus a leaf turned on its hinge. `grate` and `sluice` are wall-band fittings
// that cut the space flood fill like a wall and are never a way.
export type EdgeSegType = "wall" | "doorClosed" | "doorOpen" | "grate" | "sluice";

export interface EdgeSeg extends PackRef {
  type: EdgeSegType;
  /** A `wallDecal` variant set into this wall. Meaningful on `type: "wall"` only. */
  decal?: number;
}

export interface FloorCell {
  floor?: PackRef;
  wallN?: EdgeSeg;
  wallW?: EdgeSeg;
}

export type SolidCell = PackRef;

/** A per-cell ground material (the pack's `terrainWater`), drawn instead of the floor in its cell. */
export type TerrainCell = PackRef;

export interface ObjectCell extends PackRef {
  category: PackCategory;
  side?: string;
}

export interface AnnotationCell {
  text?: string;
  icon?: string;
  color?: string;
}

export interface CellMetadata {
  trap_id?: string;
  feature_id?: string;
  encounter_id?: string;
  note_id?: string;
  npc_spawn_ids?: string[];
  monster_spawn_ids?: string[];
}

/**
 * One prop from the Dressing library placed on a map (epic #1062). Props sit
 * on their own layer, not in the cell grids: they cover several cells, turn
 * to any angle, and overlap each other.
 */
export interface DressingPlacement {
  prop_id: string;
  /** Anchor cell: the top-left of the footprint as turned to the nearest
   *  quarter, so a quarter-turned 2x1 table stands 1x2 from here on whole cells. */
  x: number;
  y: number;
  /** Degrees 0-359, clockwise, about that footprint's centre (dressingCentre). */
  rotation: number;
  /** Stacking order, higher draws on top. Stored because jsonb does not
   *  preserve object key order, so insertion order could not say which prop
   *  is on top after a reload. */
  z: number;
}

/**
 * One cell of a brushed area (epic #1073, story 8): a fine coverage mask, 8 x 8
 * sub-cells per cell, so a round brush can cover part of a cell and erasing is
 * just clearing bits. `mask` is `"full"` when all 64 sub-cells are covered, else
 * 16 lowercase hex chars holding a 64-bit number whose bit `i` is sub-cell
 * `(i % 8, Math.floor(i / 8))`, sub-cell (0,0) being the cell's top-left. An
 * empty mask is never stored (the entry is removed). The PackRef is the cell's
 * floor pack; a cell covered at least half also carries ordinary `floor`.
 */
export interface AreaCell extends PackRef {
  mask: string;
}

export interface DungeonMapLayers {
  floor: Record<CellKey, FloorCell>;
  solidBlock: Record<CellKey, SolidCell>;
  /** A per-cell ground material, drawn instead of the floor in its cell. */
  terrain: Record<CellKey, TerrainCell>;
  object: Record<CellKey, ObjectCell>;
  annotation: Record<CellKey, AnnotationCell>;
  /** Keyed by a placement uuid. */
  dressing: Record<string, DressingPlacement>;
  /** Brushed areas, a coverage mask per cell (see `AreaCell`). */
  area: Record<CellKey, AreaCell>;
}

/**
 * How lit the whole map is (epic #1073), the rules' three: daylight is bright light everywhere, dim is dim light
 * everywhere (twilight), dark is darkness wherever no light reaches. One level per map.
 */
export type DarknessLevel = "daylight" | "dim" | "dark";

export interface DungeonMap {
  id: string;
  user_id: string;
  /** NULL = available in every campaign; set = only visible when that campaign
   *  is active. The DM picks, per map (#789) — existing rows stay null. */
  campaign_id: string | null;
  name: string;
  description: string | null;
  layers: DungeonMapLayers;
  metadata: Record<CellKey, CellMetadata>;
  default_pack_id: string | null;
  /** The map's ambient light. Counts toward `rev`, so changing it makes a published site stale. */
  darkness: DarknessLevel;
  tags: string[];
  notes: unknown; // Tiptap JSON
  /** Bumped by a DB trigger whenever `layers` or `metadata` change (#868).
   *  `locations.map_published_rev` records which rev a site last received. */
  rev: number;
  created_at: string;
  updated_at: string;
}

export type DungeonMapInsert = Omit<DungeonMap, "id" | "user_id" | "created_at" | "updated_at" | "rev">;
export type DungeonMapUpdate = Partial<DungeonMapInsert>;

export function emptyLayers(): DungeonMapLayers {
  return { floor: {}, solidBlock: {}, terrain: {}, object: {}, annotation: {}, dressing: {}, area: {} };
}

/**
 * A map saved before a layer existed reads that layer as empty; the DB
 * default carries every key for new rows, but older rows lack the newer ones.
 */
export function withLayerDefaults(raw: Partial<DungeonMapLayers> | null | undefined): DungeonMapLayers {
  return { ...emptyLayers(), ...raw };
}

export function cellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

export function parseCellKey(key: CellKey): [number, number] {
  const [x, y] = key.split(",");
  return [Number(x), Number(y)];
}
