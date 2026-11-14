import { describe, expect, it } from "vitest";
import {
  describeHeldLoot,
  lootHeldByTheRun,
  objectiveGateTargets,
  objectiveThreadHint,
  soleOpenOutgoingEdgeId,
} from "./run";
import type {
  LootPlacement,
  QuestBeatTransition,
  QuestConsequence,
  QuestRuntimeChoice,
  QuestThreadCursor,
} from "@/types/quest.types";

const choice = (edge_id: string, gate: QuestRuntimeChoice["gate"] = null): QuestRuntimeChoice => ({
  edge_id, quest_id: "q1", beat_id: `beat-${edge_id}`, beat_title: edge_id, beat_kind: "neutral", gate, effects: [],
  route_kind: "choice", label: null, note: null, converge_mode: "any", site: null, payoff: [], loot: [],
});
const gateOn = (objective_id: string, objective: string, current_status: "pending" | "complete", is_open: boolean): QuestRuntimeChoice["gate"] => ({
  mode: "all", is_open,
  conditions: [{ objective_id, objective, statuses: ["complete"], current_status, met: is_open }],
});
const openGate = gateOn("o1", "Save the princess", "complete", true);
const closedGate = gateOn("o1", "Save the princess", "pending", false);


describe("soleOpenOutgoingEdgeId", () => {
  it("advances through an ungated route when it is the only one", () => {
    expect(soleOpenOutgoingEdgeId([choice("e1")])).toBe("e1");
  });

  it("refuses to guess between two open routes", () => {
    expect(soleOpenOutgoingEdgeId([choice("e1"), choice("e2")])).toBeNull();
  });

  it("does not count a closed route as a candidate, so it cannot block the shortcut", () => {
    expect(soleOpenOutgoingEdgeId([choice("e1", closedGate), choice("e2", openGate)])).toBe("e2");
  });

  it("refuses when every route is closed", () => {
    expect(soleOpenOutgoingEdgeId([choice("e1", closedGate), choice("e2", closedGate)])).toBeNull();
  });

  it("refuses at a dead end", () => {
    expect(soleOpenOutgoingEdgeId([])).toBeNull();
  });
});

const threadCursor = (overrides: Partial<QuestThreadCursor> = {}): QuestThreadCursor => ({
  id: "t1", campaign_id: "c1", quest_id: "q1", label: "Main", status: "live",
  opened_by_edge_id: null, parent_thread_id: null, merged_into_thread_id: null,
  created_by: null, created_at: "2026-01-01T00:00:00Z", closed_at: null, updated_at: "2026-01-01T00:00:00Z",
  current_beat_id: "beat-1", current_beat_title: "Confront Ser Vallis", runtime_status: "waiting", version: 1,
  ...overrides,
});


describe("objectiveGateTargets", () => {
  it("names every route this objective gates", () => {
    const outgoing = [
      choice("e1", gateOn("o1", "The ledger", "pending", false)),
      choice("e2", gateOn("o2", "Other", "complete", true)),
    ];
    expect(objectiveGateTargets("o1", outgoing)).toEqual(["e1"]);
  });

  it("finds the objective among several conditions of one route", () => {
    const compound: QuestRuntimeChoice["gate"] = {
      mode: "any", is_open: false,
      conditions: [
        { objective_id: "o9", objective: "Nine", statuses: ["failed"], current_status: "pending", met: false },
        { objective_id: "o1", objective: "One", statuses: ["complete"], current_status: "pending", met: false },
      ],
    };
    expect(objectiveGateTargets("o1", [choice("e1", compound)])).toEqual(["e1"]);
  });

  it("returns nothing when no route gates on this objective", () => {
    expect(objectiveGateTargets("o1", [choice("e1")])).toEqual([]);
  });
});

