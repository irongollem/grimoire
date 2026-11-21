// Load the campaign an AI request runs against, and decide whether this caller may run it (#1234).
//
// The generators read campaign content with the service-role client, so the function itself is the only thing deciding
// who sees what reaches the prompt (see `campaignAccess.ts`). Each one used to hand-roll this read; most dropped the
// read's `error`, so a database failure answered "Campaign not found", and they disagreed on whether the AI switch or
// the access check came first. One order now:
//
//   read (error -> 500) -> missing (404) -> access (403, or 404 when existence is hidden) -> AI switch (403)
//
// Access comes before the AI switch so a caller who may not use the campaign learns nothing about its settings.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCampaignDm } from "../campaignAccess.ts";
import { tableAiEnabled } from "../featureAccess.ts";
import { jsonError } from "./respond.ts";

export interface BaseCampaign {
  id: string;
  user_id: string;
  ai_enabled: boolean | null;
}

/**
 * Whether `userId` may run this request against `campaign`. "dm" is the campaign's owner or a member with the DM role;
 * "member" is the owner or anyone seated at the campaign, players included (the manual search is for players too).
 */
export type CampaignAccess =
  | "dm"
  | "member"
  | "owner"
  | ((admin: SupabaseClient, campaign: BaseCampaign, userId: string) => Promise<boolean>);

export interface AiCampaignOptions {
  /** Columns beyond `id, user_id, ai_enabled`. */
  columns?: readonly string[];
  access?: CampaignAccess;
  /**
   * Which switch says AI is on: the campaign's own `ai_enabled` ("campaign"), or that plus the owner's grant of the AI
   * table ("table", `tableAiEnabled`). `false` skips it, for a request that is free and not generative.
   */
  aiSwitch?: "campaign" | "table" | false;
  /** Answer a caller without access as if the campaign did not exist (404), so an id cannot be probed. */
  hideFromOutsiders?: boolean;
  /** The sentence a refused caller reads, when the access rule is not "the DM". */
  forbiddenMessage?: string;
}

export type CampaignLoad<C> = { ok: true; campaign: C } | { ok: false; response: Response };

const BASE_COLUMNS = ["id", "user_id", "ai_enabled"] as const;

const notFound = () => jsonError(404, "campaign_not_found", "Campaign not found.");

async function isCampaignMember(admin: SupabaseClient, campaign: BaseCampaign, userId: string): Promise<boolean> {
  if (campaign.user_id === userId) return true;
  const { data, error } = await admin
    .from("campaign_members").select("user_id")
    .eq("campaign_id", campaign.id).eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function mayUse(admin: SupabaseClient, access: CampaignAccess, campaign: BaseCampaign, userId: string): Promise<boolean> {
  if (access === "owner") return campaign.user_id === userId;
  if (access === "dm") return isCampaignDm(admin, campaign, userId);
  if (access === "member") return isCampaignMember(admin, campaign, userId);
  return access(admin, campaign, userId);
}

export async function loadAiCampaign<C extends BaseCampaign = BaseCampaign>(
  admin: SupabaseClient,
  campaignId: string,
  userId: string,
  {
    columns = [],
    access = "dm",
    aiSwitch = "campaign",
    hideFromOutsiders = false,
    forbiddenMessage = "Only the campaign's DM can do this.",
  }: AiCampaignOptions = {},
): Promise<CampaignLoad<C>> {
  const select = [...new Set([...BASE_COLUMNS, ...columns])].join(", ");
  const { data, error } = await admin.from("campaigns").select(select).eq("id", campaignId).maybeSingle();
  if (error) {
    console.error("campaign read failed:", error.message);
    return { ok: false, response: jsonError(500, "campaign_read_failed", "The campaign could not be read. Please try again.") };
  }
  if (!data) return { ok: false, response: notFound() };
  const campaign = data as unknown as C;

  let allowed: boolean;
  try {
    allowed = await mayUse(admin, access, campaign, userId);
  } catch (e) {
    console.error("campaign access check failed:", e);
    return { ok: false, response: jsonError(500, "access_check_failed", "Your access could not be checked. Please try again.") };
  }
  if (!allowed) {
    return { ok: false, response: hideFromOutsiders ? notFound() : jsonError(403, "forbidden", forbiddenMessage) };
  }

  if (aiSwitch !== false) {
    const on = aiSwitch === "table" ? await tableAiEnabled(admin, campaign) : campaign.ai_enabled;
    if (on !== true) return { ok: false, response: jsonError(403, "ai_disabled", "AI is turned off for this campaign.") };
  }
  return { ok: true, campaign };
}
