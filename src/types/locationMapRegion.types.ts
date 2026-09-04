// ── Clickable rooms on a site's map (#784, epic #780) ──────────────────────
//
// A region is a set of grid cells bound to a `room` child of a site-tier
// location. Binding is a real FK (`room_location_id`); the geometry it covers
// is shaped data and lives in jsonb — the same split `location_placements`
// makes, and deliberately not the shape of `quest_beat_attachments.metadata
// .room_ids`, an unenforceable id list inside a blob that this epic is
// removing everywhere else.
//
// `site_location_id` is required even on an unbound region: a DM traces
// shapes off a scanned page first and names them second, so a region can
// exist before anything points at it. `room_location_id` null means exactly
// that — "traced but not yet named" — not "broken".
//
// The DB trigger (`guard_location_map_region_room`, migration
// `20260904142401`) is the actual authority on which room a region may bind
// to: the room must belong to this site, and must genuinely be `room`-typed.
// This file does not re-derive that rule; a rejection surfaces to the DM as a
// toast instead, same as `LocationDoor`'s endpoint guard.

import type { CellKey } from "@/types/dungeonMap.types";

export interface LocationMapRegion {
  id: string;
  user_id: string;
  site_location_id: string;
  /** Null = traced but not yet bound to a room. The canvas shows it as
   *  "Region N" (or its `label`) until it is named. */
  room_location_id: string | null;
  /** Cell keys from the Cartographer's own coordinate space (`cellKey` in
   *  `types/dungeonMap.types.ts`). */
  cells: CellKey[];
  /** Only meaningful while unbound — a bound region takes its name from its
   *  room. */
  label: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface LocationMapRegionInsert {
  site_location_id: string;
  /** Omit to take the column default of null — create unbound, bind later. */
  room_location_id?: string | null;
  /** Omit to take the column default of `[]` — trace cells in afterward. */
  cells?: CellKey[];
  label?: string | null;
  sort_order?: number | null;
}

export type LocationMapRegionUpdate = Partial<
  Pick<LocationMapRegionInsert, "room_location_id" | "cells" | "label" | "sort_order">
>;
