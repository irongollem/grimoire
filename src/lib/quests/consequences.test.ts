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
});
