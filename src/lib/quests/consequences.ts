import type {
  BroadcastConsequencePayload,
  CalendarEventConsequencePayload,
  FavorConsequencePayload,
  KnowledgeConsequencePayload,
  MilestoneConsequencePayload,
  QuestConsequence,
  QuestConsequenceAction,
  RelationshipShiftConsequencePayload,
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
  grant_knowledge: "Grant knowledge",
  owe_favor: "Owe a favor",
  award_milestone: "Award a milestone",
};

export function isLedgerConsequenceAction(action: QuestConsequenceAction): boolean {
  return QUEST_CONSEQUENCE_LEDGER_ACTIONS.includes(action);
}

/**
 * One line describing what a consequence rule does — `Complete "Kill the
 * dragon"`, or `Calendar event: "The bridge collapses"`. Shared by the rule
 * editors (`QuestPayoffPanel` on a beat, `QuestRulesPanel` on the quest) and the backfill preview
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
  return describeWorldConsequenceAction(row.action, row.action_payload);
}

/** Shown where a payload promised a field and the stored row has none. */
const UNKNOWN_PAYLOAD_FIELD = "???";

/**
 * The half of the sentence that does not need an objective's name — every
 * non-ledger action, plus the ledger verbs as a bare label for callers that
 * have no objective to resolve.
 *
 * A `switch` closed by a `never` assignment rather than an if/else chain,
 * because the chain's fall-through was a real defect: everything that was not
 * `create_calendar_event` rendered as `Broadcast: "…"`, so the two actions
 * added after it — `shift_npc_relationship` (#831) and `unlock_quest` (#836) —
 * both appeared in the rule list as an *empty broadcast*, indistinguishable
 * from a broken one. Two of eight actions described wrongly, with nothing
 * failing. `gates.ts` already used a compiler-enforced map for the same union;
 * this is the same guarantee, so a ninth action cannot repeat it.
 *
 * The casts stay `Partial` on purpose: `action_payload` is jsonb, so a stored
 * row can be missing the field its type promises, and an absent title should
 * read as absent rather than as an empty string.
 */
export function describeWorldConsequenceAction(
  action: QuestConsequenceAction,
  actionPayload: QuestConsequence["action_payload"],
): string {
  switch (action) {
    case "create_calendar_event": {
      const payload = actionPayload as Partial<CalendarEventConsequencePayload>;
      return `Calendar event: "${payload.title || UNKNOWN_PAYLOAD_FIELD}"`;
    }
    case "send_broadcast": {
      const payload = actionPayload as Partial<BroadcastConsequencePayload>;
      return `Broadcast: "${payload.message || UNKNOWN_PAYLOAD_FIELD}"`;
    }
    case "shift_npc_relationship": {
      const payload = actionPayload as Partial<RelationshipShiftConsequencePayload>;
      // Signed, and the sign is the whole point — "shifts a disposition" alone
      // does not tell a DM which way the rule moves it.
      if (typeof payload.step !== "number" || payload.step === 0) {
        return `${QUEST_CONSEQUENCE_ACTION_LABELS[action]} (${UNKNOWN_PAYLOAD_FIELD})`;
      }
      const steps = Math.abs(payload.step) === 1 ? "step" : "steps";
      return `${payload.step > 0 ? "Improve" : "Worsen"} an NPC's disposition by ${Math.abs(payload.step)} ${steps}`;
    }
    case "grant_knowledge": {
      const payload = actionPayload as Partial<KnowledgeConsequencePayload>;
      return `Knowledge: "${payload.text || UNKNOWN_PAYLOAD_FIELD}"`;
    }
    case "owe_favor": {
      const payload = actionPayload as Partial<FavorConsequencePayload>;
      return `Favour owed: "${payload.text || UNKNOWN_PAYLOAD_FIELD}"`;
    }
    case "award_milestone": {
      const payload = actionPayload as Partial<MilestoneConsequencePayload>;
      return `Milestone: "${payload.text || UNKNOWN_PAYLOAD_FIELD}"`;
    }
    case "unlock_quest":
    case "raise":
    case "reveal":
    case "complete":
    case "fail":
      return QUEST_CONSEQUENCE_ACTION_LABELS[action];
    default: {
      // A new action must be described here; this line stops compiling first.
      const unhandled: never = action;
      return unhandled;
    }
  }
}
