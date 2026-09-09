import type {
  Quest,
  QuestBeat,
  QuestBeatAttachmentSummary,
  QuestBeatEdge,
  QuestConsequence,
  LootPlacement,
  QuestBeatTransition,
  QuestObjective,
  QuestRef,
  QuestRuntimeState,
  QuestRuntimeStatus,
  QuestThread,
  QuestThreadStatus,
} from "@/types/quest.types";
import { summarizeQuestLootByQuest } from "./loot";
import { deriveQuestBeatPresentations, type QuestBeatPresentation } from "./presentation";

/** Optional summaries keep quests valid while graph data loads: they render without invented
 * beat-only data while flow-enabled quests use one batched campaign query. */
export type QuestBeatSegment = "done" | "here" | "gap" | "upcoming";

/** The shorthand a DM actually types when they pause mid-table — "session 24"
 *  — mirrored from `src/lib/quests/run.ts`'s own `SESSION_NOTE_PATTERN`. Kept
 *  as its own copy rather than an import: that module is the run cockpit's,
 *  which this story does not touch, and the pattern is one line either way. */
const SESSION_NOTE_PATTERN = /session\s*#?\s*(\d+)/i;

/** One thread's own reading of the board (#853) — a quest can hold several at
 *  once, and each walks its own beats independently. */
export interface QuestBoardThreadSummary {
  id: string;
  label: string;
  status: QuestThreadStatus;
  currentBeatTitle: string | null;
  beatSegments: QuestBeatSegment[];
  /** Satisfies `ThreadLike` (`src/lib/quests/threads.ts`) so a card can run
   *  this straight through `threadBadges`/`orderThreads` for its letter and
   *  tone — the same ones the cockpit and the graph assign the same thread,
   *  never chosen locally. Empty for a cursor with no matching `quest_threads`
   *  row (an older export, or a fixture that predates threads). */
  created_at: string;
}

export interface QuestBoardSummary {
  /** The party is in this chain right now. Several quests can be live at once —
   * a paused chain still holds its cursor but is not where the table is.
   * Reads as the first live thread's status (#853) — see `threads` for the rest. */
  isLive: boolean;
  runtimeStatus: QuestRuntimeStatus | null;
  currentBeatTitle: string | null;
  beatSegments: QuestBeatSegment[];
  prepGapCount: number;
  undispatchedLootCount: number;
  unclaimedLootCount: number;
  /** Every thread this quest currently holds (#853). Empty for a quest with
   *  no runtime row at all — the pre-threads, never-started case. */
  threads: QuestBoardThreadSummary[];
  /** How many of `threads` are actually running, not merely paused or waiting. */
  liveThreadCount: number;
  /** The id in `threads` that `runtimeStatus`/`currentBeatTitle`/`beatSegments`
   *  above are actually read from — the first running thread, else the first
   *  cursor's. This is what "Resume run" (story I) hands the cockpit as
   *  `?thread=`: resuming has to land somewhere, and this is the same thread
   *  the rest of the summary already speaks for. Null with no cursor at all. */
  primaryThreadId: string | null;
  /** Every concrete prep gap across this quest's beats, in the same words the
   *  build canvas already uses for them (`deriveQuestBeatPrepGaps`) — one
   *  chip's worth of text per gap, not just the count. */
  prepGaps: string[];
  /** Undispatched loot, or a rule waiting to fire, sitting on a beat the party
   *  has not reached yet — content the DM is ready to hand over the moment
   *  the story gets there. */
  hasPayoffPrepared: boolean;
  /** Titles of other quests a route out of this one has actually landed on
   *  (`quest_beat_transitions`, kind `jump`/`forward`), where the beat it
   *  landed on is a converge-all beat — this quest's own story feeds into
   *  that one. Edges never cross a quest boundary, so this can only be read
   *  off history, never off the graph itself. */
  convergesInto: string[];
  /** The title of the beat whose `unlock_quest` rule promotes this quest out
   *  of `undiscovered`, when that rule's condition names a beat directly.
   *  Null both when no such rule exists and when one does but its condition
   *  is an edge, an objective, or the quest settling — see `heldPayoffCount`. */
  unlockedBy: string | null;
  /** The title of the beat `unlockedBy`'s rule names as this quest's entry
   *  (`quest_consequences.entry_beat_id`, #871) — where the party comes in
   *  through this bridge, rather than at the quest's own rumor beat. Beats of
   *  the *target* quest are in `input.beats` already (everything campaign-wide
   *  is), so this needs no extra fetch. Null both when `unlockedBy` is null
   *  and when the rule names no beat of its own (falls back to the target's
   *  own entry, which this summary does not need to name). */
  entersAt: string | null;
  /** `unlock_quest` rules targeting this quest whose condition is not a bare
   *  beat arrival — an edge, an objective becoming a status, or the source
   *  quest settling — so there is no single beat title to name. Still "held"
   *  payoff: the promotion is prepared and waiting on something else to fire. */
  heldPayoffCount: number;
  /** Set only once a quest has an `end` transition on record. "Session N"
   *  when the transition's own reason names one (the shorthand DMs actually
   *  type — never invented from a date), then whether every thread the quest
   *  ever opened closed or merged, or one was left running/paused/waiting. */
  settledCaption: string | null;
  /** How many of this quest's `quest_objectives` rows are `status: "complete"`
   *  (frame `07 Log`'s featured-card statblock, story I). */
  objectivesDone: number;
  /** Every `quest_objectives` row this quest has, regardless of status. Zero
   *  means the quest has no objectives at all — the featured card renders
   *  nothing for a count with nothing to count. */
  objectivesTotal: number;
}

