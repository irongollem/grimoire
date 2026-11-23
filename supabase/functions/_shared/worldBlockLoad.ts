// Server loader for the world block (#1226). Filters by campaign id in the
// query itself (the service-role client has no RLS to lean on) and throws on a
// read error rather than treating it as "no canon".
import type { SupabaseClient } from "@supabase/supabase-js";
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
} from "./worldBlock.ts";
import { collectMentions, loadMentionNames } from "./mentionNames.ts";

export async function loadWorldBlock(admin: SupabaseClient, campaignId: string): Promise<WorldBlock> {
  const [campaign, canon, peoples, habitats, places, life] = await Promise.all([
    admin.from("campaigns").select("setting").eq("id", campaignId).single(),
    admin
      .from("canon_entries")
      .select(WORLD_BLOCK_CANON_COLUMNS)
      .eq("campaign_id", campaignId)
      .or(WORLD_BLOCK_CANON_FILTER),
    admin
      .from("campaign_peoples_named")
      .select(WORLD_BLOCK_PEOPLES_COLUMNS)
      .eq("campaign_id", campaignId)
      // A people whose record this reader may not read has no name; its share falls under "anyone else".
      .not("name", "is", null)
      .order("sort_order", { ascending: true }),
    admin
      .from("campaign_habitats")
      .select(WORLD_BLOCK_HABITAT_COLUMNS)
      .eq("campaign_id", campaignId)
      .order("sort_order", { ascending: true }),
    admin
      .from("campaign_habitat_places")
      .select(WORLD_BLOCK_HABITAT_PLACE_COLUMNS)
      .eq("campaign_id", campaignId),
    admin
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
  // A mention in a body stores no name; read the true ones once so the block says "sold by Maren", not "sold by".
  const mentions = canon.data.flatMap((r) => collectMentions(r.body, { skipSecrets: true }));
  const nameOf = await loadMentionNames(admin, campaignId, mentions);
  return worldBlockFromRows(campaign.data.setting, canon.data, peoples.data, habitatsForBlock({ habitats: habitats.data, places: places.data, life: life.data }), nameOf);
}
