import {
  QUEST_BEAT_KINDS,
  QUEST_BEAT_KIND_LABELS,
  type QuestBeat,
  type QuestBeatAttachmentSummary,
  type QuestBeatEdge,
  type QuestBeatTransition,
  type QuestBeatVisibility,
  type QuestConsequence,
  type QuestConvergeMode,
  type QuestRuntimeState,
} from "@/types/quest.types";
import type { SiteReadiness } from "@/lib/locations/siteReadiness";

/** `QUEST_BEAT_KIND_LABELS` falls back to the raw value for a kind an editor
 *  does not recognise (#780's note: never silently rewrite an unknown kind to
 *  "neutral") — this is that fallback, shared by the beat page's eyebrow, its
 *  identity chips, and `QuestBeatIdentityFields`'s own Kind select (#872). */
export function questBeatKindLabel(kind: string): string {
  return QUEST_BEAT_KIND_LABELS[kind as (typeof QUEST_BEAT_KINDS)[number]] ?? kind;
}

/** The beat page's Visibility row and identity chip, and now
 *  `QuestBeatIdentityFields` (#872) — one copy of both maps rather than a
 *  second one wherever the editor mounts. */
export const QUEST_BEAT_VISIBILITY_LABELS: Record<QuestBeatVisibility, string> = { hidden: "hidden", rumored: "rumored", revealed: "revealed" };
export const QUEST_BEAT_VISIBILITY_CAPTIONS: Record<QuestBeatVisibility, string> = {
  hidden: "Players do not see this beat at all",
  rumored: "Players see the rumour text, not the beat",
  revealed: "Players see the beat itself",
};

/** Top-level block count of a Tiptap doc stored as a JSON string (the format
 *  `RichTextEditor` actually saves — `JSON.stringify(editor.getJSON())`), or
 *  `null` for legacy plain text / anything unparseable. Shared by
 *  `QuestRunBeatCard`'s DM-notes fold row and the beat page's own phone fold
 *  (#872) — a caption that assumed HTML (`<p>` tags) would read every real
 *  beat's content as empty, since none of it is stored that way. */
export function countQuestBeatContentBlocks(content: string | null): number | null {
  if (!content) return null;
  try {
    const doc = JSON.parse(content) as { type?: string; content?: unknown[] };
    if (doc?.type === "doc" && Array.isArray(doc.content)) return doc.content.length;
  } catch {
    // Not Tiptap JSON — legacy plain text, unknown block count.
  }
  return null;
}

export interface QuestBeatLootSummary {
  total: number;
  undispatched: number;
  unclaimed: number;
}

/** The cursor fields a presentation actually reads. A full `QuestRuntimeState`
 *  row satisfies this, and so does a lighter-weight row built off
 *  `QuestRuntimeContext.threads` (`QuestThreadCursor`) for a quest showing
 *  more than one live thread at once — this is the shape both can share. */
export type QuestBeatRuntimeCursor = Pick<QuestRuntimeState, "quest_id" | "thread_id" | "current_beat_id">;

/** What the story flow canvas needs to draw a beat's `site · N rooms` /
 *  `rooms X–Y empty` facts, keyed by `staged_at_location_id`. `unwrittenRooms`
 *  is 1-based positions in the room list's own display order — the same
 *  order `SiteRoomsPanel` numbers them in — so the label reads the way the
 *  DM already sees the room list. */
export interface QuestBeatSiteInput {
  locationId: string;
  name: string;
  roomCount: number;
  unwrittenRooms: number[];
  /** Absent when nobody has fetched this site's regions/doors yet — a beat
   *  staged at a site the DM hasn't opened this session gets no site gap
   *  rather than a false "unbound" one derived from an empty read. */
  readiness?: SiteReadiness;
}

export interface QuestBeatSitePresentation {
  name: string;
  roomCount: number;
  /** Null when every room already has a description. */
  emptyRoomLabel: string | null;
}