export interface QuestBoardEntry {
  quest: Quest;
  summary?: QuestBoardSummary;
}

export interface QuestBoardFilters {
  search: string;
  partyOnly: boolean;
  /** Namespaced as `npc:<uuid>`, `location:<uuid>`, or `faction:<uuid>`. */
  entity: string;
  prepGapsOnly: boolean;
  pendingLootOnly: boolean;
}

export interface QuestBoardFilterData {
  refs: QuestRef[];
  summaries?: Record<string, QuestBoardSummary>;
}

export interface QuestBoardFilterCounts {
  party: number;
  prepGaps: number;
  pendingLoot: number;
}

/** A thread's own beat segments — "here" means *this* thread's cursor and
 *  "done" means *this* thread walked there, not any thread's. Frame `07 Log`
 *  draws one spine per thread precisely so a layer opened last session reads
 *  as one beat in, not as far along as Main; two threads standing on
 *  different beats of the same converge target don't both claim every beat
 *  between them either. A transition logged before threads existed
 *  (`thread_id` null) counts for every thread — it was the one cursor. */
function beatSegmentsForThread(
  beats: QuestBeat[],
  presentations: Record<string, QuestBeatPresentation>,
  threadId: string | null,
  visitedByThread: Map<string | null, Set<string>>,
): QuestBeatSegment[] {
  const own = visitedByThread.get(threadId);
  const shared = visitedByThread.get(null);
  return beats.map((beat) => {
    const presentation = presentations[beat.id];
    if (threadId && presentation?.currentThreadIds.includes(threadId)) return "here";
    if (own?.has(beat.id) || shared?.has(beat.id)) return "done";
    if (presentation && !presentation.isReady) return "gap";
    return "upcoming";
  });
}

function visitedBeatsByThread(transitions: readonly QuestBeatTransition[]): Map<string | null, Set<string>> {
  const byThread = new Map<string | null, Set<string>>();
  for (const transition of transitions) {
    if (!transition.to_beat_id) continue;
    const set = byThread.get(transition.thread_id) ?? new Set<string>();
    set.add(transition.to_beat_id);
    byThread.set(transition.thread_id, set);
  }
  return byThread;
}

