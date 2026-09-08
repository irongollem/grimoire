import { describe, expect, it } from "vitest";
import {
  beatLedgerDeltas,
  describeForkState,
  ledgerVerbOf,
  routeCondition,
  routeLedgerDeltas,
  storySpine,
  summarizeLedgerDeltas,
  LEDGER_VERB_ACTIONS,
  LEDGER_VERBS,
} from "./ledger";
import type { QuestConsequence, QuestObjective, QuestRouteGate, QuestRuntimeChoice } from "@/types/quest.types";

const objective = (id: string, description: string, status: QuestObjective["status"] = "pending"): QuestObjective => ({
  id, quest_id: "q1", description, status, is_player_visible: false, sort_order: 0,
});

const rule = (
  id: string,
  action: QuestConsequence["action"],
  target: string | null,
  where: Partial<Pick<QuestConsequence, "on_beat_id" | "on_edge_id">>,
): QuestConsequence => ({
  id, quest_id: "q1", on_beat_id: null, on_edge_id: null, on_objective_id: null, on_objective_status: null,
  on_quest_settled: false, after_days: 0, action, target_objective_id: target, target_npc_id: null,
  target_quest_id: null, action_payload: {}, created_at: "", updated_at: "", ...where,
});

const princess = objective("o1", "Save the princess");
const whoTookHer = objective("o2", "Find out who took her", "complete");
const ledger = objective("o3", "Recover the Baron's ledger");

const gate = (overrides: Partial<QuestRouteGate> = {}): QuestRouteGate => ({
  objective_id: "o3", objective: "Recover the Baron's ledger", required_status: "complete", current_status: "pending", is_open: false, ...overrides,
});

const choice = (edgeId: string, beatId: string, title: string, g: QuestRouteGate | null = null): QuestRuntimeChoice => ({
  edge_id: edgeId, quest_id: "q1", beat_id: beatId, beat_title: title, beat_kind: "social", gate: g, effects: [],
  route_kind: "choice", thread_label: null, converge_mode: "any", site: null, payoff: [], loot: [],
});

describe("ledger verbs", () => {
  it("names the four verbs the design uses, with `complete` read as achieve", () => {
    expect(LEDGER_VERBS).toEqual(["raise", "achieve", "fail", "reveal"]);
    expect(ledgerVerbOf("complete")).toBe("achieve");
    expect(ledgerVerbOf("raise")).toBe("raise");
    expect(ledgerVerbOf("fail")).toBe("fail");
    expect(ledgerVerbOf("reveal")).toBe("reveal");
  });

  it("treats every world action as no ledger verb at all", () => {
    for (const action of [
      "create_calendar_event", "send_broadcast", "shift_npc_relationship", "unlock_quest",
      "grant_knowledge", "owe_favor", "award_milestone",
    ] as const) {
      expect(ledgerVerbOf(action)).toBeNull();
    }
  });

  it("round-trips a verb to the action it is stored as", () => {
    for (const verb of LEDGER_VERBS) expect(ledgerVerbOf(LEDGER_VERB_ACTIONS[verb])).toBe(verb);
  });
});

describe("beat and route deltas", () => {
  const rules = [
    rule("r1", "raise", "o1", { on_beat_id: "b1" }),
    rule("r2", "raise", "o2", { on_beat_id: "b1" }),
    rule("r3", "send_broadcast", null, { on_beat_id: "b1" }),
    rule("r4", "complete", "o2", { on_beat_id: "b2" }),
    rule("r5", "fail", "o1", { on_edge_id: "e1" }),
    rule("r6", "raise", "missing", { on_beat_id: "b1" }),
  ];
  const objectives = [princess, whoTookHer, ledger];

  it("reads a beat's arrival rules as verb + objective, skipping world actions", () => {
    expect(beatLedgerDeltas("b1", rules, objectives)).toEqual([
      { verb: "raise", consequenceId: "r1", objectiveId: "o1", objective: "Save the princess", objectiveStatus: "pending" },
      { verb: "raise", consequenceId: "r2", objectiveId: "o2", objective: "Find out who took her", objectiveStatus: "complete" },
    ]);
  });

  it("drops a rule whose objective is gone rather than inventing a name for it", () => {
    expect(beatLedgerDeltas("b1", rules, objectives).some((d) => d.consequenceId === "r6")).toBe(false);
  });

  it("reads a route's rules the same way", () => {
    expect(routeLedgerDeltas("e1", rules, objectives)).toEqual([
      { verb: "fail", consequenceId: "r5", objectiveId: "o1", objective: "Save the princess", objectiveStatus: "pending" },
    ]);
  });

  it("says nothing for a beat that moves nothing", () => {
    expect(beatLedgerDeltas("nowhere", rules, objectives)).toEqual([]);
    expect(summarizeLedgerDeltas([])).toBe("");
  });
});

describe("summarizeLedgerDeltas", () => {
  it("names a lone objective and counts several under one verb", () => {
    expect(summarizeLedgerDeltas(beatLedgerDeltas("b1", [
      rule("r1", "raise", "o1", { on_beat_id: "b1" }),
      rule("r2", "raise", "o2", { on_beat_id: "b1" }),
    ], [princess, whoTookHer]))).toBe("raises 2 objectives");

    expect(summarizeLedgerDeltas(beatLedgerDeltas("b2", [
      rule("r4", "complete", "o2", { on_beat_id: "b2" }),
      rule("r5", "raise", "o3", { on_beat_id: "b2" }),
    ], [princess, whoTookHer, ledger]))).toBe("raises “Recover the Baron's ledger”, achieves “Find out who took her”");
  });
});

