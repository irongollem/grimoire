import { supabase } from "@/lib/supabase";

/**
 * A campaign's stored BYOK keys, as `enc:v1:` ciphertext (#1228).
 *
 * They are the owner's own credentials, so they live in `campaign_api_keys`, whose policies admit the owner alone,
 * and not on the campaign row, which every member of the campaign reads. A co-DM or a player has no row to read.
 */
export interface CampaignApiKeys {
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  gemini_api_key: string | null;
}

export type CampaignApiKeyField = keyof CampaignApiKeys;

/** The owner's stored keys for a campaign, or null when they never stored any. Throws on a failed read. */
export async function fetchCampaignApiKeys(campaignId: string, ownerId: string): Promise<CampaignApiKeys | null> {
  // Scoped in the query, not left to the policy (see CLAUDE.md, Client Reads).
  const { data, error } = await supabase
    .from("campaign_api_keys")
    .select("openai_api_key, anthropic_api_key, gemini_api_key")
    .eq("campaign_id", campaignId)
    .eq("user_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Store the owner's keys for a campaign, replacing what was there. Setting a key is Pro-only: the database refuses
 * it for anyone else (`enforce_byok_pro_only`), and that refusal is thrown.
 */
export async function saveCampaignApiKeys(campaignId: string, ownerId: string, keys: CampaignApiKeys): Promise<void> {
  const { error } = await supabase
    .from("campaign_api_keys")
    .upsert({ campaign_id: campaignId, user_id: ownerId, ...keys }, { onConflict: "campaign_id" });
  if (error) throw error;
}
