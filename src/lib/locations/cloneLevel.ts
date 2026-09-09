// ── Cloning a level (#868, frame 06) ─────────────────────────────────────────
//
// "Clone this level — Floor plan, rooms and ways out — never state or loot."
// Pure planning only: this module decides WHAT a clone contains, never talks
// to Supabase. `useCloneSiteLevel` walks the plan and issues the creates
// through the app's own composables, in the order a clone actually needs
// (site, then rooms, then regions/doors that reference the rooms' new ids).
//
// Deliberately excluded, per the frame's own caption: `location_state` (durable
// Explored/Cleared/Looted facts and door facts), `loot_placements`,
// `location_placements` (traps/features/tables), and `map_published_rev` — a
// clone is DM ink starting fresh, not a second copy of *play* that has
// happened. `source_edge_key` and `dungeon_feature_id` on a cloned door are
// dropped for the same reason a room's own map/pins/sharing flags are: they
// are either provenance of the ORIGINAL publish/feature, or player-facing
// state that must not silently carry over to an unpublished copy.

import type { Location, LocationInsert } from "@/types/location.types";
import type { LocationDoor, LocationDoorInsert } from "@/types/locationDoor.types";
import type { LocationMapRegion, LocationMapRegionInsert } from "@/types/locationMapRegion.types";

/** A room's insert, minus `parent_id` — the executor only learns the new
 *  site's id once it exists. */
export type ClonedRoomInsert = Omit<LocationInsert, "parent_id">;

/** A region's insert, minus the two FKs the executor resolves after creating
 *  the new site and rooms. */
export type ClonedRegionInsert = Omit<LocationMapRegionInsert, "site_location_id" | "space_location_id">;

/** A door's insert, minus its two endpoint FKs, resolved the same way. */
export type ClonedDoorInsert = Omit<LocationDoorInsert, "from_location_id" | "to_location_id">;

export interface RoomPlan {
  /** The original room's id — how region/door plans below name their endpoint. */
  sourceId: string;
  insert: ClonedRoomInsert;
}

export interface RegionPlan {
  /** The original room this region was bound to, or null when it never was.
   *  Resolved against the new room ids `RoomPlan.sourceId` produces. */
  spaceSourceId: string | null;
  insert: ClonedRegionInsert;
}

export interface DoorPlan {
  fromSourceId: string;
  toSourceId: string;
  insert: ClonedDoorInsert;
}

export interface CloneLevelPlan {
  /** The new sibling site itself — `parent_id` is already known (the source
   *  site's own parent), so this needs no resolution step. */
  siteInsert: LocationInsert;
  rooms: RoomPlan[];
  regions: RegionPlan[];
  doors: DoorPlan[];
}

export interface CloneLevelSource {
  site: Location;
  /** This site's direct ROOM children only — a nested site among them is
   *  another level, not part of this one, and is never pulled in by a clone. */
  rooms: readonly Location[];
  /** This site's own regions (any `site_location_id` not matching `site.id`
   *  is ignored defensively, though callers should already have scoped this). */
  regions: readonly LocationMapRegion[];
  doors: readonly LocationDoor[];
}

function blankLocationFields(): Omit<
  LocationInsert,
  "campaign_id" | "parent_id" | "name" | "location_type" | "map_url" | "source_map_id" | "grid_calibration" | "description"
> {
  return {
    notes: null,
    tags: [],
    image_url: null,
    map_pins: [],
    is_map_shared: false,
    player_visible_to: [],
    player_summary: null,
    is_description_shared: false,
    is_npcs_shared: false,
    is_inventory_shared: false,
    npc_owner_id: null,
    related_location_ids: [],
    is_battle_map: false,
    era_start: null,
    era_end: null,
    audio_theme: null,
  };
}

/**
 * Builds the clone plan. Pure and synchronous — every id relationship is
 * expressed by source id, never by a guessed future id, so the executor is
 * the only place a real database round-trip happens.
 */
export function planCloneLevel(source: CloneLevelSource): CloneLevelPlan {
  const { site, rooms, regions, doors } = source;
  const roomIds = new Set(rooms.map((r) => r.id));

  const siteInsert: LocationInsert = {
    ...blankLocationFields(),
    campaign_id: site.campaign_id,
    parent_id: site.parent_id,
    name: `${site.name} (copy)`,
    location_type: site.location_type,
    description: null,
    map_url: site.map_url,
    source_map_id: site.source_map_id,
    grid_calibration: site.grid_calibration,
  };

  const roomPlans: RoomPlan[] = rooms.map((room) => ({
    sourceId: room.id,
    insert: {
      ...blankLocationFields(),
      campaign_id: room.campaign_id,
      name: room.name,
      location_type: room.location_type,
      description: room.description,
      map_url: null,
      source_map_id: null,
      grid_calibration: null,
    },
  }));

  const regionPlans: RegionPlan[] = regions
    .filter((r) => r.site_location_id === site.id)
    .map((r) => ({
      spaceSourceId: r.space_location_id && roomIds.has(r.space_location_id) ? r.space_location_id : null,
      insert: {
        cells: r.cells,
        label: r.label,
        sort_order: r.sort_order,
        region_role: r.region_role,
        zone_kind: r.zone_kind,
        zone_payload: r.zone_payload,
        derived_from: r.derived_from,
        // The new region is its own drawing, not the old one republished —
        // carrying the signature forward would make a future re-publish of
        // the ORIGINAL map think it already reconciled against this copy.
        cell_signature: null,
        vertices: r.vertices,
      },
    }));

  const doorPlans: DoorPlan[] = doors
    .filter((d) => roomIds.has(d.from_location_id) && roomIds.has(d.to_location_id))
    .map((d) => ({
      fromSourceId: d.from_location_id,
      toSourceId: d.to_location_id,
      insert: {
        label: d.label,
        is_one_way: d.is_one_way,
        starts_locked: d.starts_locked,
        lock_note: d.lock_note,
        is_secret: d.is_secret,
        sort_order: d.sort_order,
        door_kind: d.door_kind,
        source_edge_key: null,
        dungeon_feature_id: null,
      },
    }));

  return { siteInsert, rooms: roomPlans, regions: regionPlans, doors: doorPlans };
}