/** Collapses consecutive room positions into ranges ("rooms 4–6 empty"); a
 *  scattered set reads as a comma list ("rooms 2, 4–5 empty"). Null input
 *  (nothing unwritten) has nothing to say, so the caller never renders the
 *  chip at all rather than a chip that says "0 empty". */
export function formatUnwrittenRoomsLabel(unwrittenRooms: number[]): string | null {
  if (!unwrittenRooms.length) return null;
  const sorted = [...unwrittenRooms].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0]!;
  let prev = start;
  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current === prev + 1) { prev = current; continue; }
    ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
    if (current !== undefined) { start = current; prev = current; }
  }
  const word = sorted.length === 1 ? "room" : "rooms";
  return `${word} ${ranges.join(", ")} empty`;
}

export type QuestBeatPrepGapKind = "guidance" | "player_copy" | "attachment" | "improv_review" | "connection" | "site";

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
  /** The threads (#853) currently standing at this beat — empty when none is.
   *  A quest can hold several live threads at once, and a converge-all beat
   *  can legitimately be the arrival point for more than one of them before
   *  they merge, so this is a list rather than a single id. */
  currentThreadIds: string[];
  /** `quest_consequences` rows conditioned on arriving at this beat, plus
   *  loot still waiting to be dispatched from it — the story flow's combined
   *  "what this beat gives" count (frame `02 Story flow`). */
  payoffCount: number;
  /** True when a rule on this beat promotes another quest out of `undiscovered`. */
  unlocksQuest: boolean;
  /** `null` unless the beat has two or more incoming routes — a single
   *  incoming route has nothing to converge, so the mode is not worth saying. */
  convergeLabel: QuestConvergeMode | null;
  /** Set when the beat is staged at a location that actually holds rooms —
   *  a location with none is just a place, not yet a site worth a room chip. */
  site: QuestBeatSitePresentation | null;
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
  options: { isDisconnected?: boolean; site?: SiteReadiness } = {},
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
  // A site the party cannot actually be moved through is the same class of
  // gap as a beat with no guidance — the Quest Board already renders
  // `has-gaps` on either (frame 15). Priority mirrors `siteReadiness`'s own
  // caption: an unbound/untraced room is the cheaper fix, so it leads; a site
  // with nothing left to bind but no doors at all still can't move the party.
  if (options.site && (!options.site.bound || !options.site.waysOut)) {
    const detail = options.site.caption ?? "no ways out — the party cannot leave this site";
    gaps.push({ kind: "site", label: detail });
  }
  return gaps;
}

