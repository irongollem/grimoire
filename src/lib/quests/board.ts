import type {
  Quest,
  QuestBeat,
  QuestBeatAttachmentSummary,
  QuestBeatEdge,
  LootPlacement,
  QuestBeatTransition,
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

/** One thread's own reading of the board (#853) — a quest can hold several at
 *  once, and each walks its own beats independently. */
export interface QuestBoardThreadSummary {
  id: string;
  label: string;
  status: QuestThreadStatus;
  currentBeatTitle: string | null;
  beatSegments: QuestBeatSegment[];
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

/** A thread's own beat segments — "here" means *this* thread's cursor, not any
 *  thread's, so two threads standing on different beats of the same converge
 *  target don't both claim every beat between them. */
function beatSegmentsForThread(
  beats: QuestBeat[],
  presentations: Record<string, QuestBeatPresentation>,
  threadId: string | null,
): QuestBeatSegment[] {
  return beats.map((beat) => {
    const presentation = presentations[beat.id];
    if (threadId && presentation?.currentThreadIds.includes(threadId)) return "here";
    if (presentation?.isVisited) return "done";
    if (presentation && !presentation.isReady) return "gap";
    return "upcoming";
  });
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
  const questIds = new Set(input.beats.map((beat) => beat.quest_id));
  // A room-homed row (#830) carries no quest_id — it belongs to no quest's
  // board summary, so it must not be added as a bogus quest id here.
  for (const row of input.loot) if (row.quest_id) questIds.add(row.quest_id);
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
        beatSegments: beatSegmentsForThread(beats, presentations, cursor.thread_id),
      };
    });
    const liveThreadCount = cursors.filter((cursor) => cursor.status === "running").length;
    // Kept as the first live thread's for now (#853) — a running one if any
    // thread has one, else whichever cursor came first. Every other thread's
    // own reading lives in `threads`.
    const primaryCursor = cursors.find((cursor) => cursor.status === "running") ?? cursors[0] ?? null;
    const primary = threads.find((thread) => thread.id === primaryCursor?.thread_id) ?? null;

    result[questId] = {
      isLive: liveThreadCount > 0,
      runtimeStatus: primaryCursor?.status ?? null,
      currentBeatTitle: primary?.currentBeatTitle ?? null,
      beatSegments: primary?.beatSegments ?? beatSegmentsForThread(beats, presentations, null),
      prepGapCount: beats.reduce((total, beat) => total + (presentations[beat.id]?.prepGapCount ?? 0), 0),
      undispatchedLootCount: loot.undispatched,
      unclaimedLootCount: loot.unclaimed,
      threads,
      liveThreadCount,
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
