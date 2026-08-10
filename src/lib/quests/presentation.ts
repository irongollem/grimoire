import type {
  QuestBeat,
  QuestBeatAttachmentSummary,
  QuestBeatEdge,
  QuestBeatTransition,
  QuestRuntimeState,
} from "@/types/quest.types";

export interface QuestBeatLootSummary {
  total: number;
  undispatched: number;
  unclaimed: number;
}

export interface QuestBeatPresentation {
  prepGapCount: number;
  handoutCount: number;
  loot: QuestBeatLootSummary;
  isReady: boolean;
  isCurrent: boolean;
  isVisited: boolean;
  isDisconnected: boolean;
}

export interface QuestBeatPresentationInput {
  beats: QuestBeat[];
  edges: QuestBeatEdge[];
  attachments: QuestBeatAttachmentSummary[];
  runtime?: QuestRuntimeState | null;
  transitions?: QuestBeatTransition[];
  lootByBeat?: Record<string, QuestBeatLootSummary>;
}

/** Shared source for Build, board and Run beat status. It only combines
 * already-batched domain rows; it never fetches or infers player visibility. */
export function deriveQuestBeatPresentations(input: QuestBeatPresentationInput) {
  const attachments = new Map<string, QuestBeatAttachmentSummary[]>();
  for (const attachment of input.attachments) {
    const list = attachments.get(attachment.beat_id) ?? [];
    list.push(attachment);
    attachments.set(attachment.beat_id, list);
  }
  const connected = new Set(input.edges.flatMap((edge) => [edge.source_beat_id, edge.target_beat_id]));
  const visited = new Set((input.transitions ?? []).map((transition) => transition.to_beat_id));
  const result: Record<string, QuestBeatPresentation> = {};

  for (const beat of input.beats) {
    const placed = attachments.get(beat.id) ?? [];
    const prepGapCount = placed.filter((attachment) => attachment.prep_gap).length
      + (beat.is_improvised && !beat.improv_reviewed_at ? 1 : 0);
    const loot = input.lootByBeat?.[beat.id] ?? { total: 0, undispatched: 0, unclaimed: 0 };
    result[beat.id] = {
      prepGapCount,
      handoutCount: placed.filter((attachment) => attachment.attachment_type === "handout").length,
      loot,
      isReady: prepGapCount === 0,
      isCurrent: input.runtime?.current_beat_id === beat.id,
      isVisited: visited.has(beat.id),
      isDisconnected: input.beats.length > 1 && !connected.has(beat.id),
    };
  }
  return result;
}

export function visitedRouteEdgeIds(edges: QuestBeatEdge[], transitions: QuestBeatTransition[]) {
  const traversed = new Set(transitions.flatMap((transition) => transition.from_beat_id
    ? [`${transition.from_beat_id}:${transition.to_beat_id}`]
    : []));
  return new Set(edges.filter((edge) => traversed.has(`${edge.source_beat_id}:${edge.target_beat_id}`)).map((edge) => edge.id));
}
