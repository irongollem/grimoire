import type { SupabaseClient } from "@supabase/supabase-js";
import { isUserPro } from "./plan.ts";

/** A campaign's own provider keys, decrypted; null where none is stored or none may be used. */
export interface CampaignKeys {
  openai: string | null;
  anthropic: string | null;
  gemini: string | null;
}

export const NO_CAMPAIGN_KEYS: CampaignKeys = { openai: null, anthropic: null, gemini: null };

/**
 * The BYOK keys a campaign's owner stored, decrypted, for a generator to call a provider with (#1228).
 *
 * They live in `campaign_api_keys`, not on the campaign row, because every member of a campaign (players included)
 * can read the campaign row. Call with the service-role client: the table's policies admit the owner alone, and a
 * generator may run for a co-DM on the owner's key.
 *
 * The read is pinned to the campaign's current owner, so a row an earlier owner left behind is never used (an owner
 * change deletes it as well, `private.clear_campaign_api_keys_on_owner_change`). BYOK is Pro-only and checked here,
 * at use time, not only when the key is saved: a lapsed Pro owner's stored key is ignored without being deleted.
 * A key that does not decrypt counts as no key, so the generator falls back to the platform's.
 *
 * `decrypt` is the vault's `decryptValue`, passed in because the vault reads its key from the environment on import.
 */
export async function loadCampaignKeys(
  admin: SupabaseClient,
  campaign: { id: string; user_id: string },
  decrypt: (ciphertext: string) => Promise<string>,
): Promise<CampaignKeys> {
  const { data, error } = await admin
    .from("campaign_api_keys")
    .select("openai_api_key, anthropic_api_key, gemini_api_key")
    .eq("campaign_id", campaign.id)
    .eq("user_id", campaign.user_id)
    .maybeSingle();
  if (error) throw new Error(`Could not read the campaign's keys: ${error.message}`);
  if (!data) return NO_CAMPAIGN_KEYS;
  if (!(await isUserPro(admin, campaign.user_id))) return NO_CAMPAIGN_KEYS;

  const open = async (ciphertext: string | null): Promise<string | null> => {
    if (!ciphertext) return null;
    try { return await decrypt(ciphertext); } catch { return null; }
  };
  const [openai, anthropic, gemini] = await Promise.all([
    open(data.openai_api_key),
    open(data.anthropic_api_key),
    open(data.gemini_api_key),
  ]);
  return { openai, anthropic, gemini };
}
