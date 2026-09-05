// ── Clickable spaces on a site's map (#784, epic #780; widened by #818) ────
//
// A region is a set of grid cells bound to a direct child of a site-tier
// location that is itself an addressable space — a `room`, or a nested site
// with its own floor plan (`grounds`, `building`, `dungeon`, `store`,
// `tavern`, `inn`). Binding is a real FK (`space_location_id`); the geometry
// it covers is shaped data and lives in jsonb — the same split
// `location_placements` makes, and deliberately not the shape of
// `quest_beat_attachments.metadata.room_ids`, an unenforceable id list
// inside a blob that this epic is removing everywhere else.
//
// `site_location_id` is required even on an unbound region: a DM traces
// shapes off a scanned page first and names them second, so a region can
// exist before anything points at it. `space_location_id` null means exactly
// that — "traced but not yet named" — not "broken".
//
// The DB trigger (`guard_location_map_region_space`, migration
// `20260904142401`, widened by `20260904211008`) is the actual authority on
// which space a region may bind to: the space must belong to this site, and
// must genuinely be a room or something `private.location_can_hold_rooms`
// admits. This file does not re-derive that rule; a rejection surfaces to
// the DM as a toast instead, same as `LocationDoor`'s endpoint guard.

import type { CellKey } from "@/types/dungeonMap.types";

export interface LocationMapRegion {
  id: string;
  user_id: string;
  site_location_id: string;
  /** Null = traced but not yet bound to a space. The canvas shows it as
   *  "Region N" (or its `label`) until it is named. */
  space_location_id: string | null;
  /** Cell keys from the Cartographer's own coordinate space (`cellKey` in
   *  `types/dungeonMap.types.ts`). */
  cells: CellKey[];
  /** Only meaningful while unbound — a bound region takes its name from its
   *  space. */
  label: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface LocationMapRegionInsert {
  site_location_id: string;
  /** Omit to take the column default of null — create unbound, bind later. */
  space_location_id?: string | null;
  /** Omit to take the column default of `[]` — trace cells in afterward. */
  cells?: CellKey[];
  label?: string | null;
  sort_order?: number | null;
}

export type LocationMapRegionUpdate = Partial<
  Pick<LocationMapRegionInsert, "space_location_id" | "cells" | "label" | "sort_order">
>;

/** A direct child of a site eligible to bind a region — a room, or a nested
 *  site with its own floor plan. `LocationMap.vue` builds this list from its
 *  `rooms` and `children` props (a room plus whichever children satisfy
 *  `isSiteType`, `src/lib/locations/tiers.ts`) and hands it to
 *  `SiteMapRegionList.vue`, which never needs more than an id to bind and a
 *  name to display. */
export interface BindableSpace {
  id: string;
  name: string;
}
