import type { QuestBeat, QuestConsequence } from "@/types/quest.types";

/**
 * Which beat brings each objective in: the beat a `raise` rule is attached to
 * (#1194). Only a raise counts. A beat that completes or fails an objective
 * does not "raise" it, and a rule that watches an edge or an objective has no
 * beat to name. The first such rule wins when several beats raise one objective.
 */
export function objectiveSources(
  consequences: readonly QuestConsequence[],
  beats: readonly Pick<QuestBeat, "id" | "title">[],
): Map<string, { id: string; title: string }> {
  const sources = new Map<string, { id: string; title: string }>();
  for (const rule of consequences) {
    if (rule.action !== "raise" || !rule.on_beat_id || !rule.target_objective_id) continue;
    if (sources.has(rule.target_objective_id)) continue;
    const beat = beats.find((candidate) => candidate.id === rule.on_beat_id);
    if (beat) sources.set(rule.target_objective_id, { id: beat.id, title: beat.title || "Untitled beat" });
  }
  return sources;
}
