// Browser loader for the world block (#1226), the local-key twin of the edge
// functions' `loadWorldBlock`. Same query, same audience rule (it lives in
// worldBlock.ts), read through the caller's RLS and filtered by campaign id.
import { supabase } from "@/lib/supabase";
import {
  WORLD_BLOCK_CANON_COLUMNS,
  WORLD_BLOCK_CANON_FILTER,
  WORLD_BLOCK_PEOPLES_COLUMNS,
  worldBlockFromRows,
  type WorldBlock,
} from "@edge-shared/worldBlock.ts";

export type { WorldBlock };

export async function fetchWorldBlock(campaignId: string): Promise<WorldBlock> {
  const [campaign, canon, peoples] = await Promise.all([
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
      .order("sort_order", { ascending: true }),
  ]);
  if (campaign.error) throw campaign.error;
  if (canon.error) throw canon.error;
  if (peoples.error) throw peoples.error;
  return worldBlockFromRows(campaign.data.setting, canon.data, peoples.data);
}

/** The local-key paths need the block; a null one means the capture decided they would not run. Never read as empty. */
export function requireWorld(world: WorldBlock | null): WorldBlock {
  if (!world) throw new Error("The world block was not loaded for this local-key generation.");
  return world;
}
