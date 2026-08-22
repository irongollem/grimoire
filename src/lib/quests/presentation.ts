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

/**
 * Where a beat stands relative to the party, which is a different question from
 * whether it is *prepared* (`isReady`) or *wired up* (`isDisconnected`).
 *
 * `stranded` is the one that needs saying out loud: the beat is properly
 * connected and properly prepared, and the run has simply walked past the last
 * junction that could still have led to it. That is invisible on a graph — the
 * edge into it looks exactly as it did before — so without this the DM keeps
 * preparing material the party can no longer arrive at.
 */
export type QuestBeatReach = "current" | "visited" | "ahead" | "stranded" | "unplayed";

export interface QuestBeatPresentation {
  prepGapCount: number;
  prepGaps: QuestBeatPrepGap[];
  handoutCount: number;
  loot: QuestBeatLootSummary;
  isReady: boolean;
  isCurrent: boolean;
  isVisited: boolean;
  isDisconnected: boolean;
  reach: QuestBeatReach;
}

export interface QuestReachTally {
  visited: number;
  ahead: number;
  stranded: number;
}

/**
 * Every beat still arrivable from `startId` by following edges forward.
 *
 * `startId` itself lands in the set only when a cycle leads back to it, which is
 * the honest answer to "can the party get here again" — and it is why this is a
 * graph walk rather than a `visited` lookup: a loop back through an earlier beat
 * genuinely re-opens the branches hanging off it.
 */
export function forwardReachableBeatIds(startId: string, edges: QuestBeatEdge[]): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = adjacency.get(edge.source_beat_id) ?? [];
    targets.push(edge.target_beat_id);
    adjacency.set(edge.source_beat_id, targets);
  }
  const reachable = new Set<string>();
  const queue = [startId];
  while (queue.length) {
    for (const next of adjacency.get(queue.shift()!) ?? []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }
  return reachable;
}

export function tallyQuestReach(presentations: Record<string, QuestBeatPresentation>): QuestReachTally {
  const tally: QuestReachTally = { visited: 0, ahead: 0, stranded: 0 };
  for (const presentation of Object.values(presentations)) {
    if (presentation.reach === "visited" || presentation.reach === "current") tally.visited += 1;
    else if (presentation.reach === "ahead") tally.ahead += 1;
    else if (presentation.reach === "stranded") tally.stranded += 1;
  }
  return tally;
}

export function deriveQuestBeatPrepGaps(
  beat: QuestBeat,
  attachments: QuestBeatAttachmentSummary[],
  options: { isDisconnected?: boolean } = {},
): QuestBeatPrepGap[] {
  const gaps: QuestBeatPrepGap[] = [];
  if (!beat.dm_content && !beat.how_it_plays) gaps.push({ kind: "guidance", label: "Add DM guidance" });
  if (beat.visibility === "rumored" && !beat.rumor_text) gaps.push({ kind: "player_copy", label: "Add explicit rumor copy" });
  // Named for the consequence: the player thread drops a revealed beat that has
  // no copy rather than printing a card that says nothing, so this gap is the
  // only place the DM learns the reveal produced nothing at the table.
  if (beat.visibility === "revealed" && !beat.reveal_text) gaps.push({ kind: "player_copy", label: "Add reveal copy — players see nothing without it" });
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
  /** One cursor per quest the party has open — several chains run at once. */
  runtime?: QuestRuntimeState[];
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
  // Reach is only a question once a run is under way, and only for the quests
  // the party is actually in — the board hands this campaign-wide beats, so
  // without the quest check every other quest's beats would read as cut off.
  //
  // Several chains can be live at once (a suspended main quest beside the side
  // quest being walked, or two quests converging on one cave), so this is a
  // cursor *per quest* and each one contributes its own forward reach.
  const cursorByQuest = new Map<string, string>();
  for (const row of input.runtime ?? []) {
    if (row.current_beat_id) cursorByQuest.set(row.quest_id, row.current_beat_id);
  }
  const currentBeatIds = new Set(cursorByQuest.values());
  const reachableAhead = new Set<string>();
  for (const beatId of cursorByQuest.values()) {
    for (const id of forwardReachableBeatIds(beatId, input.edges)) reachableAhead.add(id);
  }
  const result: Record<string, QuestBeatPresentation> = {};

  for (const beat of input.beats) {
    const placed = attachments.get(beat.id) ?? [];
    const isDisconnected = !beat.is_overview
      && (flowBeatsPerQuest.get(beat.quest_id) ?? 0) > 1
      && !connected.has(beat.id);
    const prepGaps = deriveQuestBeatPrepGaps(beat, placed, { isDisconnected });
    const loot = input.lootByBeat?.[beat.id] ?? { total: 0, undispatched: 0, unclaimed: 0 };
    const isCurrent = currentBeatIds.has(beat.id);
    const isVisited = visited.has(beat.id);
    // A staging beat is unwired rather than cut off, and the overview beat is
    // quest-level and deliberately outside the graph: calling either "stranded"
    // would report the same fact twice under a scarier name.
    const outsideTheRun = !cursorByQuest.has(beat.quest_id)
      || beat.is_overview
      || isDisconnected;
    const reach: QuestBeatReach = isCurrent ? "current"
      : isVisited ? "visited"
      : outsideTheRun ? "unplayed"
      : reachableAhead.has(beat.id) ? "ahead"
      : "stranded";
    result[beat.id] = {
      prepGapCount: prepGaps.length,
      prepGaps,
      handoutCount: placed.filter((attachment) => attachment.attachment_type === "handout").length,
      loot,
      isReady: prepGaps.length === 0,
      isCurrent,
      isVisited,
      isDisconnected,
      reach,
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
