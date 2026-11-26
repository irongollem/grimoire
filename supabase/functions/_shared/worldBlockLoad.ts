// Server loader for the world block (#1226). Filters by campaign id in the
// query itself (the service-role client has no RLS to lean on) and throws on a
// read error rather than treating it as "no canon".
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WORLD_BLOCK_BELIEF_COLUMNS,
  WORLD_BLOCK_CANON_COLUMNS,
  WORLD_BLOCK_CANON_FILTER,
  WORLD_BLOCK_HABITAT_COLUMNS,
  WORLD_BLOCK_CLADE_COLUMNS,
  WORLD_BLOCK_FORM_COLUMNS,
  WORLD_BLOCK_HABITAT_LIFE_COLUMNS,
  WORLD_BLOCK_HABITAT_SPECIES_COLUMNS,
  WORLD_BLOCK_LINK_COLUMNS,
  WORLD_BLOCK_SPECIES_COLUMNS,
  WORLD_BLOCK_HABITAT_PLACE_COLUMNS,
  WORLD_BLOCK_PEOPLES_COLUMNS,
  habitatsForBlock,
  worldBlockFromRows,
  type WorldBlock,
} from "./worldBlock.ts";
import { collectMentions, loadMentionNames, type MentionAudience } from "./mentionNames.ts";

/** `audience` is whose names the block's mentions carry: the table's when the Narrator reads it to the players. */
export async function loadWorldBlock(admin: SupabaseClient, campaignId: string, audience: MentionAudience = "dm"): Promise<WorldBlock> {
  const [campaign, canon, peoples, habitats, places, life, beliefs, habitatSpecies, species, forms, links, clades] = await Promise.all([
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
      // A form whose stat block this reader may not read still counts: the block names species, never stat blocks.
      .order("sort_order", { ascending: true }),
    // Only the cover story leaves a secret: never its title or body (#1279 item 15). A closed secret is no longer
    // believed; a revealed one still is, because the party learning the truth does not change what the world says.
    admin
      .from("canon_entries")
      .select(WORLD_BLOCK_BELIEF_COLUMNS)
      .eq("campaign_id", campaignId)
      .eq("part", "secret")
      .not("cover_story", "is", null)
      .is("closed_at", null),
    // The ecology (#1283): species are the DM's own, so every one is readable by the loader's audience.
    admin.from("campaign_habitat_species").select(WORLD_BLOCK_HABITAT_SPECIES_COLUMNS).eq("campaign_id", campaignId).order("sort_order", { ascending: true }),
    admin.from("campaign_species").select(WORLD_BLOCK_SPECIES_COLUMNS).eq("campaign_id", campaignId),
    admin.from("campaign_species_forms").select(WORLD_BLOCK_FORM_COLUMNS).eq("campaign_id", campaignId),
    admin.from("campaign_species_links").select(WORLD_BLOCK_LINK_COLUMNS).eq("campaign_id", campaignId),
    admin.from("campaign_clades").select(WORLD_BLOCK_CLADE_COLUMNS).eq("campaign_id", campaignId),
  ]);
  if (campaign.error) throw campaign.error;
  if (canon.error) throw canon.error;
  if (peoples.error) throw peoples.error;
  if (habitats.error) throw habitats.error;
  if (places.error) throw places.error;
  if (life.error) throw life.error;
  if (beliefs.error) throw beliefs.error;
  if (habitatSpecies.error) throw habitatSpecies.error;
  if (species.error) throw species.error;
  if (forms.error) throw forms.error;
  if (links.error) throw links.error;
  if (clades.error) throw clades.error;
  // A mention in a body stores no name; read the true ones once so the block says "sold by Maren", not "sold by".
  const mentions = [...canon.data, ...peoples.data].flatMap((r) => collectMentions(r.body, { skipSecrets: true }));
  const nameOf = await loadMentionNames(admin, campaignId, mentions, audience);
  return worldBlockFromRows(campaign.data.setting, canon.data, peoples.data, habitatsForBlock({ habitats: habitats.data, places: places.data, life: life.data, habitatSpecies: habitatSpecies.data, species: species.data, forms: forms.data, links: links.data, clades: clades.data }), nameOf, beliefs.data);
}
