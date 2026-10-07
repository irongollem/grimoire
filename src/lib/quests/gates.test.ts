import { describe, expect, it } from "vitest";
import { deriveQuestRouteGates, describeQuestRouteEffect, describeQuestRouteGate, describeQuestRouteGateLines, describeQuestRouteNeeds, draftRouteGate, planGateWrites, questRouteGateLabel, validateGateDrafts } from "./gates";
import type { QuestBeatEdgeGate, QuestObjective, QuestRouteEffect, QuestRouteGate } from "@/types/quest.types";

const objective = (id: string, status: QuestObjective["status"], description = id): QuestObjective => ({
  id, quest_id: "quest", description, status, is_player_visible: false, sort_order: 0, due_year: null, due_month: null, due_day: null,
});

const gate = (edgeId: string, objectiveId: string, statuses: QuestBeatEdgeGate["statuses"]): QuestBeatEdgeGate => ({
  id: `${edgeId}-${objectiveId}`, edge_id: edgeId, quest_id: "quest", campaign_id: "campaign", objective_id: objectiveId, statuses,
  created_at: "now", updated_at: "now",
});

const edge = (id: string, gate_mode: "all" | "any" = "all") => ({ id, gate_mode });

describe("deriveQuestRouteGates", () => {
  it("marks a route open when the objective already stands in an accepted status", () => {
    const gates = deriveQuestRouteGates(
      [gate("e1", "o1", ["complete"])],
      [objective("o1", "complete", "Save the princess")],
      [edge("e1")],
    );
    expect(gates.e1).toEqual({
      mode: "all",
      is_open: true,
      conditions: [{ objective_id: "o1", objective: "Save the princess", statuses: ["complete"], current_status: "complete", met: true }],
    });
  });

  it("marks a route closed when the objective has not reached an accepted status", () => {
    const gates = deriveQuestRouteGates([gate("e1", "o1", ["complete"])], [objective("o1", "pending")], [edge("e1")]);
    expect(gates.e1!.is_open).toBe(false);
  });

  it("accepts any status of a set", () => {
    const gates = deriveQuestRouteGates([gate("e1", "o1", ["pending", "complete"])], [objective("o1", "pending")], [edge("e1")]);
    expect(gates.e1!.is_open).toBe(true);
  });

  it("needs every condition under all, and one under any", () => {
    const rows = [gate("e1", "o1", ["complete"]), gate("e1", "o2", ["failed"])];
    const objectives = [objective("o1", "complete"), objective("o2", "pending")];
    expect(deriveQuestRouteGates(rows, objectives, [edge("e1", "all")]).e1!.is_open).toBe(false);
    expect(deriveQuestRouteGates(rows, objectives, [edge("e1", "any")]).e1!.is_open).toBe(true);
  });

  it("skips a condition whose objective is gone, and the route with it when none are left", () => {
    expect(deriveQuestRouteGates([gate("e1", "missing", ["complete"])], [], [edge("e1")]).e1).toBeUndefined();
    const partial = deriveQuestRouteGates(
      [gate("e1", "missing", ["complete"]), gate("e1", "o1", ["complete"])],
      [objective("o1", "complete")],
      [edge("e1")],
    );
    expect(partial.e1!.conditions).toHaveLength(1);
  });

  it("leaves an ungated edge absent from the map entirely", () => {
    expect(deriveQuestRouteGates([], [objective("o1", "complete")], [edge("e1")])).toEqual({});
  });
});

