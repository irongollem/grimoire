import type { QuestBeatEdge } from "@/types/quest.types";

/**
 * A duplicate is now the pair alone: `quest_beat_edges_route_key` (#795) makes
 * `(quest_id, source_beat_id, target_beat_id)` unique in the database, so a
 * second edge between the same two beats can no longer exist under a
 * different label the way it could before — there is no label left to differ
 * on. "Killed him" and "spared him" are two different target beats, not two
 * labels on one pair.
 */
export function isDuplicateQuestEdge(edges: QuestBeatEdge[], sourceBeatId: string, targetBeatId: string) {
  return sourceBeatId === targetBeatId || edges.some((edge) => edge.source_beat_id === sourceBeatId && edge.target_beat_id === targetBeatId);
}
