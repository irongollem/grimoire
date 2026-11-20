// Server loader for the world block (#1226). Filters by campaign id in the
// query itself (the service-role client has no RLS to lean on) and throws on a
// read error rather than treating it as "no canon".
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WORLD_BLOCK_CANON_COLUMNS,
  WORLD_BLOCK_CANON_FILTER,
  worldBlockFromRows,
  type WorldBlock,
} from "./worldBlock.ts";

export async function loadWorldBlock(admin: SupabaseClient, campaignId: string): Promise<WorldBlock> {
  const [campaign, canon] = await Promise.all([
    admin.from("campaigns").select("setting").eq("id", campaignId).single(),
    admin
      .from("canon_entries")
      .select(WORLD_BLOCK_CANON_COLUMNS)
      .eq("campaign_id", campaignId)
      .or(WORLD_BLOCK_CANON_FILTER),
  ]);
  if (campaign.error) throw campaign.error;
  if (canon.error) throw canon.error;
  return worldBlockFromRows(campaign.data.setting, canon.data);
}