export function deriveQuestBoardSummaries(input: {
  beats: QuestBeat[];
  edges: QuestBeatEdge[];
  attachments: QuestBeatAttachmentSummary[];
  loot: LootPlacement[];
  runtime?: QuestRuntimeState[];
  transitions?: QuestBeatTransition[];
  /** `quest_threads` rows, for a thread's label and status (#853). A cursor
   *  with no matching row here — an older export, or a fixture that predates
   *  threads — still gets a summary, labelled "Main" and read as live. */
  threads?: QuestThread[];
  /** `quest_consequences` rows for the whole campaign — a rule's `on_beat_id`
   *  and its `target_quest_id` routinely belong to two different quests
   *  (that is the entire point of `unlock_quest`), so this cannot be scoped
   *  to one quest's own beats the way `attachments`/`loot` are. */
  consequences?: QuestConsequence[];
  /** `quest_objectives` rows for the campaign (frame `07 Log`'s featured-card
   *  statblock, story I). `quest_objectives` carries no `campaign_id` of its
   *  own, so the caller scopes this through the `quests` embed the same way
   *  `consequences` does. */
  objectives?: Pick<QuestObjective, "id" | "quest_id" | "status">[];
}) {
  const lootByQuest = summarizeQuestLootByQuest(input.loot);
  const presentations = deriveQuestBeatPresentations(input);
  const runtimeByQuest = new Map<string, QuestRuntimeState[]>();
  for (const row of input.runtime ?? []) {
    if (!row.current_beat_id) continue;
    const rows = runtimeByQuest.get(row.quest_id) ?? [];
    rows.push(row);
    runtimeByQuest.set(row.quest_id, rows);
  }
  const threadById = new Map((input.threads ?? []).map((thread) => [thread.id, thread]));
  const visitedByThread = visitedBeatsByThread(input.transitions ?? []);
  const threadsByQuest = new Map<string, QuestThread[]>();
  for (const thread of input.threads ?? []) {
    const list = threadsByQuest.get(thread.quest_id) ?? [];
    list.push(thread);
    threadsByQuest.set(thread.quest_id, list);
  }
  const beatById = new Map(input.beats.map((beat) => [beat.id, beat]));
  const objectivesByQuest = new Map<string, Pick<QuestObjective, "id" | "quest_id" | "status">[]>();
  for (const objective of input.objectives ?? []) {
    const list = objectivesByQuest.get(objective.quest_id) ?? [];
    list.push(objective);
    objectivesByQuest.set(objective.quest_id, list);
  }
  // `unlock_quest` is the only consequence action a quest reads for itself
  // rather than for one of its own beats — the rule lives on whichever beat
  // (in whichever quest) raises it, and only its `target_quest_id` says which
  // quest it promotes.
  const unlockRulesByTargetQuest = new Map<string, QuestConsequence[]>();
  for (const consequence of input.consequences ?? []) {
    if (consequence.action !== "unlock_quest" || !consequence.target_quest_id) continue;
    const list = unlockRulesByTargetQuest.get(consequence.target_quest_id) ?? [];
    list.push(consequence);
    unlockRulesByTargetQuest.set(consequence.target_quest_id, list);
  }
  const questIds = new Set(input.beats.map((beat) => beat.quest_id));
  // A room-homed row (#830) carries no quest_id — it belongs to no quest's
  // board summary, so it must not be added as a bogus quest id here.
  for (const row of input.loot) if (row.quest_id) questIds.add(row.quest_id);
  // An undiscovered quest waiting on an unlock rule can hold zero beats (the
  // "no beats yet" card, story I) — its only foothold in this campaign-wide
  // data is the rule that names it as a target, so that has to seed a summary
  // too or `unlockedBy`/`heldPayoffCount` would have nowhere to land.
  for (const consequence of input.consequences ?? []) {
    if (consequence.target_quest_id) questIds.add(consequence.target_quest_id);
  }
  const result: Record<string, QuestBoardSummary> = {};

  for (const questId of questIds) {
    const beats = input.beats.filter((beat) => beat.quest_id === questId);
    const cursors = runtimeByQuest.get(questId) ?? [];
    const loot = lootByQuest[questId] ?? { undispatched: 0, unclaimed: 0 };

    const threads: QuestBoardThreadSummary[] = cursors.map((cursor) => {
      const current = beats.find((beat) => beat.id === cursor.current_beat_id) ?? null;
      const thread = threadById.get(cursor.thread_id);
      return {
        id: cursor.thread_id,
        label: thread?.label ?? "Main",
        status: thread?.status ?? "live",
        currentBeatTitle: current?.title ?? null,
        beatSegments: beatSegmentsForThread(beats, presentations, cursor.thread_id, visitedByThread),
        created_at: thread?.created_at ?? "",
      };
    });
    const liveThreadCount = cursors.filter((cursor) => cursor.status === "running").length;
    // Kept as the first live thread's for now (#853) — a running one if any
    // thread has one, else whichever cursor came first. Every other thread's
    // own reading lives in `threads`.
    const primaryCursor = cursors.find((cursor) => cursor.status === "running") ?? cursors[0] ?? null;
    const primary = threads.find((thread) => thread.id === primaryCursor?.thread_id) ?? null;

    const prepGaps = beats.flatMap((beat) => (presentations[beat.id]?.prepGaps ?? []).map((gap) => gap.label));
    const hasPayoffPrepared = loot.undispatched > 0 || beats.some((beat) => {
      const presentation = presentations[beat.id];
      return presentation !== undefined && !presentation.isVisited && presentation.payoffCount > 0;
    });

    // A route never crosses a quest boundary (the edge FK ties both ends to
    // the same `quest_id`), so the only record of one story feeding into
    // another is a transition that actually walked there — a `jump`/`forward`
    // row whose `from_quest_id` is this quest and whose `to_quest_id` is not.
    const convergesInto = [...new Set(
      (input.transitions ?? [])
        .filter((transition) => transition.from_quest_id === questId
          && transition.to_quest_id
          && transition.to_quest_id !== questId
          && transition.to_beat_id
          && beatById.get(transition.to_beat_id)?.converge_mode === "all")
        .map((transition) => transition.to_quest_title)
        .filter((title): title is string => !!title),
    )];

    const unlockRules = unlockRulesByTargetQuest.get(questId) ?? [];
    const namedUnlockRule = unlockRules.find((rule) => rule.on_beat_id);
    const unlockedBy = namedUnlockRule?.on_beat_id
      ? beatById.get(namedUnlockRule.on_beat_id)?.title ?? null
      : null;
    const entersAt = namedUnlockRule?.entry_beat_id
      ? beatById.get(namedUnlockRule.entry_beat_id)?.title ?? null
      : null;
    const heldPayoffCount = unlockRules.filter((rule) => !rule.on_beat_id).length;

    // "Session N" only when the DM's own end-of-run reason names one — the
    // shorthand actually typed at the table (`SESSION_NOTE_PATTERN`). Never a
    // date stood in for a session number nobody gave.
    const endTransition = (input.transitions ?? [])
      .filter((transition) => transition.transition_kind === "end"
        && (transition.from_quest_id === questId || transition.to_quest_id === questId))
      .at(-1) ?? null;
    const objectives = objectivesByQuest.get(questId) ?? [];
    const objectivesDone = objectives.filter((objective) => objective.status === "complete").length;

    let settledCaption: string | null = null;
    if (endTransition) {
      const threadsForQuest = threadsByQuest.get(questId) ?? [];
      const everyThreadWrappedUp = threadsForQuest.every((thread) => thread.status === "closed" || thread.status === "merged");
      const ledgerNote = everyThreadWrappedUp ? "ledger settled" : "one thread closed unfinished";
      const sessionMatch = endTransition.reason ? SESSION_NOTE_PATTERN.exec(endTransition.reason) : null;
      settledCaption = sessionMatch ? `Session ${sessionMatch[1]} · ${ledgerNote}` : ledgerNote;
    }

    result[questId] = {
      isLive: liveThreadCount > 0,
      runtimeStatus: primaryCursor?.status ?? null,
      currentBeatTitle: primary?.currentBeatTitle ?? null,
      beatSegments: primary?.beatSegments ?? beatSegmentsForThread(beats, presentations, null, visitedByThread),
      prepGapCount: beats.reduce((total, beat) => total + (presentations[beat.id]?.prepGapCount ?? 0), 0),
      undispatchedLootCount: loot.undispatched,
      unclaimedLootCount: loot.unclaimed,
      threads,
      liveThreadCount,
      primaryThreadId: primaryCursor?.thread_id ?? null,
      prepGaps,
      hasPayoffPrepared,
      convergesInto,
      unlockedBy,
      entersAt,
      heldPayoffCount,
      settledCaption,
      objectivesDone,
      objectivesTotal: objectives.length,
    };
  }
  return result;
}

