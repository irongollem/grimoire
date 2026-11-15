// The server's reads for a fight's battle map (#1202). It gathers the inputs `fightMapOf` assembles
// (`src/rules/fight/terrain/battleMap.ts`), which is the browser's own map resolution, so the server never has a
// second opinion about where the walls are.
//
// Every read is scoped to the campaign in the query itself: the service-role client bypasses RLS, so nothing here
// leans on it. `location_map_regions` has no campaign column; it is read by the id of a location this campaign owns,
// which was verified one step earlier.

import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeFogMask } from "../../../src/lib/battlemap/fogMask.ts";
import { resolveBattleSurface, type PlanRegion, type SurfaceLocation } from "../../../src/lib/battlemap/roomBridge.ts";
import { isInteriorType } from "../../../src/lib/locations/tiers.ts";
import type { FightMapInput } from "../../../src/rules/fight/terrain/battleMap.ts";
import type { MapLiveDoorState } from "../../../src/types/mapLive.types.ts";
import type { Location } from "../../../src/types/location.types.ts";

/** A place as the map resolution reads it, with the parent link the loader follows. */
export type FightMapLocation = SurfaceLocation & Pick<Location, "parent_id">;

const LOCATION_COLUMNS =
  "id, location_type, parent_id, map_url, grid_calibration, map_layer_url, map_layer_stand_url, map_layer_stand_live_url, map_layer_calibration, plan_size, map_live";
const REGION_COLUMNS = "region_role, space_location_id, cells, zone_payload";

/**
 * The place whose regions the fight reads: an interior space (a room) reads its parent site's, anything else its own.
 * The Play screen's `useLocationBattleSurface` does the same (`siteId`). `parent` is the row actually read for this
 * campaign, so a parent id that points outside it reads nothing. Null for a room with no readable parent.
 */
export function regionSiteOf(location: Pick<FightMapLocation, "id" | "location_type">, parent: Pick<FightMapLocation, "id"> | null): string | null {
  return isInteriorType(location.location_type) ? (parent === null ? null : parent.id) : location.id;
}

/**
 * The place whose `map_memory` row holds the doors of this fight: the map's own place, which for a room without a
 * map of its own is its parent site (decision 9 of #1133: one row per map, shared by exploring and every fight on it).
 * Null when the fight has no calibrated map, so there are no doors to read.
 */
export function doorPlaceOf(encounterLocation: FightMapLocation, parent: FightMapLocation | null): string | null {
  return resolveBattleSurface({ encounterLocation, parent, regions: [] })?.mapLocation.id ?? null;
}

/**
 * Reads what `fightMapOf` needs for one encounter, or null when the encounter is anchored to no place of this
 * campaign. Throws on any failed read; an encounter that is not the campaign's is an error, not an empty map.
 */
export async function loadFightMapInput(
  admin: SupabaseClient,
  campaignId: string,
  encounterId: string,
): Promise<FightMapInput | null> {
  const { data: encounter, error: encounterError } = await admin
    .from("encounters")
    .select("location_id")
    .eq("id", encounterId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (encounterError) throw new Error(`encounters: ${encounterError.message}`);
  if (!encounter) throw new Error(`Encounter ${encounterId} is not in campaign ${campaignId}`);
  if (encounter.location_id === null) return null;

  const encounterLocation = await readLocation(admin, campaignId, encounter.location_id as string);
  if (encounterLocation === null) return null;

  const parent =
    isInteriorType(encounterLocation.location_type) && encounterLocation.parent_id !== null
      ? await readLocation(admin, campaignId, encounterLocation.parent_id)
      : null;

  const regions = await readRegions(admin, regionSiteOf(encounterLocation, parent));
  const doorPlace = doorPlaceOf(encounterLocation, parent);
  const memory = doorPlace === null ? { doorStates: [], seen: new Set<string>() } : await readMemory(admin, campaignId, doorPlace);
  return { encounterLocation, parent, regions, doorStates: memory.doorStates, seen: memory.seen };
}

async function readLocation(admin: SupabaseClient, campaignId: string, id: string): Promise<FightMapLocation | null> {
  const { data, error } = await admin
    .from("locations")
    .select(LOCATION_COLUMNS)
    .eq("id", id)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw new Error(`locations: ${error.message}`);
  // The jsonb columns arrive untyped; the table's constraints hold their shape.
  return data === null ? null : (data as unknown as FightMapLocation);
}

async function readRegions(admin: SupabaseClient, siteId: string | null): Promise<PlanRegion[]> {
  if (siteId === null) return [];
  const { data, error } = await admin.from("location_map_regions").select(REGION_COLUMNS).eq("site_location_id", siteId);
  if (error) throw new Error(`location_map_regions: ${error.message}`);
  return data as unknown as PlanRegion[];
}

/** The map's door states and the cells the party has seen, from its one `map_memory` row. */
async function readMemory(
  admin: SupabaseClient,
  campaignId: string,
  placeId: string,
): Promise<{ doorStates: MapLiveDoorState[]; seen: Set<string> }> {
  const { data, error } = await admin
    .from("map_memory")
    .select("door_states, seen")
    .eq("campaign_id", campaignId)
    .eq("location_id", placeId)
    .maybeSingle();
  if (error) throw new Error(`map_memory: ${error.message}`);
  // No row: nobody has opened or shut a door, or seen a square, on this map. The door column's check constraint holds
  // its shape; `seen` is the fog mask's own encoding.
  if (data === null) return { doorStates: [], seen: new Set() };
  return { doorStates: data.door_states as MapLiveDoorState[], seen: decodeFogMask(data.seen as string) };
}
