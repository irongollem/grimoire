import type { QuestBeatEdge, QuestConvergeMode } from "@/types/quest.types";

/**
 * Whether a beat's "when threads arrive" choice means anything (#1011): it has
 * at least one incoming route and the quest has a parallel route somewhere,
 * i.e. more than one thread can be open at once. A quest of only choices has
 * one cursor and nothing to wait for.
 */
export function convergeMatters(
  beatId: string,
  edges: ReadonlyArray<Pick<QuestBeatEdge, "target_beat_id" | "route_kind">>,
): boolean {
  const incoming = edges.some((edge) => edge.target_beat_id === beatId);
  return incoming && edges.some((edge) => edge.route_kind === "parallel");
}

export const CONVERGE_OPTIONS: ReadonlyArray<{ value: QuestConvergeMode; label: string }> = [
  { value: "any", label: "Each runs on" },
  { value: "all", label: "Wait for the others" },
];

export const CONVERGE_EXPLANATIONS: Record<QuestConvergeMode, string> = {
  any: "Every thread that arrives here carries on by itself.",
  all: "A thread that arrives waits while another open thread could still reach this beat. Once none can, they merge and the beat's rules fire once.",
};