describe("describeQuestRouteGate", () => {
  const cond = (objectiveName: string, statuses: QuestRouteGate["conditions"][number]["statuses"], current: QuestRouteGate["conditions"][number]["current_status"]) => ({
    objective_id: objectiveName, objective: objectiveName, statuses, current_status: current, met: statuses.includes(current),
  });
  const open: QuestRouteGate = { mode: "all", is_open: true, conditions: [cond("Save the princess", ["complete"], "complete")] };
  const closed: QuestRouteGate = { mode: "all", is_open: false, conditions: [cond("Save the princess", ["complete"], "pending")] };

  it("says a route is open and why", () => {
    expect(describeQuestRouteGate(open)).toBe("Open: “Save the princess” is completed");
  });

  it("says a route is closed, the requirement, and the current state", () => {
    expect(describeQuestRouteGate(closed)).toBe("Closed: needs “Save the princess” completed; “Save the princess” is open");
  });

  it("reads a status set and several conditions naturally", () => {
    const trust: QuestRouteGate = { mode: "all", is_open: false, conditions: [cond("Keep Char's trust", ["pending", "complete"], "failed")] };
    expect(describeQuestRouteNeeds(trust)).toBe("needs “Keep Char's trust” open or completed");
    const both: QuestRouteGate = { mode: "all", is_open: false, conditions: [cond("A", ["complete"], "pending"), cond("B", ["failed"], "pending")] };
    expect(describeQuestRouteNeeds(both)).toBe("needs “A” completed and “B” failed");
    expect(describeQuestRouteNeeds({ ...both, mode: "any" })).toBe("needs “A” completed or “B” failed");
  });

  it("names the objective and statuses for the canvas pill, or the count for several", () => {
    expect(questRouteGateLabel(open)).toBe("Save the princess · completed");
    expect(questRouteGateLabel({ mode: "any", is_open: false, conditions: [cond("A", ["complete"], "pending"), cond("B", ["failed"], "pending")] })).toBe("2 conditions · any");
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
    expect(describeQuestRouteEffect({ action: "give_handout", objective: null, after_days: 0 }))
      .toBe("Then gives a handout");
    expect(describeQuestRouteEffect({ action: "tick_clock", objective: null, after_days: 0 })).toBe("Then ticks");
    expect(describeQuestRouteEffect({ action: "shift_faction_standing", objective: null, after_days: 0 })).toBe("Then shifts standing");
  });
});

describe("route gate drafts", () => {
  const draft = (key: string, gateId: string | null, objectiveId: string, statuses: QuestBeatEdgeGate["statuses"]) => ({ key, gateId, objectiveId, statuses });
  const row = (id: string, objectiveId: string, statuses: QuestBeatEdgeGate["statuses"]): QuestBeatEdgeGate => ({ ...gate("e1", objectiveId, statuses), id });

  it("previews the gate a draft would make, ignoring unfinished conditions", () => {
    const objectives = [objective("o1", "pending", "One"), objective("o2", "failed", "Two")];
    const preview = draftRouteGate([draft("a", null, "o1", ["pending"]), draft("b", null, "", ["failed"]), draft("c", null, "o2", [])], "all", objectives);
    expect(preview?.conditions.map((condition) => condition.objective)).toEqual(["One"]);
    expect(preview?.is_open).toBe(true);
    expect(draftRouteGate([], "all", objectives)).toBeNull();
  });

  it("rejects an unfinished, empty or repeated condition", () => {
    expect(validateGateDrafts([draft("a", null, "", ["pending"])])).toMatch(/objective/);
    expect(validateGateDrafts([draft("a", null, "o1", [])])).toMatch(/status/);
    expect(validateGateDrafts([draft("a", null, "o1", ["pending"]), draft("b", null, "o1", ["failed"])])).toMatch(/only once/);
    expect(validateGateDrafts([draft("a", null, "o1", ["pending"]), draft("b", null, "o2", ["failed"])])).toBeNull();
    expect(validateGateDrafts([])).toBeNull();
  });

  it("plans removes, status updates and adds", () => {
    const stored = [row("g1", "o1", ["complete"]), row("g2", "o2", ["failed"]), row("g3", "o3", ["pending"])];
    const plan = planGateWrites(stored, [
      draft("a", "g1", "o1", ["complete", "pending"]), // statuses changed
      draft("b", "g2", "o2", ["failed"]), // untouched
      draft("c", "g3", "o4", ["pending"]), // objective swapped: remove + add
      draft("d", null, "o5", ["dormant"]), // new
    ]);
    expect(plan).toEqual({
      remove: ["g3"],
      update: [{ id: "g1", statuses: ["complete", "pending"] }],
      add: [{ objectiveId: "o4", statuses: ["pending"] }, { objectiveId: "o5", statuses: ["dormant"] }],
    });
  });
});

describe("describeQuestRouteGateLines", () => {
  it("is the one sentence for a single condition, and a list for several", () => {
    const one: QuestRouteGate = { mode: "all", is_open: true, conditions: [{ objective_id: "a", objective: "A", statuses: ["complete"], current_status: "complete", met: true }] };
    expect(describeQuestRouteGateLines(one)).toEqual(["Open: “A” is completed"]);
    const two: QuestRouteGate = {
      mode: "any", is_open: true,
      conditions: [
        { objective_id: "a", objective: "A", statuses: ["complete"], current_status: "complete", met: true },
        { objective_id: "b", objective: "B", statuses: ["failed"], current_status: "pending", met: false },
      ],
    };
    expect(describeQuestRouteGateLines(two)).toEqual(["Open: any of these", "✓ “A” completed (now completed)", "✕ “B” failed (now open)"]);
  });
});