describe("objectiveThreadHint", () => {
  const consequence = (overrides: Partial<QuestConsequence> = {}): QuestConsequence => ({
    id: "c1", quest_id: "q1", on_beat_id: "beat-b", on_edge_id: null, on_objective_id: null,
    on_objective_status: null, on_quest_settled: false, entry_beat_id: null, after_days: 0, action: "raise",
    target_objective_id: "o1", target_npc_id: null, target_quest_id: null, target_document_id: null, action_payload: {},
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as QuestConsequence);

  it("names the sibling thread currently standing on the raising beat", () => {
    const threads = [threadCursor({ id: "t1", current_beat_id: "beat-a" }), threadCursor({ id: "t2", current_beat_id: "beat-b", label: "Side" })];
    expect(objectiveThreadHint("o1", [consequence()], threads, "t1")).toBe("B");
  });

  it("ignores a rule that raises some other objective", () => {
    const threads = [threadCursor({ id: "t1", current_beat_id: "beat-a" }), threadCursor({ id: "t2", current_beat_id: "beat-b", label: "Side" })];
    expect(objectiveThreadHint("o1", [consequence({ target_objective_id: "o2" })], threads, "t1")).toBeNull();
  });

  it("never names the current thread itself", () => {
    const threads = [threadCursor({ id: "t1", current_beat_id: "beat-b" })];
    expect(objectiveThreadHint("o1", [consequence()], threads, "t1")).toBeNull();
  });

  it("returns null when no rule raises this objective", () => {
    expect(objectiveThreadHint("o1", [], [threadCursor()], "t1")).toBeNull();
  });
});


describe("describeHeldLoot", () => {
  it("says currency is already prepared", () => {
    expect(describeHeldLoot("currency")).toBe("currency · prepared");
  });

  it("says an item stays unclaimed until it is dispatched", () => {
    expect(describeHeldLoot("item")).toBe("item · unclaimed once dispatched");
  });
});

// #1164: a fresh run's first beat listed every unclaimed loot row in the quest
// as "already fired". Held loot is loot on a beat the run has entered.
describe("lootHeldByTheRun (#1164)", () => {
  const loot = (id: string, beat_id: string, delivery_state: LootPlacement["delivery_state"] = "held"): LootPlacement => ({
    id, beat_id, quest_id: "q1", location_id: null, campaign_id: "c1", kind: "item", item_id: null, library_item_id: null,
    quantity: 1, label: id, payload: {}, source_type: "prepared", source_id: null, sort_order: 0,
    dispatch_message_id: null, dispatched_at: null, delivery_state, quantity_remaining: 1, claimed_by_names: [], handed_out_this_session: false,
  });
  const arrive = (to_beat_id: string, transition_kind: QuestBeatTransition["transition_kind"] = "enter", to_quest_id = "q1"): QuestBeatTransition => ({
    id: `t-${to_beat_id}-${transition_kind}`, campaign_id: "c1", from_quest_id: null, from_beat_id: null, to_quest_id, to_beat_id,
    transition_kind, reason: null, runtime_version: 1, from_quest_title: null, from_beat_title: null, to_quest_title: null,
    to_beat_title: null, provenance: {}, created_by: null, created_at: "2026-11-08T00:00:00Z", thread_id: "th1", outcome: null,
  });
  const ids = (rows: LootPlacement[]) => rows.map((row) => row.id);

  it("leaves out loot on a beat the run has not reached", () => {
    const rows = [loot("here", "b1"), loot("ahead", "b2")];
    expect(ids(lootHeldByTheRun(rows, [arrive("b1")], "q1"))).toEqual(["here"]);
  });

  it("keeps loot on an earlier beat the DM left undropped", () => {
    const rows = [loot("earlier", "b1"), loot("here", "b2")];
    expect(ids(lootHeldByTheRun(rows, [arrive("b1"), arrive("b2", "forward")], "q1"))).toEqual(["earlier", "here"]);
  });

  it("leaves out loot already dropped in chat", () => {
    expect(lootHeldByTheRun([loot("dropped", "b1", "chat")], [arrive("b1")], "q1")).toEqual([]);
  });

  it("does not count an assert row, which moves no cursor, as reaching its beat", () => {
    expect(lootHeldByTheRun([loot("ahead", "b2")], [arrive("b2", "assert")], "q1")).toEqual([]);
  });

  it("does not count a transition into another quest's beat", () => {
    expect(lootHeldByTheRun([loot("ahead", "b2")], [arrive("b2", "jump", "q2")], "q1")).toEqual([]);
  });
});

