// Cartographer map data — see context/features/cartographer.md

import type { PackCategory } from "@/cartographer/packSchema";

export type CellKey = `${number},${number}`;

export interface PackRef {
  pack_id: string;
  pack_version: number;
  variant: number;
  rotation?: number;
}

export type EdgeSegType = "wall" | "doorClosed" | "doorOpen";

export interface EdgeSeg extends PackRef {
  type: EdgeSegType;
}

export interface FloorCell {
  floor?: PackRef;
  wallN?: EdgeSeg;
  wallW?: EdgeSeg;
}

export type SolidCell = PackRef;

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

/** A cell painted by the Cartographer's Zone tool (#868). Cells sharing a
 *  `zone_id` are one zone; kind and label are repeated per cell so the layer
 *  keeps the per-cell shape every other layer has, and the publish groups
 *  them. Stored inside `layers` (jsonb) — no column. */
export interface ZoneCell {
  zone_id: string;
  kind: "terrain" | "hazard" | "light" | "trigger" | "marker";
  label: string | null;
}

export interface DungeonMapLayers {
  floor: Record<CellKey, FloorCell>;
  solidBlock: Record<CellKey, SolidCell>;
  object: Record<CellKey, ObjectCell>;
  annotation: Record<CellKey, AnnotationCell>;
  /** Absent on maps saved before #868; `emptyLayers()` and every reader treat
   *  a missing key as `{}`. */
  zone?: Record<CellKey, ZoneCell>;
}

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
  return { floor: {}, solidBlock: {}, object: {}, annotation: {}, zone: {} };
}

export function cellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

export function parseCellKey(key: CellKey): [number, number] {
  const [x, y] = key.split(",");
  return [Number(x), Number(y)];
}
