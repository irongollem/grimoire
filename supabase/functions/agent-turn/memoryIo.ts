// The database half of the characters' memories at the AI table (#1021): what those in the scene remember of the party.
//
// Read through the caller's client (the table is the DM's, `npc_memories_select`), with the campaign in every query.
// The rules (how many, which first, how long) are in `_shared/agent/memories.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { maskTrueName } from "../_shared/npcMemories.ts";
import { shownNpcName } from "../_shared/npcProfile.ts";
import type { SceneMemory } from "../_shared/agent/memories.ts";

/**
 * How many rows the one query reads, newest first across everyone who is here. The cap per character is applied
 * afterwards, so one talkative character could crowd out the rest only by writing this many memories newer than theirs.
 */
export const MEMORY_ROWS_READ = 60;

function rowsOf(data: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(data)) throw new Error("expected a list of rows");
  return data as Array<Record<string, unknown>>;
}

/** The newest memories of the characters who are here, in one query for all of them. Throws on any failed read. */
export async function loadSceneMemories(
  client: SupabaseClient,
  campaignId: string,
  presentIds: readonly string[],
): Promise<SceneMemory[]> {
  if (presentIds.length === 0) return [];
  const [people, memories] = await Promise.all([
    client.from("npcs").select("id, name, disguise_name, is_revealed").eq("campaign_id", campaignId).in("id", [...presentIds]),
    client.from("npc_memories").select("npc_id, body, created_at").eq("campaign_id", campaignId).in("npc_id", [...presentIds])
      .order("created_at", { ascending: false }).limit(MEMORY_ROWS_READ),
  ]);
  if (people.error) throw people.error;
  if (memories.error) throw memories.error;
  const identity = new Map<string, { name: string; disguise_name: string | null; is_revealed: boolean }>();
  for (const n of rowsOf(people.data)) {
    identity.set(n.id as string, {
      name: n.name as string,
      disguise_name: typeof n.disguise_name === "string" ? n.disguise_name : null,
      is_revealed: n.is_revealed === true,
    });
  }
  const found: SceneMemory[] = [];
  for (const m of rowsOf(memories.data)) {
    const who = identity.get(m.npc_id as string);
    // A memory of a character this campaign does not have is not shown: the name is what it is told under.
    if (who === undefined) continue;
    // The disguise rule: a memory written by the DM may name the character the way only the DM knows them.
    found.push({ npcId: m.npc_id as string, name: shownNpcName(who), body: maskTrueName(m.body as string, who), createdAt: m.created_at as string });
  }
  return found;
}
