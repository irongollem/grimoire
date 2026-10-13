import { sessionShortLabel } from "@/lib/sessions/sessionLabel";

/** The columns of an NPC memory that matter to "who has been told this secret" (#1053). */
export interface DisclosureMemory {
  secret_id: string;
  npc_id: string;
  session_id: string | null;
  created_at: string;
}

export interface DisclosureSession {
  id: string;
  number: number | null;
}

/**
 * For each secret block an NPC memory discloses, a label for the earliest such
 * memory: "known since Session 14 (Bram)", or "known to the party (Bram)" when
 * the memory has no session or one that is not in the log.
 */
export function disclosedSecretLabels(
  memories: readonly DisclosureMemory[],
  sessions: readonly DisclosureSession[],
  npcLabel: (npcId: string) => string | undefined,
): ReadonlyMap<string, string> {
  const earliest = new Map<string, DisclosureMemory>();
  for (const memory of memories) {
    const held = earliest.get(memory.secret_id);
    if (!held || memory.created_at < held.created_at) earliest.set(memory.secret_id, memory);
  }
  const sessionById = new Map(sessions.map((s) => [s.id, s] as const));
  const labels = new Map<string, string>();
  for (const [secretId, memory] of earliest) {
    const session = memory.session_id ? sessionById.get(memory.session_id) : undefined;
    const who = npcLabel(memory.npc_id);
    const tail = who ? ` (${who})` : "";
    labels.set(
      secretId,
      session ? `known since ${sessionShortLabel(session)}${tail}` : `known to the party${tail}`,
    );
  }
  return labels;
}
