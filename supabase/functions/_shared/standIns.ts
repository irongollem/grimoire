// The party members the AI plays in a DM's own fight (#1021 row 26). Read by the server, once per request, and never named by the
// browser: a request cannot make the AI play a person who did not consent.
import type { SupabaseClient } from "@supabase/supabase-js";
import { generationRefusal } from "./accountGate.ts";

/** Whether an account may not have the AI act for it: the gate `character-reply` uses, failing closed on a read that did not work. */
export type AccountRefused = (userId: string) => Promise<boolean>;

const refusedByGate = (admin: SupabaseClient): AccountRefused => async (userId) => (await generationRefusal(admin, userId, { failClosed: true })) !== null;

/**
 * The ids of this campaign's party members whose player consented (`ai_speaks`) and whose DM switched it on (`ai_stands_in`), leaving
 * out one whose account the AI gate refuses (a child's, a suspended one). Scoped to `campaignId` in the query itself: RLS is bypassed
 * here, so the filter is the whole fence. A member no account is seated at (a pre-made character) has no account to refuse.
 */
export async function loadStandInIds(admin: SupabaseClient, campaignId: string, refused: AccountRefused = refusedByGate(admin)): Promise<ReadonlySet<string>> {
  const flagged = await admin.from("party_members").select("id").eq("campaign_id", campaignId).eq("ai_speaks", true).eq("ai_stands_in", true);
  if (flagged.error) throw new Error(`party_members: ${flagged.error.message}`);
  const ids = (flagged.data as { id: string }[]).map((row) => row.id);
  if (ids.length === 0) return new Set();
  const links = await admin.from("campaign_members").select("user_id, party_member_id").eq("campaign_id", campaignId).in("party_member_id", ids);
  if (links.error) throw new Error(`campaign_members: ${links.error.message}`);
  const playerOf = new Map((links.data as { user_id: string; party_member_id: string }[]).map((row) => [row.party_member_id, row.user_id]));
  const kept = new Set<string>();
  for (const id of ids) {
    const player = playerOf.get(id);
    if (player !== undefined && (await refused(player))) continue;
    kept.add(id);
  }
  return kept;
}
