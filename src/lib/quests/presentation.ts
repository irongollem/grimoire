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

export type QuestBeatPrepGapKind = "guidance" | "player_copy" | "attachment" | "improv_review" | "connection";

export interface QuestBeatPrepGap {
  kind: QuestBeatPrepGapKind;
  label: string;
}

export interface QuestBeatPresentation {
  prepGapCount: number;
  prepGaps: QuestBeatPrepGap[];
  handoutCount: number;
  loot: QuestBeatLootSummary;
  isReady: boolean;
  isCurrent: boolean;
  isVisited: boolean;
  isDisconnected: boolean;
}

export function deriveQuestBeatPrepGaps(
  beat: QuestBeat,
  attachments: QuestBeatAttachmentSummary[],
  options: { isDisconnected?: boolean } = {},
): QuestBeatPrepGap[] {
  const gaps: QuestBeatPrepGap[] = [];
  if (!beat.dm_content && !beat.how_it_plays) gaps.push({ kind: "guidance", label: "Add DM guidance" });
  if (beat.visibility === "rumored" && !beat.rumor_text) gaps.push({ kind: "player_copy", label: "Add explicit rumor copy" });
  if (beat.visibility === "revealed" && !beat.reveal_text) gaps.push({ kind: "player_copy", label: "Add explicit reveal copy" });
  for (const attachment of attachments.filter((row) => row.prep_gap)) {
    gaps.push({ kind: "attachment", label: `Replace ${attachment.label}` });
  }
  if (beat.is_improvised && !beat.improv_reviewed_at) gaps.push({ kind: "improv_review", label: "Review improvised beat" });
  if (options.isDisconnected) gaps.push({ kind: "connection", label: "Connect this staging beat to the story flow" });
  return gaps;
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
  // Connectivity is a per-quest question, and the overview beat is quest-level:
  // it is deliberately never wired into the edge graph, so it is neither
  // disconnected itself nor part of the count that decides whether a flow beat
  // has anything to connect to. The board passes campaign-wide beats through
  // here, so counting `input.beats` directly would make every quest answer for
  // every other one.
  const flowBeatsPerQuest = new Map<string, number>();
  for (const beat of input.beats) {
    if (beat.is_overview) continue;
    flowBeatsPerQuest.set(beat.quest_id, (flowBeatsPerQuest.get(beat.quest_id) ?? 0) + 1);
  }
  const result: Record<string, QuestBeatPresentation> = {};

  for (const beat of input.beats) {
    const placed = attachments.get(beat.id) ?? [];
    const isDisconnected = !beat.is_overview
      && (flowBeatsPerQuest.get(beat.quest_id) ?? 0) > 1
      && !connected.has(beat.id);
    const prepGaps = deriveQuestBeatPrepGaps(beat, placed, { isDisconnected });
    const loot = input.lootByBeat?.[beat.id] ?? { total: 0, undispatched: 0, unclaimed: 0 };
    result[beat.id] = {
      prepGapCount: prepGaps.length,
      prepGaps,
      handoutCount: placed.filter((attachment) => attachment.attachment_type === "handout").length,
      loot,
      isReady: prepGaps.length === 0,
      isCurrent: input.runtime?.current_beat_id === beat.id,
      isVisited: visited.has(beat.id),
      isDisconnected,
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
