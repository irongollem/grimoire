// Browser loader for the world block (#1226), the local-key twin of the edge
// functions' `loadWorldBlock`. Same query, same audience rule (it lives in
// worldBlock.ts), read through the caller's RLS and filtered by campaign id.
import { supabase } from "@/lib/supabase";
import {
  WORLD_BLOCK_CANON_COLUMNS,
  WORLD_BLOCK_CANON_FILTER,
  WORLD_BLOCK_HABITAT_COLUMNS,
  WORLD_BLOCK_HABITAT_LIFE_COLUMNS,
  WORLD_BLOCK_HABITAT_PLACE_COLUMNS,
  WORLD_BLOCK_PEOPLES_COLUMNS,
  habitatsForBlock,
  worldBlockFromRows,
  type WorldBlock,
} from "@edge-shared/worldBlock.ts";
import { collectMentions, loadMentionNames } from "@edge-shared/mentionNames.ts";

export type { WorldBlock };

export async function fetchWorldBlock(campaignId: string): Promise<WorldBlock> {
  const [campaign, canon, peoples, habitats, places, life] = await Promise.all([
    supabase.from("campaigns").select("setting").eq("id", campaignId).single(),
    supabase
      .from("canon_entries")
      .select(WORLD_BLOCK_CANON_COLUMNS)
      .eq("campaign_id", campaignId)
      .or(WORLD_BLOCK_CANON_FILTER),
    supabase
      .from("campaign_peoples_named")
      .select(WORLD_BLOCK_PEOPLES_COLUMNS)
      .eq("campaign_id", campaignId)
      // A people whose record this reader may not read has no name; its share falls under "anyone else".
      .not("name", "is", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("campaign_habitats")
      .select(WORLD_BLOCK_HABITAT_COLUMNS)
      .eq("campaign_id", campaignId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("campaign_habitat_places")
      .select(WORLD_BLOCK_HABITAT_PLACE_COLUMNS)
      .eq("campaign_id", campaignId),
    supabase
      .from("campaign_habitat_life_named")
      .select(WORLD_BLOCK_HABITAT_LIFE_COLUMNS)
      .eq("campaign_id", campaignId)
      // A creature this reader may not read has no name; its share falls under "anything else".
      .not("name", "is", null)
      .order("sort_order", { ascending: true }),
  ]);
  if (campaign.error) throw campaign.error;
  if (canon.error) throw canon.error;
  if (peoples.error) throw peoples.error;
  if (habitats.error) throw habitats.error;
  if (places.error) throw places.error;
  if (life.error) throw life.error;
  // A mention in a body stores no name; the DM's own client reads the true ones so the block keeps them.
  const mentions = canon.data.flatMap((r) => collectMentions(r.body, { skipSecrets: true }));
  const nameOf = await loadMentionNames(supabase, campaignId, mentions);
  return worldBlockFromRows(campaign.data.setting, canon.data, peoples.data, habitatsForBlock({ habitats: habitats.data, places: places.data, life: life.data }), nameOf);
}

/** The local-key paths need the block; a null one means the capture decided they would not run. Never read as empty. */
export function requireWorld(world: WorldBlock | null): WorldBlock {
  if (!world) throw new Error("The world block was not loaded for this local-key generation.");
  return world;
}
