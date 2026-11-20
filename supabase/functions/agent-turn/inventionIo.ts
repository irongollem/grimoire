// The database half of the Narrator's rulings on inventions (#1021 row 14): reading what waits, and ruling on it.
//
// Both go through the CALLER's client: `decide_crafting_invention` checks that `auth.uid()` is a DM of the invention's
// campaign (the owner of an AI table is one: `campaigns_create_dm_membership` seats them as `dm`), and a service role
// has no such user. The rules (what is shown, what may be ruled) are in `_shared/agent/invention.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventionDraft } from "../_shared/invention/types.ts";
import { INVENTIONS_SHOWN, pendingFrom, type InventionRuling, type PendingInvention } from "../_shared/agent/invention.ts";

/** The draft's shape as far as the Narrator's section reads it; anything else is a row this code does not understand. */
function draftOf(value: unknown): InventionDraft {
  if (typeof value !== "object" || value === null) throw new Error("the draft is not an object");
  const d = value as Partial<InventionDraft>;
  if (typeof d.item !== "object" || d.item === null || typeof d.item.name !== "string") throw new Error("the draft has no item");
  if (!Array.isArray(d.mechanics) || !Array.isArray(d.ingredients) || !Array.isArray(d.warnings)) throw new Error("the draft is incomplete");
  return d as InventionDraft;
}

/**
 * The played character's inventions waiting on a ruling in this campaign, oldest first. The campaign is in the query
 * because the caller's RLS also lets the owner read their inventions in other campaigns. Throws on a failed read.
 */
export async function loadPendingInventions(client: SupabaseClient, campaignId: string, memberId: string): Promise<PendingInvention[]> {
  const { data, error } = await client
    .from("crafting_inventions")
    .select("id, discipline, draft, created_at")
    .eq("campaign_id", campaignId)
    .eq("party_member_id", memberId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(INVENTIONS_SHOWN);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("expected a list of rows");
  return data.map((row: Record<string, unknown>) =>
    pendingFrom({ id: row.id as string, createdAt: row.created_at as string, discipline: row.discipline as string, draft: draftOf(row.draft) })
  );
}

/** Rules on one invention as the caller. Throws when the database refuses (not a DM, no longer pending). */
export async function decideInvention(client: SupabaseClient, ruling: InventionRuling): Promise<void> {
  const { error } = await client.rpc("decide_crafting_invention", {
    p_invention_id: ruling.inventionId,
    p_decision: ruling.decision,
    ...(ruling.note === null ? {} : { p_note: ruling.note }),
  });
  if (error) throw error;
}
