// The database half of what play reveals (#1021). The rule is `_shared/agent/reveals.ts`; this reads who a place and
// a few people are already shown to, and writes the lists the rule answers with.
//
// Through the CALLER's client: the rows are the DM's own, their RLS decides the write, and the campaign's reveal
// triggers (`locations_record_reveals`, `npcs_record_reveals`) then log the reveal as they do when a DM shares
// something by hand. Every read and write names the campaign, so an id from another campaign matches nothing.
//
// Thin on purpose: no test harness here, the rule is tested where it lives.

import type { SupabaseClient } from "@supabase/supabase-js";
import { planPlaceShare, planReveals, type PlaceShown, type Shown } from "../_shared/agent/reveals.ts";

const list = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);

export async function revealToCharacter(
  client: SupabaseClient,
  input: { campaignId: string; memberId: string; locationId: string | null; characterIds: readonly string[] },
): Promise<void> {
  const { campaignId, memberId } = input;

  let place: PlaceShown | null = null;
  if (input.locationId !== null) {
    const found = await client
      .from("locations")
      .select("id, player_visible_to, is_description_shared")
      .eq("id", input.locationId)
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (found.error) throw found.error;
    if (found.data) {
      place = { id: found.data.id as string, visibleTo: list(found.data.player_visible_to), descriptionShared: found.data.is_description_shared === true };
    }
  }

  let characters: Shown[] = [];
  if (input.characterIds.length > 0) {
    const found = await client.from("npcs").select("id, player_visible_to").eq("campaign_id", campaignId).in("id", [...input.characterIds]);
    if (found.error) throw found.error;
    characters = (found.data ?? []).map((row) => ({ id: row.id as string, visibleTo: list(row.player_visible_to) }));
  }

  const plan = planReveals({ memberId, place, characters });
  if (plan.place !== null) {
    const { error } = await client
      .from("locations")
      .update({ player_visible_to: plan.place.visibleTo, is_description_shared: plan.place.shareDescription })
      .eq("id", plan.place.id)
      .eq("campaign_id", campaignId);
    if (error) throw error;
  }
  for (const character of plan.characters) {
    const { error } = await client.from("npcs").update({ player_visible_to: character.visibleTo }).eq("id", character.id).eq("campaign_id", campaignId);
    if (error) throw error;
  }
}

/** Hands a place to the played character for real (the `show` tool), with its map only when the story handed it over. */
export async function sharePlace(client: SupabaseClient, input: { campaignId: string; memberId: string; placeId: string; withMap: boolean }): Promise<void> {
  const found = await client
    .from("locations")
    .select("id, player_visible_to, is_description_shared, is_map_shared")
    .eq("id", input.placeId)
    .eq("campaign_id", input.campaignId)
    .maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) throw new Error("the place is no longer in this campaign");
  const plan = planPlaceShare({
    memberId: input.memberId,
    place: { id: input.placeId, visibleTo: list(found.data.player_visible_to), descriptionShared: found.data.is_description_shared === true, mapShared: found.data.is_map_shared === true },
    withMap: input.withMap,
  });
  if (plan === null) return;
  const { error } = await client.from("locations").update(plan.patch).eq("id", plan.id).eq("campaign_id", input.campaignId);
  if (error) throw error;
}
