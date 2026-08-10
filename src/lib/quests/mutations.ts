import type { QuestBeatEdge } from "@/types/quest.types";

export function isDuplicateQuestEdge(edges: QuestBeatEdge[], sourceBeatId: string, targetBeatId: string) {
  return sourceBeatId === targetBeatId || edges.some((edge) => edge.source_beat_id === sourceBeatId && edge.target_beat_id === targetBeatId && !edge.label);
}
