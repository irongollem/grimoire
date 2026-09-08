import { describe, expect, it } from "vitest";
import { deriveQuestRouteGates, describeQuestRouteEffect, describeQuestRouteGate, questRouteGateLabel } from "./gates";
import type { QuestBeatEdgeGate, QuestObjective, QuestRouteEffect, QuestRouteGate } from "@/types/quest.types";

const objective = (id: string, status: QuestObjective["status"], description = id): QuestObjective => ({
  id, quest_id: "quest", description, status, is_player_visible: false, sort_order: 0,
});

const gate = (edgeId: string, objectiveId: string, status: QuestBeatEdgeGate["status"]): QuestBeatEdgeGate => ({
  edge_id: edgeId, quest_id: "quest", campaign_id: "campaign", objective_id: objectiveId, status,
  created_at: "now", updated_at: "now",
});

describe("deriveQuestRouteGates", () => {
  it("marks a route open when the objective already stands in the required status", () => {
    const gates = deriveQuestRouteGates(
      [gate("e1", "o1", "complete")],
      [objective("o1", "complete", "Save the princess")],
    );
    expect(gates.e1).toEqual({
      objective_id: "o1", objective: "Save the princess",
      required_status: "complete", current_status: "complete", is_open: true,
    });
  });

  it("marks a route closed when the objective has not reached the required status", () => {
    const gates = deriveQuestRouteGates(
      [gate("e1", "o1", "complete")],
      [objective("o1", "pending", "Save the princess")],
    );
    expect(gates.e1!.is_open).toBe(false);
  });

  it("skips a gate whose objective is gone rather than surfacing a dangling reference", () => {
    const gates = deriveQuestRouteGates([gate("e1", "missing", "complete")], []);
    expect(gates.e1).toBeUndefined();
  });

  it("leaves an ungated edge absent from the map entirely", () => {
    const gates = deriveQuestRouteGates([], [objective("o1", "complete")]);
    expect(gates).toEqual({});
  });
});

describe("describeQuestRouteGate", () => {
  const open: QuestRouteGate = { objective_id: "o1", objective: "Save the princess", required_status: "complete", current_status: "complete", is_open: true };
  const closed: QuestRouteGate = { objective_id: "o1", objective: "Save the princess", required_status: "complete", current_status: "pending", is_open: false };

  it("says a route is open and why", () => {
    expect(describeQuestRouteGate(open)).toBe("Open — “Save the princess” is completed");
  });

  it("says a route is closed, the requirement, and the current state — the reason has to be visible", () => {
    expect(describeQuestRouteGate(closed)).toBe("Closed — needs “Save the princess” to be completed, currently open");
  });

  it("names the objective and required status for the canvas pill", () => {
    expect(questRouteGateLabel(open)).toBe("Save the princess · Completed");
  });
});

describe("describeQuestRouteEffect", () => {
  it("describes a ledger verb with its target objective", () => {
    const effect: QuestRouteEffect = { action: "raise", objective: "Carry the news home", after_days: 0 };
    expect(describeQuestRouteEffect(effect)).toBe("Then raises “Carry the news home”");
  });

  it("adds the delay when the effect is not immediate", () => {
    const effect: QuestRouteEffect = { action: "complete", objective: "Save the princess", after_days: 2 };
    expect(describeQuestRouteEffect(effect)).toBe("Then completes “Save the princess” in 2d");
  });

  it("describes a world action with no objective", () => {
    const effect: QuestRouteEffect = { action: "send_broadcast", objective: null, after_days: 0 };
    expect(describeQuestRouteEffect(effect)).toBe("Then sends a broadcast");
  });

  // The three payoff verbs #853 adds (knowledge/favour/milestone) — each
  // needs its own verb here or it falls through to `undefined` in the map.
  it("describes the three payoff verbs", () => {
    expect(describeQuestRouteEffect({ action: "grant_knowledge", objective: null, after_days: 0 }))
      .toBe("Then grants knowledge");
    expect(describeQuestRouteEffect({ action: "owe_favor", objective: null, after_days: 0 }))
      .toBe("Then owes a favor");
    expect(describeQuestRouteEffect({ action: "award_milestone", objective: null, after_days: 0 }))
      .toBe("Then awards a milestone");
  });
});
