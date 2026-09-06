import type {
  BroadcastConsequencePayload,
  CalendarEventConsequencePayload,
  QuestConsequence,
  QuestConsequenceAction,
} from "@/types/quest.types";
import { QUEST_CONSEQUENCE_LEDGER_ACTIONS } from "@/types/quest.types";

export const QUEST_CONSEQUENCE_ACTION_LABELS: Record<QuestConsequenceAction, string> = {
  raise: "Raise",
  reveal: "Reveal to players",
  complete: "Complete",
  fail: "Fail",
  create_calendar_event: "Create calendar event",
  send_broadcast: "Send broadcast",
  shift_npc_relationship: "Shift an NPC's disposition",
  unlock_quest: "Unlock a quest",
};

export function isLedgerConsequenceAction(action: QuestConsequenceAction): boolean {
  return QUEST_CONSEQUENCE_LEDGER_ACTIONS.includes(action);
}

/**
 * One line describing what a consequence rule does — `Complete "Kill the
 * dragon"`, or `Calendar event: "The bridge collapses"`. Shared by the rule
 * editor (`QuestConsequencesPanel`) and the backfill preview
 * (`QuestBackfillPanel`, #796), which both need to turn a `quest_consequences`
 * row into the same sentence a DM reads at a glance — extracted rather than
 * grown a second time, since the two already differ only in how they resolve
 * `objectiveLabel`.
 */
export function describeQuestConsequenceAction(
  row: Pick<QuestConsequence, "action" | "target_objective_id" | "action_payload">,
  objectiveLabel: (id: string | null) => string,
): string {
  if (isLedgerConsequenceAction(row.action)) {
    return `${QUEST_CONSEQUENCE_ACTION_LABELS[row.action]} "${objectiveLabel(row.target_objective_id)}"`;
  }
  if (row.action === "create_calendar_event") {
    const payload = row.action_payload as CalendarEventConsequencePayload;
    return `Calendar event: "${payload.title ?? ""}"`;
  }
  const payload = row.action_payload as BroadcastConsequencePayload;
  return `Broadcast: "${payload.message ?? ""}"`;
}
