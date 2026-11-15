// Who may reach a fight, shared by `encounter-command` (which advances it) and `encounter-options` (which reads it).
//
// Auth shape copied from import-match: the caller's own Authorization header derives `auth.uid()`, an admin
// (service-role) client does the work, and nothing in the request is trusted for identity. The campaign is derived
// from the encounter, never taken from the request. Only the campaign's owner or a member with role `dm` may reach a
// fight; players have no access to its row at all (`isCampaignDm`).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isCampaignDm } from "./campaignAccess.ts";

/** The service-role client of an edge function. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/** The caller's user id from their own Authorization header, or null when there is none or it does not name a user. */
export async function callerUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

export interface FightCampaign {
  id: string;
  user_id: string;
  game_system: string | null;
}

export type DmEncounter<T> = { ok: true; encounter: T; campaign: FightCampaign } | { ok: false; response: Response };

const deny = (body: string, status: number) => new Response(body, { status });
const denyJson = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });

/**
 * Reads the encounter (`columns` always include `campaign_id`), its campaign, and checks the caller is the campaign's
 * DM, specifically: a fight is the DM's, not any member's. A refusal comes back as the response to send: 404 for an
 * encounter or campaign that is not there, 403 for a caller who is not the DM.
 */
export async function loadEncounterAsDm<T extends { campaign_id: string | null }>(
  admin: SupabaseClient,
  userId: string,
  encounterId: string,
  columns: string,
): Promise<DmEncounter<T>> {
  const { data: encounter, error: encounterError } = await admin.from("encounters").select(columns).eq("id", encounterId).maybeSingle();
  if (encounterError) throw new Error(`encounters: ${encounterError.message}`);
  const row = encounter as unknown as T | null;
  if (!row || !row.campaign_id) return { ok: false, response: denyJson("Encounter not found.", 404) };

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns").select("id, user_id, game_system").eq("id", row.campaign_id).maybeSingle();
  if (campaignError) throw new Error(`campaigns: ${campaignError.message}`);
  if (!campaign) return { ok: false, response: denyJson("Campaign not found.", 404) };
  if (!(await isCampaignDm(admin, campaign as FightCampaign, userId))) return { ok: false, response: deny("Forbidden", 403) };
  return { ok: true, encounter: row, campaign: campaign as FightCampaign };
}
