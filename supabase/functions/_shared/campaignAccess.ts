// Who may run a DM tool against a campaign, from inside an edge function.
//
// The AI generators read campaign content with the service-role client, which
// bypasses RLS: retrieval returns every NPC, location and faction name, the
// voice coach reads an NPC's backstory and DM notes, the Chronicler reads the
// DM's session notes. Whatever reaches the prompt can come back in the model's
// answer, so the function itself is the only thing deciding who sees it.
//
// They used to admit "the owner, or any campaign_members row", and fetched the
// member's role only to ignore it. A player is a campaign member, so a player
// calling one directly got DM-only material back in the generated text. No
// player surface calls any of these, so the gate is the DM role, not a
// player-aware filter. A player-facing generator, if one is ever built, needs
// its reads filtered by `player_visible_to` instead of this check.

import type { SupabaseClient } from "@supabase/supabase-js";

/** True for the campaign's owner and for a member whose role is `dm`. */
export async function isCampaignDm(
  admin: SupabaseClient,
  campaign: { id: string; user_id: string },
  userId: string,
): Promise<boolean> {
  if (campaign.user_id === userId) return true;
  const { data, error } = await admin
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", campaign.id)
    .eq("user_id", userId)
    .eq("role", "dm")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
