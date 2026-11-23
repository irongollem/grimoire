import { supabase } from "@/lib/supabase";
import { fetchCanonEntries } from "@/lib/canon/canonEntries";
import { canonThisSession, sessionCanonText } from "@/lib/canon/canonSession";
import { fetchCanonClues } from "@/composables/canon/useCanonClues";
import { fetchCanonPassages } from "@/composables/canon/useCanonPassages";
import { fetchCanonForceData } from "@/composables/canon/useCanonForces";
import type { CampaignSession } from "@/types/session.types";

/**
 * What the canon did in the session a note belongs to, as the text the Chronicler is given (#1258 item 8): the clues
 * found, passages told, secrets revealed, steps reached, clock moves and questions answered, the same list the
 * Chronicle shows under the entry. Empty when the note has no session or nothing changed. Every read is scoped to the
 * campaign here, and a failed read throws: the caller decides that missing context should not stop a draft.
 */
export async function fetchSessionCanonText(campaignId: string, noteId: string): Promise<string> {
  const { data: note, error } = await supabase.from("notes").select("session_id").eq("id", noteId).eq("campaign_id", campaignId).maybeSingle();
  if (error) throw error;
  if (note === null || note.session_id === null) return "";
  const { data: session, error: sessionError } = await supabase.from("campaign_sessions").select("*").eq("id", note.session_id).eq("campaign_id", campaignId).maybeSingle();
  if (sessionError) throw sessionError;
  if (session === null) return "";
  const [entries, clues, passages, forceData] = await Promise.all([
    fetchCanonEntries(campaignId),
    fetchCanonClues(campaignId),
    fetchCanonPassages(campaignId),
    fetchCanonForceData(campaignId),
  ]);
  return sessionCanonText(canonThisSession({ session: session as CampaignSession, entries, clues, passages, steps: forceData.steps, ticks: forceData.ticks }));
}
