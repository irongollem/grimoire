import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

export async function createBeatWithRollback(
  createBeat: () => Promise<QuestBeat>,
  createEdge: ((beat: QuestBeat) => Promise<QuestBeatEdge>) | null,
  rollbackBeat: (beat: QuestBeat) => Promise<unknown>,
) {
  const beat = await createBeat();
  if (!createEdge) return beat;
  try {
    await createEdge(beat);
    return beat;
  } catch (error) {
    try {
      await rollbackBeat(beat);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "Link failed and the unlinked beat could not be rolled back. Retry deletion from the graph.");
    }
    throw error;
  }
}

export function isDuplicateQuestEdge(edges: QuestBeatEdge[], sourceBeatId: string, targetBeatId: string) {
  return sourceBeatId === targetBeatId || edges.some((edge) => edge.source_beat_id === sourceBeatId && edge.target_beat_id === targetBeatId && !edge.label);
}
