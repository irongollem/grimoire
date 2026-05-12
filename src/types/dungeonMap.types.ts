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

export interface DungeonMapLayers {
  floor: Record<CellKey, FloorCell>;
  solidBlock: Record<CellKey, SolidCell>;
  object: Record<CellKey, ObjectCell>;
  annotation: Record<CellKey, AnnotationCell>;
}

export interface DungeonMap {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  layers: DungeonMapLayers;
  metadata: Record<CellKey, CellMetadata>;
  default_pack_id: string | null;
  tags: string[];
  notes: unknown; // Tiptap JSON
  created_at: string;
  updated_at: string;
}

export type DungeonMapInsert = Omit<DungeonMap, "id" | "user_id" | "created_at" | "updated_at">;
export type DungeonMapUpdate = Partial<DungeonMapInsert>;

export function emptyLayers(): DungeonMapLayers {
  return { floor: {}, solidBlock: {}, object: {}, annotation: {} };
}

export function cellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

export function parseCellKey(key: CellKey): [number, number] {
  const [x, y] = key.split(",");
  return [Number(x), Number(y)];
}