describe("routeCondition", () => {
  it("is null for an ungated route — most routes are decided at the table", () => {
    expect(routeCondition(null)).toBeNull();
    expect(routeCondition(undefined)).toBeNull();
  });

  it("reads an open gate as ready, and a closed one as a need", () => {
    expect(routeCondition(gate({ is_open: true, current_status: "complete" })))
      .toEqual({ open: true, text: "ready — “Recover the Baron's ledger” is completed" });
    expect(routeCondition(gate()))
      .toEqual({ open: false, text: "needs “Recover the Baron's ledger” completed" });
  });
});

describe("describeForkState", () => {
  it("stays silent when no route is gated", () => {
    expect(describeForkState([choice("e1", "b4", "Confront the Baron")])).toBe("");
    expect(describeForkState([])).toBe("");
  });

  it("counts the settled outcomes among the gated routes", () => {
    const shut = choice("e1", "b4", "Confront", gate());
    const open = choice("e2", "b5", "Carry the news", gate({ is_open: true }));
    expect(describeForkState([shut, choice("e3", "b6", "Ungated")])).toBe("no outcome is settled yet — the ledger decides");
    expect(describeForkState([shut, open])).toBe("one outcome is settled");
    expect(describeForkState([open, { ...open, edge_id: "e4" }])).toBe("2 outcomes are settled — your call");
  });
});

describe("storySpine", () => {
  const beats = [
    { id: "b1", title: "The King's plea", staged_at_location_id: null },
    { id: "b2", title: "The ransom note", staged_at_location_id: null },
    { id: "b3", title: "At the Sunken Vault", staged_at_location_id: "vault" },
    { id: "b4", title: "Confront the Baron", staged_at_location_id: null },
  ];
  const rules = [
    rule("r1", "raise", "o1", { on_beat_id: "b1" }),
    rule("r2", "raise", "o2", { on_beat_id: "b1" }),
    rule("r3", "complete", "o2", { on_beat_id: "b2" }),
  ];
  const objectives = [princess, whoTookHer, ledger];
  const transitions = [
    { to_quest_id: "q1", to_beat_id: "b1", to_beat_title: "The King's plea" },
    { to_quest_id: "q1", to_beat_id: "b2", to_beat_title: "The ransom note" },
    { to_quest_id: "q1", to_beat_id: "b1", to_beat_title: "The King's plea" },
    { to_quest_id: "other", to_beat_id: "x", to_beat_title: "Elsewhere" },
    { to_quest_id: "q1", to_beat_id: null, to_beat_title: null },
    { to_quest_id: "q1", to_beat_id: "b3", to_beat_title: "At the Sunken Vault" },
  ];

  it("lists played beats once each in the order they were first played, then the current beat, then what is ahead", () => {
    const spine = storySpine({
      questId: "q1", beats, transitions, currentBeatId: "b3",
      outgoing: [choice("e1", "b4", "Confront the Baron", gate())],
      consequences: rules, objectives,
      placeNameOf: (id) => id === "vault" ? "The Sunken Vault · 5 rooms" : null,
    });
    expect(spine.map((row) => [row.state, row.title, row.note])).toEqual([
      ["played", "The King's plea", "raises 2 objectives"],
      ["played", "The ransom note", "achieves “Find out who took her”"],
      ["current", "At the Sunken Vault", "The Sunken Vault · 5 rooms"],
      ["next", "Confront the Baron", "if “Recover the Baron's ledger” is completed"],
    ]);
    expect(spine[3]).toMatchObject({ edgeId: "e1", open: false });
  });

  it("marks an open route as ready and an ungated one as open with no note", () => {
    const spine = storySpine({
      questId: "q1", beats, transitions: [], currentBeatId: "b3",
      outgoing: [
        choice("e1", "b4", "Confront the Baron", gate({ is_open: true, current_status: "complete" })),
        choice("e2", "b2", "Back to the note"),
      ],
      consequences: rules, objectives,
    });
    expect(spine.slice(1)).toEqual([
      { beatId: "b4", title: "Confront the Baron", state: "next", note: "ready — “Recover the Baron's ledger” is completed", edgeId: "e1", open: true },
      { beatId: "b2", title: "Back to the note", state: "next", note: "", edgeId: "e2", open: true },
    ]);
  });

  it("falls back to the log's own title for a beat that has since been archived", () => {
    const spine = storySpine({
      questId: "q1", beats: [], transitions: [{ to_quest_id: "q1", to_beat_id: "gone", to_beat_title: "A lost scene" }],
      currentBeatId: null, outgoing: [], consequences: [], objectives: [],
    });
    expect(spine).toEqual([{ beatId: "gone", title: "A lost scene", state: "played", note: "" }]);
  });

  // #853: several threads can share one quest's transition log. A spine
  // scoped to one thread reads as that thread's own story, not every thread's
  // rows interleaved — but a thread-less `assert` row still counts, since it
  // was never any thread's move to begin with.
  it("scopes played rows to one thread, keeping thread-less asserts", () => {
    const mixed = [
      { to_quest_id: "q1", to_beat_id: "b1", to_beat_title: "The King's plea", thread_id: "main" },
      { to_quest_id: "q1", to_beat_id: "b2", to_beat_title: "The ransom note", thread_id: "side" },
      { to_quest_id: "q1", to_beat_id: "b4", to_beat_title: "Confront the Baron", thread_id: null },
    ];
    const spine = storySpine({
      questId: "q1", beats, transitions: mixed, currentBeatId: "b3",
      outgoing: [], consequences: [], objectives: [], threadId: "main",
    });
    expect(spine.map((row) => row.beatId)).toEqual(["b1", "b4", "b3"]);
  });
});
