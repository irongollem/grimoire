import type { QuestObjective, QuestObjectiveStatus } from "@/types/quest.types";

export const QUEST_OBJECTIVE_STATUSES = ["dormant", "pending", "complete", "failed"] as const;

export const QUEST_OBJECTIVE_STATUS_LABELS: Record<QuestObjectiveStatus, string> = {
  dormant: "Not yet raised",
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
 *
 * `dormant` is deliberately not part of this three-way cycle. It has exactly
 * one way out — raised, same as a beat's own `raise` effect — and clicking it
 * takes that one step explicitly below, rather than falling into the cycle by
 * accident. A DM must never be able to click an objective back into `dormant`;
 * that state is set by prep or by a beat closing off a branch, never by a
 * stray click.
 */
export function nextObjectiveStatus(current: QuestObjectiveStatus): QuestObjectiveStatus {
  if (current === "dormant") return "pending";
  return current === "pending" ? "complete" : current === "complete" ? "failed" : "pending";
}

/**
 * `complete` and `failed` are resolved; `dormant` and `pending` are not. Said
 * positively rather than as "anything but pending", because the set of
 * unresolved states has already grown once (`dormant`) and may again — a
 * negation silently mis-classifies every state added after it was written,
 * exactly the bug `dormant` introduced here before this rewrite. #794 builds
 * "quest complete is the whole ledger settling" on top of this predicate.
 */
export function isObjectiveResolved(objective: Pick<QuestObjective, "status">) {
  return objective.status === "complete" || objective.status === "failed";
}

export function countObjectivesComplete(objectives: Array<Pick<QuestObjective, "status">>) {
  return objectives.filter((objective) => objective.status === "complete").length;
}
