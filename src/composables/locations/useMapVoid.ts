import { supabase } from "@/lib/supabase";
import { encodeFogMask } from "@/lib/battlemap/fogMask";

/**
 * Keeps what a map's picture shows no ground on with the map's memory (`map_memory.void_cells`), so the server's
 * own moves in a fight respect it: the server cannot read a picture, a browser can (`pictureFloor.ts`). Written by
 * the campaign's DM, who is who sits at the AI table; a player's write is refused by the table's own policy.
 *
 * An upsert on the map's one row: a map nobody has explored yet has no row, and what the party has seen and the
 * doors on an existing row are left as they are.
 */
export async function saveMapVoid(campaignId: string, locationId: string, cells: ReadonlySet<string>): Promise<void> {
  const { error } = await supabase
    .from("map_memory")
    .upsert({ campaign_id: campaignId, location_id: locationId, void_cells: encodeFogMask(new Set(cells)) }, { onConflict: "campaign_id,location_id" });
  if (error) throw error;
}