/**
 * One filter pipeline for list and board views. Beat-only filters deliberately
 * become no-ops while summaries are unavailable: hiding every quest would
 * be a much worse failure mode than temporarily withholding the filter control.
 */
export function filterQuestBoard(
  quests: Quest[],
  filters: QuestBoardFilters,
  data: QuestBoardFilterData,
): Quest[] {
  const query = filters.search.trim().toLowerCase();
  const [entityType, entityId] = filters.entity.split(":", 2);
  const refsByQuest = new Map<string, QuestRef[]>();
  for (const ref of data.refs) {
    const list = refsByQuest.get(ref.quest_id) ?? [];
    list.push(ref);
    refsByQuest.set(ref.quest_id, list);
  }

  return quests.filter((quest) => {
    if (query && !(
      quest.title.toLowerCase().includes(query) ||
      quest.summary?.toLowerCase().includes(query) ||
      quest.tags.some((tag) => tag.toLowerCase().includes(query))
    )) return false;

    if (filters.partyOnly && !(quest.player_visible_to?.length)) return false;

    if (entityType && entityId) {
      const primaryMatch =
        (entityType === "npc" && quest.giver_npc_id === entityId) ||
        (entityType === "location" && quest.location_id === entityId);
      const refMatch = (refsByQuest.get(quest.id) ?? []).some(
        (ref) => ref.ref_type === entityType && ref.ref_id === entityId,
      );
      if (!primaryMatch && !refMatch) return false;
    }

    const summary = data.summaries?.[quest.id];
    if (filters.prepGapsOnly && data.summaries && !(summary?.prepGapCount)) return false;
    if (filters.pendingLootOnly && data.summaries && !(
      summary?.undispatchedLootCount || summary?.unclaimedLootCount
    )) return false;

    return true;
  });
}

/** Facet counts keep every other active filter and turn the counted facet on.
 * This makes each badge answer "how many results would this add/retain now?"
 * without additional queries or per-card work. */
export function countQuestBoardFilters(
  quests: Quest[],
  filters: QuestBoardFilters,
  data: QuestBoardFilterData,
): QuestBoardFilterCounts {
  const countWith = (patch: Partial<QuestBoardFilters>) => filterQuestBoard(
    quests,
    { ...filters, ...patch },
    data,
  ).length;
  return {
    party: countWith({ partyOnly: true }),
    prepGaps: countWith({ prepGapsOnly: true }),
    pendingLoot: countWith({ pendingLootOnly: true }),
  };
}
