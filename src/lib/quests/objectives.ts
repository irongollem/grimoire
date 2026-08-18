import type { QuestObjective, QuestObjectiveStatus } from "@/types/quest.types";

export const QUEST_OBJECTIVE_STATUSES = ["pending", "complete", "failed"] as const;

export const QUEST_OBJECTIVE_STATUS_LABELS: Record<QuestObjectiveStatus, string> = {
  pending: "Open",
  complete: "Completed",
  failed: "Failed",
};

/**
 * Cycles the DM's manual control: open → completed → failed → open.
 *
 * Failure sits after completion rather than beside it because it is the rarer
 * click and the destructive-sounding one; putting it last means a DM correcting
 * a mis-click passes through it rather than starting on it.
 */
export function nextObjectiveStatus(current: QuestObjectiveStatus): QuestObjectiveStatus {
  return current === "pending" ? "complete" : current === "complete" ? "failed" : "pending";
}

export function isObjectiveResolved(objective: Pick<QuestObjective, "status">) {
  return objective.status !== "pending";
}

export function countObjectivesComplete(objectives: Array<Pick<QuestObjective, "status">>) {
  return objectives.filter((objective) => objective.status === "complete").length;
}
