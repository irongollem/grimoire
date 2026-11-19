// A feature released to chosen accounts only (#1021; migration `20261119125826`). The AI table and what hangs off
// it is open in a campaign only when the campaign's OWNER has been granted it by an app admin (`feature_access`).
//
// Every function of the table asks here with the service-role client, in the query that loads its campaign, and
// reports a campaign whose owner has no grant as one with AI off: each handler already refuses that, quietly where
// it must be quiet, so there is one gate and no second set of refusals to keep in step.

import type { SupabaseClient } from "@supabase/supabase-js";

export type GatedFeature = "ai_table";

/** Whether this account has been granted the feature. A failed read is "no": a limited release fails closed. */
export async function hasFeature(admin: SupabaseClient, userId: string, feature: GatedFeature): Promise<boolean> {
  const { data, error } = await admin.from("feature_access").select("user_id").eq("user_id", userId).eq("feature", feature).maybeSingle();
  if (error) {
    console.error("feature_access read failed:", error.message);
    return false;
  }
  return data !== null;
}

/**
 * AI is on for a campaign only when its owner said so (`ai_enabled === true`): an undecided campaign (null) is off,
 * as the page has it (`campaign.isAiEnabled`). Every handler of the table refuses on `!== true`.
 *
 * The campaign's own AI switch, as the table's functions should read it: off when the owner has not been granted
 * the table, whatever the campaign says. A campaign with AI already off is not looked up.
 */
export async function tableAiEnabled(admin: SupabaseClient, campaign: { user_id: unknown; ai_enabled: unknown }): Promise<boolean | null> {
  const own = (campaign.ai_enabled as boolean | null) ?? null;
  if (own === false || typeof campaign.user_id !== "string") return false;
  return (await hasFeature(admin, campaign.user_id, "ai_table")) ? own : false;
}
