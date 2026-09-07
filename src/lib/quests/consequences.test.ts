import { describe, expect, it } from "vitest";
import { describeQuestConsequenceAction, isLedgerConsequenceAction } from "./consequences";
import type { QuestConsequence } from "@/types/quest.types";

const row = (overrides: Partial<QuestConsequence>): Pick<QuestConsequence, "action" | "target_objective_id" | "action_payload"> => ({
  action: "complete",
  target_objective_id: "obj-1",
  action_payload: {},
  ...overrides,
});

describe("isLedgerConsequenceAction", () => {
  it("treats the four objective verbs as ledger actions", () => {
    expect(isLedgerConsequenceAction("raise")).toBe(true);
    expect(isLedgerConsequenceAction("reveal")).toBe(true);
    expect(isLedgerConsequenceAction("complete")).toBe(true);
    expect(isLedgerConsequenceAction("fail")).toBe(true);
  });

  it("treats the two world actions as not ledger actions", () => {
    expect(isLedgerConsequenceAction("create_calendar_event")).toBe(false);
    expect(isLedgerConsequenceAction("send_broadcast")).toBe(false);
  });
});

describe("describeQuestConsequenceAction", () => {
  const objectiveLabel = (id: string | null) => id === "obj-1" ? "Kill the dragon" : "Objective removed";

  it("names the target objective for a ledger verb", () => {
    expect(describeQuestConsequenceAction(row({ action: "complete" }), objectiveLabel))
      .toBe('Complete "Kill the dragon"');
  });

  it("falls back to a removed-objective label when the target no longer resolves", () => {
    expect(describeQuestConsequenceAction(row({ action: "fail", target_objective_id: "gone" }), objectiveLabel))
      .toBe('Fail "Objective removed"');
  });

  it("summarizes a calendar-event world action from its payload title", () => {
    expect(describeQuestConsequenceAction(
      row({ action: "create_calendar_event", target_objective_id: null, action_payload: { title: "The bridge collapses", event_type: "quest" } }),
      objectiveLabel,
    )).toBe('Calendar event: "The bridge collapses"');
  });

  it("summarizes a broadcast world action from its payload message", () => {
    expect(describeQuestConsequenceAction(
      row({ action: "send_broadcast", target_objective_id: null, action_payload: { message: "The cult notices" } }),
      objectiveLabel,
    )).toBe('Broadcast: "The cult notices"');
  });

  // The two actions added after the describer was written (#831, #836). Both
  // fell through its if/else chain to the broadcast branch and rendered as
  // `Broadcast: ""` — an empty, apparently-broken rule — in the rule editor,
  // the backfill preview and the dashboard widget alike. Nothing failed,
  // because no case here had ever named them. Found by the #825 review.
  it("describes a relationship shift by direction and distance, not as a broadcast", () => {
    expect(describeQuestConsequenceAction(
      row({ action: "shift_npc_relationship", target_objective_id: null, action_payload: { step: 2 } }),
      objectiveLabel,
    )).toBe("Improve an NPC's disposition by 2 steps");

    expect(describeQuestConsequenceAction(
      row({ action: "shift_npc_relationship", target_objective_id: null, action_payload: { step: -1 } }),
      objectiveLabel,
    )).toBe("Worsen an NPC's disposition by 1 step");
  });

  it("describes a quest unlock by its own label", () => {
    expect(describeQuestConsequenceAction(
      row({ action: "unlock_quest", target_objective_id: null, action_payload: {} }),
      objectiveLabel,
    )).toBe("Unlock a quest");
  });

  // `action_payload` is jsonb: a row can be missing the field its type
  // promises. An absent value must read as absent rather than as an empty
  // string, which is indistinguishable from a rule someone left blank.
  it("marks a missing payload field rather than rendering an empty one", () => {
    expect(describeQuestConsequenceAction(
      row({ action: "send_broadcast", target_objective_id: null, action_payload: {} }),
      objectiveLabel,
    )).toBe('Broadcast: "???"');
  });
});
