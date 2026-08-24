import type { Quest, QuestBeatTransition, QuestTransitionKind } from "@/types/quest.types";

/**
 * The "what happened last session" feed for the dashboard (#764).
 *
 * `quest_beat_transitions` is the append-only audit trail every runtime
 * command already writes (supabase/migrations/20260810000001_quest_beat_graph_foundation.sql,
 * widened by 20260810000007_atomic_quest_runtime_navigation.sql to carry
 * denormalized titles), and until now nothing outside Build mode's route
 * highlighting (`visitedRouteEdgeIds`, src/lib/quests/presentation.ts:194)
 * ever read it. Nothing in the app turns a row into a sentence either:
 * `QuestRunPath.vue` prints the destination beat title next to the raw
 * `transition_kind` as an uppercase badge (e.g. "FORWARD"), it never composes
 * a phrase — so there was no existing wording to reuse, and `phraseTransition`
 * below is the first one.
 *
 * The quest join deliberately mirrors `questLoot.ts`: a transition whose
 * quest is gone from the live `quests` list is dropped rather than shown,
 * even though the transition row carries its own `to_quest_title` /
 * `from_quest_title` snapshot — a snapshot is fine for wording but not for a
 * `RouterLink` with nowhere real to land.
 */

export interface QuestActivityRow {
  transitionId: string;
  questId: string;
  questTitle: string;
  /** Already composed into a full sentence — the widget renders it verbatim. */
  summary: string;
  occurredAt: string;
}

const TRANSITION_VERBS: Record<QuestTransitionKind, string> = {
  enter: "Entered",
  forward: "Advanced",
  previous: "Stepped back",
  jump: "Jumped",
  return: "Returned",
  improv: "Improvised",
  pause: "Paused",
  resume: "Resumed",
  end: "Ended",
};

/**
 * One transition, worded as a sentence a DM can read at a glance.
 *
 * `from_beat_title` / `to_beat_title` are snapshotted onto the row at write
 * time (same migration as above), so no separate beat fetch belongs here —
 * only the two title columns the row already carries. Their absence is a
 * *shape*, not a gap to paper over: the table's check constraints only allow
 * a null `to` pair on an "end" transition (the run stopped; there is nowhere
 * it arrived) and a null `from` pair on "enter" (the first beat of a run has
 * nothing before it — verified against the `start` command in
 * supabase/migrations/20260810000007_atomic_quest_runtime_navigation.sql,
 * the only path that can leave `from_beat_id` null). Coercing either to ""
 * would read as "Moved from  to The Camp", which says less than admitting
 * the run started or stopped exactly there.
 */
function phraseTransition(transition: QuestBeatTransition): string {
  const { from_beat_title: from, to_beat_title: to, transition_kind: kind } = transition;
  if (to === null) return `Ended at "${from}"`;
  if (from === null) return `Entered "${to}"`;
  return `${TRANSITION_VERBS[kind]} from "${from}" to "${to}"`;
}

/**
 * Newest-first activity rows, ready for the widget to render with no lookups
 * of its own.
 *
 * `limit` truncates *after* the quest-existence filter rather than the raw
 * transition list: capping first could let a run of transitions pointing at
 * since-deleted quests crowd out real rows, leaving the DM with fewer than
 * `limit` entries even though more were actually available.
 */
export function deriveQuestActivityRows(
  transitions: readonly QuestBeatTransition[],
  quests: readonly Quest[],
  limit = 8,
): QuestActivityRow[] {
  const questsById = new Map(quests.map((quest) => [quest.id, quest]));
  const sorted = [...transitions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const rows: QuestActivityRow[] = [];
  for (const transition of sorted) {
    // Almost every transition's "current quest" is `to_quest_id`; only "end"
    // (the sole kind with a null `to` pair) falls back to `from_quest_id`, the
    // quest whose run just stopped.
    const questId = transition.to_quest_id ?? transition.from_quest_id;
    if (!questId) continue;
    const quest = questsById.get(questId);
    if (!quest) continue;

    rows.push({
      transitionId: transition.id,
      questId,
      questTitle: quest.title || "Untitled Quest",
      summary: phraseTransition(transition),
      occurredAt: transition.created_at,
    });
    if (rows.length >= limit) break;
  }

  return rows;
}
