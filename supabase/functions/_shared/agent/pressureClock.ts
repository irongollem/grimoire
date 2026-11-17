// The conversation's pressure clock, as the database holds it (#1021). Shared by `agent-turn` (a kept turn starts,
// switches or ends the pressure) and `agent-leave` (getting up ends it).
//
// One rule lives here: a clock the table made is the scene's own, and is deleted when the pressure ends or moves to
// another clock; a clock the DM authored is only let go of. Without it every sitting left a full clock on the quest,
// and a later narrator ran against the stale one.
//
// The admin client throughout: the conversation's row is written by the server only, and the delete is of a row this
// server created. Both carry the campaign filter, so an id from another campaign matches nothing.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PressureCtx {
  campaignId: string;
  agentSessionId: string;
}

/** What the conversation should run against next; null ends the pressure. `made` is true for a clock the table created. */
export type NextPressure = { clockId: string; made: boolean } | null;

/**
 * Which clock to delete once the conversation points at `next`: the previous one, when the table made it and it is
 * no longer the one in use. Pure, so the rule is tested without a database.
 */
export function clockToDelete(previous: { clockId: string | null; made: boolean }, next: NextPressure): string | null {
  if (previous.clockId === null || !previous.made) return null;
  return next !== null && next.clockId === previous.clockId ? null : previous.clockId;
}

/**
 * Whether the clock the conversation points at next counts as made by the table. Pointing again at the clock it
 * already runs against keeps what was known of it: live, the narrator "ran against" its own clock a second time,
 * the marker was lost, and the clock outlived the sitting.
 */
export function madeAfter(previous: { clockId: string | null; made: boolean }, next: NextPressure): boolean {
  if (next === null) return false;
  return next.clockId === previous.clockId ? previous.made || next.made : next.made;
}

export async function setPressureClock(admin: SupabaseClient, ctx: PressureCtx, next: NextPressure): Promise<void> {
  const before = await admin
    .from("agent_sessions")
    .select("pressure_clock_id, pressure_clock_made")
    .eq("id", ctx.agentSessionId)
    .eq("campaign_id", ctx.campaignId)
    .maybeSingle();
  if (before.error) throw before.error;
  if (!before.data) throw new Error("the conversation was not found in this campaign");
  const previous = {
    clockId: (before.data.pressure_clock_id as string | null) ?? null,
    made: before.data.pressure_clock_made === true,
  };

  const { error } = await admin
    .from("agent_sessions")
    .update({ pressure_clock_id: next === null ? null : next.clockId, pressure_clock_made: madeAfter(previous, next) })
    .eq("id", ctx.agentSessionId)
    .eq("campaign_id", ctx.campaignId);
  if (error) throw error;

  // After the conversation has let go of it, so a failed delete leaves a stray clock, never a conversation that
  // points at a deleted one.
  const stale = clockToDelete(previous, next);
  if (stale !== null) {
    const removed = await admin.from("quest_clocks").delete().eq("id", stale).eq("campaign_id", ctx.campaignId);
    if (removed.error) throw removed.error;
  }
}
