import { describeQuestConsequenceAction } from "@/lib/quests/consequences";
import type { QuestBeat, QuestBeatEdge, QuestConsequence } from "@/types/quest.types";

export interface RoutePreview {
  /** The beat the route marks done. */
  doneTitle: string;
  /** Each payoff that fires when the route is taken. */
  payoffs: string[];
  /** Choice routes out of the same beat that become unreachable. */
  cutOff: string[];
  /** A parallel route opens a thread instead of cutting anything off. */
  opensThread: boolean;
}

/**
 * What taking `edge` would do, read the way `mark_quest_move(kind 'route')`
 * does it: the target's arrival rules and the edge's own rules fire, and a
 * choice route closes its sibling choices.
 */
export function previewRoute(input: {
  edge: Pick<QuestBeatEdge, "id" | "source_beat_id" | "target_beat_id" | "route_kind">;
  edges: Pick<QuestBeatEdge, "id" | "source_beat_id" | "target_beat_id" | "route_kind">[];
  beats: Pick<QuestBeat, "id" | "title">[];
  consequences: QuestConsequence[];
  objectiveLabel: (id: string | null) => string;
}): RoutePreview {
  const { edge, edges, beats, consequences, objectiveLabel } = input;
  const titleOf = (id: string) => beats.find((beat) => beat.id === id)?.title || "Untitled beat";
  const payoffs = consequences
    .filter((rule) => rule.on_edge_id === edge.id || (rule.on_beat_id === edge.target_beat_id && rule.on_beat_outcome === "arrived"))
    .map((rule) => describeQuestConsequenceAction(rule, objectiveLabel));
  const cutOff = edge.route_kind === "choice"
    ? edges
      .filter((other) => other.id !== edge.id && other.source_beat_id === edge.source_beat_id && other.route_kind === "choice")
      .map((other) => titleOf(other.target_beat_id))
    : [];
  return { doneTitle: titleOf(edge.target_beat_id), payoffs, cutOff, opensThread: edge.route_kind === "parallel" };
}
