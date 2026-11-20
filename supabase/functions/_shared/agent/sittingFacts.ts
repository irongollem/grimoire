// The facts a sitting put on record, as the recap and the leave note read them. A struck fact (`struck_at`, the DM
// said it never happened) is not read: a recap or an NPC's memory filed from it would tell the party a thing that did
// not happen.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadSittingFacts(client: SupabaseClient, sittingId: string): Promise<Array<{ body: string; known_to_player: boolean }>> {
  const { data, error } = await client
    .from("story_facts")
    .select("body, known_to_player")
    .eq("agent_session_id", sittingId)
    .is("struck_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ body: row.body as string, known_to_player: row.known_to_player === true }));
}