export interface QuestBeatPresentationInput {
  beats: QuestBeat[];
  edges: QuestBeatEdge[];
  attachments: QuestBeatAttachmentSummary[];
  /** One cursor per thread the party has open — several chains, and several
   *  threads within one chain, run at once. */
  runtime?: QuestBeatRuntimeCursor[];
  transitions?: QuestBeatTransition[];
  lootByBeat?: Record<string, QuestBeatLootSummary>;
  /** Only the rules conditioned on arrival (`on_beat_id`) matter here — a
   *  route's own rules are the edge's business, not the node's. */
  consequences?: QuestConsequence[];
  /** Keyed by `staged_at_location_id`. Absent for a beat staged nowhere, or
   *  staged somewhere that has never had its rooms fetched. */
  sites?: Record<string, QuestBeatSiteInput>;
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
  const incomingCountByBeat = new Map<string, number>();
  for (const edge of input.edges) {
    incomingCountByBeat.set(edge.target_beat_id, (incomingCountByBeat.get(edge.target_beat_id) ?? 0) + 1);
  }
  const consequencesByBeat = new Map<string, QuestConsequence[]>();
  for (const consequence of input.consequences ?? []) {
    if (!consequence.on_beat_id) continue;
    const list = consequencesByBeat.get(consequence.on_beat_id) ?? [];
    list.push(consequence);
    consequencesByBeat.set(consequence.on_beat_id, list);
  }
  const visited = new Set((input.transitions ?? []).map((transition) => transition.to_beat_id));
  // Connectivity is a per-quest question. The board passes campaign-wide beats
  // through here, so counting `input.beats` directly would make every quest
  // answer for every other one.
  const flowBeatsPerQuest = new Map<string, number>();
  for (const beat of input.beats) {
    flowBeatsPerQuest.set(beat.quest_id, (flowBeatsPerQuest.get(beat.quest_id) ?? 0) + 1);
  }
  // Reach is only a question once a run is under way, and only for the quests
  // the party is actually in — the board hands this campaign-wide beats, so
  // without the quest check every other quest's beats would read as cut off.
  //
  // Several chains can be live at once (a suspended main quest beside the side
  // quest being walked, or two quests converging on one cave), and a single
  // quest can now hold several live threads at once (#853) — so this is a
  // cursor *per thread*, keyed by quest only to answer "does this quest have a
  // run in progress at all", and each thread's beat contributes its own
  // forward reach.
  const questsWithCursor = new Set<string>();
  const threadIdsByBeat = new Map<string, string[]>();
  for (const row of input.runtime ?? []) {
    if (!row.current_beat_id) continue;
    questsWithCursor.add(row.quest_id);
    const threadIds = threadIdsByBeat.get(row.current_beat_id) ?? [];
    threadIds.push(row.thread_id);
    threadIdsByBeat.set(row.current_beat_id, threadIds);
  }
  const currentBeatIds = new Set(threadIdsByBeat.keys());
  const reachableAhead = new Set<string>();
  for (const beatId of currentBeatIds) {
    for (const id of forwardReachableBeatIds(beatId, input.edges)) reachableAhead.add(id);
  }
  const result: Record<string, QuestBeatPresentation> = {};

  for (const beat of input.beats) {
    const placed = attachments.get(beat.id) ?? [];
    const isDisconnected = (flowBeatsPerQuest.get(beat.quest_id) ?? 0) > 1
      && !connected.has(beat.id);
    const siteInput = beat.staged_at_location_id ? input.sites?.[beat.staged_at_location_id] : undefined;
    // A site with no rooms at all (a tavern staged for a conversation, never
    // meant to be walked) has nothing to be unbound or short a door — mirrors
    // the `roomCount > 0` guard on the `site` presentation field below.
    const prepGaps = deriveQuestBeatPrepGaps(beat, placed, {
      isDisconnected,
      site: siteInput && siteInput.roomCount > 0 ? siteInput.readiness : undefined,
    });
    const loot = input.lootByBeat?.[beat.id] ?? { total: 0, undispatched: 0, unclaimed: 0 };
    const currentThreadIds = threadIdsByBeat.get(beat.id) ?? [];
    const isCurrent = currentThreadIds.length > 0;
    const isVisited = visited.has(beat.id);
    // A staging beat is unwired rather than cut off — calling it "stranded"
    // would report the same fact twice under a scarier name.
    const outsideTheRun = !questsWithCursor.has(beat.quest_id)
      || isDisconnected;
    const reach: QuestBeatReach = isCurrent ? "current"
      : isVisited ? "visited"
      : outsideTheRun ? "unplayed"
      : reachableAhead.has(beat.id) ? "ahead"
      : "stranded";
    const beatConsequences = consequencesByBeat.get(beat.id) ?? [];
    const incomingCount = incomingCountByBeat.get(beat.id) ?? 0;
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
      currentThreadIds,
      payoffCount: beatConsequences.length + loot.undispatched,
      unlocksQuest: beatConsequences.some((consequence) => consequence.action === "unlock_quest"),
      convergeLabel: incomingCount >= 2 ? beat.converge_mode : null,
      site: siteInput && siteInput.roomCount > 0
        ? { name: siteInput.name, roomCount: siteInput.roomCount, emptyRoomLabel: formatUnwrittenRoomsLabel(siteInput.unwrittenRooms) }
        : null,
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
