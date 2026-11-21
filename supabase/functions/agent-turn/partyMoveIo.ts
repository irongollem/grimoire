// The party's arrival in a place, written the way the DM's own exploring screen writes it (#1021 row 9). The
// Narrator's `go_to` only moves the conversation's scene (`setScene`); a table with no DM browser open has nobody else
// to do the rest, so a kept turn does it here.
//
// Every write goes through the CALLER's client, never the service role. The DM's JWT is what makes
// `campaigns_arrival_marks_explored` fire (it does nothing with no `auth.uid()` or outside the `authenticated`
// role), and RLS and `remember_map_cells` decide who may change the party and the map's memory, exactly as for the
// screen. The AI table's player is the campaign's owner, which `campaigns_update` lets through.
//
// The prepared encounter at the new place needs no write: the Narrator already sees it (`viewAt`, in `turnTools`).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GridCalibration } from "../../../src/types/location.types.ts";
import type { ExploreParty } from "../../../src/types/exploreParty.types.ts";
import type { LocationMapRegion } from "../../../src/types/locationMapRegion.types.ts";
import { buildMapStack, type MapStackSource } from "../../../src/lib/locations/mapStack.ts";
import { partyArrival, type RoomRegion } from "../../../src/lib/locations/exploreSeating.ts";
import { MAX_ANCESTOR_STEPS, siteOf, type PlaceForMap } from "../../../src/lib/table/solo/placeMap.ts";

const MAP_COLUMNS = "id, parent_id, map_url, grid_calibration, map_layer_url, map_layer_stand_url, map_layer_calibration, plan_size";
const REGION_COLUMNS = "region_role, space_location_id, cells";

/** Moves the party's place: the campaign's own row, so the arrival trigger records the room explored. */
export async function setPartyPlace(client: SupabaseClient, campaignId: string, placeId: string): Promise<void> {
  const { error } = await client.from("campaigns").update({ current_location_id: placeId }).eq("id", campaignId);
  if (error) throw error;
}

/** The map the place is on, with its calibration and the regions traced on it; null when the place has no calibrated map. */
async function mapOf(
  client: SupabaseClient,
  campaignId: string,
  placeId: string,
): Promise<{ siteId: string; calibration: GridCalibration; regions: RoomRegion[] } | null> {
  // The place, then its parents, until one has a map: the same walk the page's `siteOf` makes, read as it goes.
  const byId = new Map<string, PlaceForMap>();
  let id: string | null = placeId;
  for (let step = 0; step <= MAX_ANCESTOR_STEPS && id !== null && !byId.has(id); step++) {
    const { data, error } = await client.from("locations").select(MAP_COLUMNS).eq("id", id).eq("campaign_id", campaignId).maybeSingle();
    if (error) throw error;
    if (data === null) break;
    const place = data as unknown as PlaceForMap;
    byId.set(place.id, place);
    if (buildMapStack(place).hasAnyLayer) break;
    id = place.parent_id;
  }
  const siteId = siteOf(placeId, byId);
  if (siteId === null) return null;
  const site = byId.get(siteId);
  // The calibration the battle surface of a place with its own map reads: the Drawing's, else the Picture's.
  const calibration = buildMapStack(site as MapStackSource).primary?.calibration ?? null;
  if (calibration === null) return null;
  const { data, error } = await client.from("location_map_regions").select(REGION_COLUMNS).eq("site_location_id", siteId);
  if (error) throw error;
  return { siteId, calibration, regions: data as unknown as Pick<LocationMapRegion, "region_role" | "space_location_id" | "cells">[] };
}

/**
 * Reveals the room's traced squares on the map it is on, through `remember_map_cells` (no hide, no forget). A place
 * with no traced room, or none with a map above it, reveals nothing; see `partyArrival` for why a room is revealed whole.
 */
export async function revealRoom(client: SupabaseClient, campaignId: string, placeId: string): Promise<void> {
  const map = await mapOf(client, campaignId, placeId);
  if (map === null) return;
  const { reveal } = partyArrival({ regions: map.regions, calibration: map.calibration, roomId: placeId, siteId: map.siteId, memberIds: [], explore: null });
  if (reveal.length === 0) return;
  const { error } = await client.rpc("remember_map_cells", { p_campaign_id: campaignId, p_location_id: map.siteId, p_reveal: reveal, p_hide: [], p_forget: false });
  if (error) throw error;
}

/**
 * Stands the party in the room on the map's grid: `campaigns.explore_party`, keyed by party member id like the
 * exploring screen keys it. No map above the place leaves it as it is.
 */
export async function seatParty(client: SupabaseClient, campaignId: string, placeId: string, memberIds: readonly string[]): Promise<void> {
  const map = await mapOf(client, campaignId, placeId);
  if (map === null) return;
  const stored = await client.from("campaigns").select("explore_party").eq("id", campaignId).maybeSingle();
  if (stored.error) throw stored.error;
  if (stored.data === null) return;
  const { party } = partyArrival({
    regions: map.regions,
    calibration: map.calibration,
    roomId: placeId,
    siteId: map.siteId,
    memberIds,
    explore: stored.data.explore_party as ExploreParty | null,
  });
  if (party === null) return;
  const { error } = await client.from("campaigns").update({ explore_party: party }).eq("id", campaignId);
  if (error) throw error;
}
