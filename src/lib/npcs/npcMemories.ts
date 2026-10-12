import type { NpcMemoryKind } from "@/types/npcMemory.types";
import type { CampaignSession } from "@/types/session.types";

/** The DM's names for the kinds of memory (#1019). */
export const NPC_MEMORY_KIND_LABELS: Record<NpcMemoryKind, string> = {
  revealed: "Told the party",
  learned: "Heard from the party",
  promise: "Promise",
  deceived: "Deception",
  attitude: "Attitude",
  event: "Happened",
};

export const NPC_MEMORY_KIND_HINTS: Record<NpcMemoryKind, string> = {
  revealed: "What they let slip or admitted",
  learned: "What the party told them",
  promise: "Made by them or to them",
  deceived: "A lie told and believed, either way",
  attitude: "How they feel about the party now",
  event: "Something that happened with them",
};

/** The same kinds in the player's voice: the portal speaks as "us". */
export const PLAYER_NPC_MEMORY_KIND_LABELS: Record<NpcMemoryKind, string> = {
  revealed: "Told us",
  learned: "We told them",
  promise: "Promise",
  deceived: "Deception",
  attitude: "Attitude",
  event: "Happened",
};

export interface MemoryGroup<T> {
  /** Null is the group of memories filed under no session. */
  sessionId: string | null;
  memories: T[];
}

/**
 * Memories grouped by the session they belong to. `sessions` arrives newest
 * first (sortSessionLog order) and fixes the group order; inside a group the
 * memories run oldest first, so a conversation reads forward. A memory whose
 * session is not in `sessions` keeps its own group after the known ones, and
 * memories outside any session come last.
 */
export function groupMemoriesBySession<T extends { session_id: string | null; created_at: string }>(
  memories: readonly T[],
  sessions: readonly { id: string }[],
): MemoryGroup<T>[] {
  const bySession = new Map<string | null, T[]>();
  for (const memory of memories) {
    const bucket = bySession.get(memory.session_id);
    if (bucket) bucket.push(memory);
    else bySession.set(memory.session_id, [memory]);
  }
  const oldestFirst = (rows: T[]) => [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  const known = new Set(sessions.map((s) => s.id));
  const order: (string | null)[] = [
    ...sessions.map((s) => s.id),
    ...[...bySession.keys()].filter((id): id is string => id !== null && !known.has(id)),
    null,
  ];
  return order.flatMap((sessionId) => {
    const rows = bySession.get(sessionId);
    return rows ? [{ sessionId, memories: oldestFirst(rows) }] : [];
  });
}

/**
 * Where a new memory files by default: the running session, else the most
 * recent session that was actually played (`log` is newest first), else none.
 */
export function defaultMemorySessionId(
  running: Pick<CampaignSession, "id"> | null,
  log: readonly Pick<CampaignSession, "id" | "started_at" | "played_on">[],
): string | null {
  if (running) return running.id;
  return log.find((s) => s.started_at !== null || s.played_on !== null)?.id ?? null;
}
