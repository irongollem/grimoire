// The stored turns a turn of the table reads (#1205).
//
// A conversation has no end the server sets: a laptop that sleeps and wakes can keep one table going for a year
// (the maintainer, 18 Nov 2026). What the model is sent stays small whatever the length, since the rolling summary
// folds the old part away, but every turn used to read every row the table had ever stored, tool results of up to
// 20,000 characters included, only to drop all but the newest. So the read has a reach: everything not yet folded
// into the summary, which is what the model is sent, and a fixed run of rows from before it, which is what the
// characters go by (the last things each heard, what they hold back, the posture they are in).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredTurn } from "./transcript.ts";

/**
 * How many rows from before the summary's edge are still read. A character is told the last 20 things it heard
 * (`trimHeard`); a turn is a handful of rows, so this reaches back some sixty turns for them. app convention.
 */
export const EARLIER_ROWS_IN_REACH = 400;

/** The rows a turn reads, oldest first: all that the summary has not folded, and the newest of what it has. */
export async function loadTurnsInReach(admin: SupabaseClient, sessionId: string, summaryThroughSeq: number): Promise<StoredTurn[]> {
  const [fresh, earlier] = await Promise.all([
    admin.from("agent_turns").select("seq, role, blocks").eq("session_id", sessionId).gt("seq", summaryThroughSeq).order("seq", { ascending: true }),
    admin
      .from("agent_turns")
      .select("seq, role, blocks")
      .eq("session_id", sessionId)
      .lte("seq", summaryThroughSeq)
      .order("seq", { ascending: false })
      .limit(EARLIER_ROWS_IN_REACH),
  ]);
  if (fresh.error) throw fresh.error;
  if (earlier.error) throw earlier.error;
  return [...((earlier.data ?? []) as StoredTurn[]).reverse(), ...((fresh.data ?? []) as StoredTurn[])];
}
