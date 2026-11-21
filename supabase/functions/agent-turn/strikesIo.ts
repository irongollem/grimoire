// How many of an account's own messages the screen refused lately (#1021, story 18), for `tableClosed`.
//
// An admin can reopen a closed table (`admin_reopen_table`, which writes a `table_reopen` row to `admin_audit_log`).
// Refusals from before that moment were answered for, so the count starts after the newest reopening when that is
// later than the window's start. Without this a reopened account would still hold five strikes inside the window and
// find the table closed again on its next message.

import type { SupabaseClient } from "@supabase/supabase-js";
import { STRIKE_WINDOW_DAYS } from "../_shared/agent/conduct.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Refusals of the account's own `agent_turn` messages since the later of the window's start and its newest
 * reopening. Throws on a failed read of either table: the caller treats an unreadable count as not closing the table,
 * so a failed audit read must not be answered by counting every refusal (that would close a reopened table).
 */
export async function countStrikes(client: SupabaseClient, userId: string, nowMs: number): Promise<number> {
  const windowStart = new Date(nowMs - STRIKE_WINDOW_DAYS * DAY_MS).toISOString();
  const { data: reopened, error: reopenError } = await client
    .from("admin_audit_log")
    .select("created_at")
    .eq("action", "table_reopen")
    .eq("target_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (reopenError) throw reopenError;
  const newest = Array.isArray(reopened) && reopened.length > 0 ? (reopened[0] as { created_at?: unknown }).created_at : undefined;
  const since = typeof newest === "string" && newest > windowStart ? newest : windowStart;

  // Strictly after the reopening: the refusal that closed the table is not counted again.
  const { count, error } = await client
    .from("prompt_screenings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("generation_type", "agent_turn")
    .eq("blocked", true)
    .gt("created_at", since);
  if (error) throw error;
  if (count === null) throw new Error("the refused messages could not be counted");
  return count;
}
