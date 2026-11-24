import { supabase } from "@/lib/supabase";
import type { StoredTurn } from "@/lib/ask/askRestore";

/**
 * How long a conversation carries on after its last message. Within it a reload or a return picks up where the DM
 * was; past it the Familiar opens fresh (with Ooru's greeting), because each new question sends the conversation's
 * earlier turns to the model, so an old thread costs more for context nobody needs (maintainer, 25 Nov 2026). The old
 * conversation stays stored either way.
 */
export const ASK_CONTINUE_MS = 6 * 60 * 60 * 1000;

/**
 * The account's latest Familiar conversation in a campaign, when its last message is recent enough to carry on
 * (`ASK_CONTINUE_MS` before `now`): its session and stored turns, or null when there is none.
 * Both reads name the caller in the query (`user_id`), not only through RLS: a wider policy must never turn "my last
 * conversation" into someone else's. Errors are thrown, so a failed read is not mistaken for no conversation.
 */
export async function loadLastAskConversation(userId: string, campaignId: string, now: Date = new Date()): Promise<{ sessionId: string; turns: StoredTurn[] } | null> {
  const { data: session, error } = await supabase
    .from("agent_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .eq("kind", "ask")
    .gte("updated_at", new Date(now.getTime() - ASK_CONTINUE_MS).toISOString())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (session === null) return null;
  const { data: turns, error: turnsError } = await supabase
    .from("agent_turns")
    .select("role, blocks")
    .eq("session_id", session.id)
    .eq("user_id", userId)
    .order("seq", { ascending: true });
  if (turnsError) throw turnsError;
  return { sessionId: session.id as string, turns: (turns ?? []) as StoredTurn[] };
}
