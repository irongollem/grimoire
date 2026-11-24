import { supabase } from "@/lib/supabase";
import type { StoredTurn } from "@/lib/ask/askRestore";

/**
 * The account's latest Familiar conversation in a campaign: its session and stored turns, or null when there is none.
 * Both reads name the caller in the query (`user_id`), not only through RLS: a wider policy must never turn "my last
 * conversation" into someone else's. Errors are thrown, so a failed read is not mistaken for no conversation.
 */
export async function loadLastAskConversation(userId: string, campaignId: string): Promise<{ sessionId: string; turns: StoredTurn[] } | null> {
  const { data: session, error } = await supabase
    .from("agent_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .eq("kind", "ask")
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
