import type { QuestBeat, QuestBeatEdge, QuestBeatVisibility } from "@/types/quest.types";

/** The three steps of what the players know of a beat, lowest first. */
export const VISIBILITY_STEPS = ["hidden", "rumored", "revealed"] as const satisfies readonly QuestBeatVisibility[];

export function visibilityRank(visibility: QuestBeatVisibility): 0 | 1 | 2 {
  switch (visibility) {
    case "hidden": return 0;
    case "rumored": return 1;
    case "revealed": return 2;
  }
}

export interface VisibilityFloorInput {
  beatId: string;
  /** Beats a live thread's cursor stands on. */
  partyBeatIds: ReadonlySet<string>;
  /** Beats the party has arrived at at any point. */
  reachedBeatIds: ReadonlySet<string>;
  edges: ReadonlyArray<Pick<QuestBeatEdge, "source_beat_id" | "target_beat_id">>;
  secret: QuestBeat["secret"];
}

/**
 * The lowest a DM may set a beat's visibility by hand: a beat the party has
 * stood on cannot be hidden again, and a non-secret beat one route ahead of
 * the party is at least rumored. The DM may raise it, never lower it past this.
 */
export function visibilityFloor(input: VisibilityFloorInput): QuestBeatVisibility {
  const { beatId, partyBeatIds, reachedBeatIds, edges, secret } = input;
  if (partyBeatIds.has(beatId) || reachedBeatIds.has(beatId)) return "revealed";
  if (!secret && edges.some((edge) => edge.target_beat_id === beatId && partyBeatIds.has(edge.source_beat_id))) return "rumored";
  return "hidden";
}

/** The beats a thread's cursor stands on, from the designer's per-thread map. */
export function partyBeatIdsOf(currentBeatIdByThread: Readonly<Record<string, string | null>>): Set<string> {
  return new Set(Object.values(currentBeatIdByThread).filter((id): id is string => id !== null));
}

/** Every beat the party has arrived at, from the quest's transitions. */
export function reachedBeatIdsOf(transitions: ReadonlyArray<{ to_beat_id: string | null }>): Set<string> {
  return new Set(transitions.map((transition) => transition.to_beat_id).filter((id): id is string => id !== null));
}
