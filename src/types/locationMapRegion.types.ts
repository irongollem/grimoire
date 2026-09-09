// ── Clickable spaces on a site's map (#784, epic #780; widened by #818) ────
//
// A region is a set of grid cells bound to a direct child of a site-tier
// location that is itself an addressable space — a `room`, or a nested site
// with its own floor plan (`grounds`, `building`, `dungeon`, `store`,
// `tavern`, `inn`). Binding is a real FK (`space_location_id`); the geometry
// it covers is shaped data and lives in jsonb — the same split
// `location_placements` makes, and deliberately not the shape
// `quest_beat_attachments.metadata.room_ids` used to be: an unenforceable id
// list inside a blob. #797 finished removing that shape everywhere else,
// deleting the `location_set` attachment in favour of a real FK column,
// `quest_beats.staged_at_location_id` — the same real-FK-over-id-list
// preference this region binding already followed.
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

// ── A region has a role (#868) ───────────────────────────────────────────────
//
// A `space` is the region above: geometry bound to a room or nested site. A
// `zone` is the same geometry with a role — water, darkness, a hazard, a
// trigger, a marker — and binds to nothing by rule; that is its definition,
// and it is what makes "unbound" unambiguous again: an unbound space is
// unfinished, an unbound zone is finished. A zone still needs
// `site_location_id`: it belongs to the plan, not to a room — an ash-fall that
// straddles the nave and the corridor is one zone, not two.
//
// Provenance (`derived_from`, `cell_signature`) is what lets a Publish from
// the Cartographer be run twice safely: a region the DM has touched reads
// `"dm"` and is never overwritten, only offered. `vertices` is the pen tool's
// ring; when it is set, `cells` is derived and cached, so everything
// downstream keeps asking "which cells?" and always gets an answer.

export const REGION_ROLES = ["space", "zone"] as const;
export type RegionRole = (typeof REGION_ROLES)[number];

/** A short, closed list for the same reason `hazard_glyph` is one: the
 *  renderer must be able to draw any value, whatever pack is loaded. */
export const ZONE_KINDS = ["terrain", "hazard", "light", "trigger", "marker"] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

export const ZONE_KIND_LABELS: Record<ZoneKind, string> = {
  terrain: "Terrain",
  hazard: "Hazard",
  light: "Light",
  trigger: "Trigger",
  marker: "Marker",
};

export const REGION_PROVENANCES = ["dm", "floodfill", "annotation"] as const;
export type RegionProvenance = (typeof REGION_PROVENANCES)[number];

/** Zone hints. Read by the renderer and the run surface; never enforced —
 *  a difficult-terrain zone *reads* as difficult terrain, it halves nobody's
 *  speed. Ids here are hints too (a trap's glyph to draw, a beat to prompt
 *  for), which is why they live in jsonb rather than as FK columns. */
export interface ZonePayload {
  /** Movement cost multiplier for terrain: 2 = difficult terrain. */
  movement_cost?: number;
  /** Water/rubble depth, for the read-aloud. */
  depth_ft?: number;
  /** For `light` zones. */
  light_level?: "bright" | "dim" | "dark" | "magical_darkness";
  /** For `hazard` zones: the trap whose `hazard_glyph` draws inside the zone. */
  trap_id?: string;
  /** For `trigger` zones: what entering prompts. Never fires on its own. */
  encounter_id?: string;
  beat_id?: string;
  /** Zones are DM ink by default. */
  visible_to_players?: boolean;
}

/** A grid point of a pen-traced ring, in the map's own cell space. Halves
 *  are allowed — a 45° wall needs them. */
export type GridPoint = [x: number, y: number];

export interface LocationMapRegion {
  id: string;
  user_id: string;
  site_location_id: string;
  /** Null = traced but not yet bound to a space (for a `space`), or — always —
   *  for a `zone`, which binds nothing by rule. */
  space_location_id: string | null;
  /** Cell keys from the Cartographer's own coordinate space (`cellKey` in
   *  `types/dungeonMap.types.ts`). Derived from `vertices` when that is set. */
  cells: CellKey[];
  /** Only meaningful while unbound — a bound region takes its name from its
   *  space. A zone's name, always. */
  label: string | null;
  sort_order: number | null;
  region_role: RegionRole;
  /** Non-null exactly when `region_role === "zone"` (DB biconditional). */
  zone_kind: ZoneKind | null;
  zone_payload: ZonePayload;
  derived_from: RegionProvenance;
  /** Stable hash of the derived cell set, written by the publish. Null for
   *  every hand-traced region, forever. */
  cell_signature: string | null;
  vertices: GridPoint[] | null;
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
  /** Omit for a space. A zone must also carry `zone_kind`. */
  region_role?: RegionRole;
  zone_kind?: ZoneKind | null;
  zone_payload?: ZonePayload;
  derived_from?: RegionProvenance;
  cell_signature?: string | null;
  vertices?: GridPoint[] | null;
}

export type LocationMapRegionUpdate = Partial<
  Pick<
    LocationMapRegionInsert,
    | "space_location_id"
    | "cells"
    | "label"
    | "sort_order"
    | "region_role"
    | "zone_kind"
    | "zone_payload"
    | "derived_from"
    | "cell_signature"
    | "vertices"
  >
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
