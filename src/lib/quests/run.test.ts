import { describe, expect, it } from "vitest";
import {
  describeHeldLoot,
  describeHeldPayoff,
  describeSpineSession,
  describeThreadCursor,
  findBeatArrival,
  formatSiteSummary,
  objectiveGateTargets,
  objectiveThreadHint,
  rankQuestJumpTargets,
  resolveCurrentSite,
  soleOpenOutgoingEdgeId,
  summarizeRoutePayoff,
} from "./run";
import type { SiteGraphLocation } from "./run";
import type {
  QuestConsequence,
  QuestHeldPayoff,
  QuestRoutePayoff,
  QuestRuntimeChoice,
  QuestRuntimeJumpTarget,
  QuestThreadCursor,
} from "@/types/quest.types";

const target = (beat_id: string, beat_title = beat_id): QuestRuntimeJumpTarget => ({
  beat_id, quest_id: "q1", quest_title: "Main", beat_title, beat_kind: "neutral", is_improvised: false,
});

const choice = (edge_id: string, gate: QuestRuntimeChoice["gate"] = null): QuestRuntimeChoice => ({
  edge_id, quest_id: "q1", beat_id: `beat-${edge_id}`, beat_title: edge_id, beat_kind: "neutral", gate, effects: [],
  route_kind: "choice", thread_label: null, converge_mode: "any", site: null, payoff: [], loot: [],
});
const openGate = { objective_id: "o1", objective: "Save the princess", required_status: "complete", current_status: "complete", is_open: true } as const;
const closedGate = { ...openGate, current_status: "pending", is_open: false } as const;

describe("run-mode jump ranking", () => {
  it("ranks recently visited beats ahead of the rest", () => {
    const ranked = rankQuestJumpTargets(
      [target("cellar"), target("attic"), target("hall")],
      ["hall"],
    );
    expect(ranked.map((row) => row.beat_id)).toEqual(["hall", "attic", "cellar"]);
  });

  it("falls back to beat title so the order never depends on fetch order", () => {
    const ranked = rankQuestJumpTargets([target("b", "Beta"), target("a", "Alpha")], []);
    expect(ranked.map((row) => row.beat_title)).toEqual(["Alpha", "Beta"]);
  });

  it("preserves the order recent beats were visited in", () => {
    const ranked = rankQuestJumpTargets(
      [target("first"), target("second"), target("cold")],
      ["second", "first"],
    );
    expect(ranked.map((row) => row.beat_id)).toEqual(["second", "first", "cold"]);
  });
});

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

const loc = (id: string, location_type: SiteGraphLocation["location_type"], parent_id: string | null): SiteGraphLocation => ({ id, location_type, parent_id });

describe("resolveCurrentSite", () => {
  const dungeon = loc("dungeon-1", "dungeon", null);
  const room = loc("room-1", "room", "dungeon-1");
  const locations = [dungeon, room, loc("town-1", "town", null)];

  it("walks up from a room to its site", () => {
    expect(resolveCurrentSite("room-1", locations)).toBe(dungeon);
  });

  it("returns the site itself when the party stands there but has entered no room yet", () => {
    expect(resolveCurrentSite("dungeon-1", locations)).toBe(dungeon);
  });

  it("returns null when the party's position is not inside any site", () => {
    expect(resolveCurrentSite("town-1", locations)).toBeNull();
  });

  it("returns null when the party's position is unknown", () => {
    expect(resolveCurrentSite(null, locations)).toBeNull();
  });

  it("returns null for a stale or missing location id", () => {
    expect(resolveCurrentSite("ghost", locations)).toBeNull();
  });

  it("does not loop forever on a malformed ancestor cycle", () => {
    const cyclic = [loc("a", "room", "b"), loc("b", "room", "a")];
    expect(resolveCurrentSite("a", cyclic)).toBeNull();
  });
});

describe("formatSiteSummary", () => {
  it("reads as one line: name, type, room count, explored count", () => {
    expect(formatSiteSummary({ name: "The Sunken Vault", location_type: "dungeon" }, 5, 2))
      .toBe("The Sunken Vault · dungeon · 5 rooms · 2 explored");
  });

  it("singularizes a lone room", () => {
    expect(formatSiteSummary({ name: "The Ossuary", location_type: "dungeon" }, 1, 0))
      .toBe("The Ossuary · dungeon · 1 room · 0 explored");
  });
});

const threadCursor = (overrides: Partial<QuestThreadCursor> = {}): QuestThreadCursor => ({
  id: "t1", campaign_id: "c1", quest_id: "q1", label: "Main", status: "live",
  opened_by_edge_id: null, parent_thread_id: null, merged_into_thread_id: null,
  created_by: null, created_at: "2026-01-01T00:00:00Z", closed_at: null, updated_at: "2026-01-01T00:00:00Z",
  current_beat_id: "beat-1", current_beat_title: "Confront Ser Vallis", runtime_status: "paused", version: 1,
  ...overrides,
});

describe("describeThreadCursor", () => {
  it("names the beat a paused thread is parked at", () => {
    expect(describeThreadCursor(threadCursor())).toBe("paused at Confront Ser Vallis");
  });

  it("names the beat a running thread is standing on", () => {
    expect(describeThreadCursor(threadCursor({ runtime_status: "running" }))).toBe("running at Confront Ser Vallis");
  });

  it("says a converge-all thread is waiting", () => {
    expect(describeThreadCursor(threadCursor({ runtime_status: "waiting" }))).toBe("waiting to converge at Confront Ser Vallis");
  });

  it("says an ended thread has ended, regardless of its last beat", () => {
    expect(describeThreadCursor(threadCursor({ runtime_status: "ended" }))).toBe("ended");
  });

  it("says a thread with no cursor yet has not started", () => {
    expect(describeThreadCursor(threadCursor({ runtime_status: null, current_beat_title: null }))).toBe("not started");
  });
});

describe("objectiveGateTargets", () => {
  it("names every route this objective gates", () => {
    const outgoing = [
      choice("e1", { objective_id: "o1", objective: "The ledger", required_status: "complete", current_status: "pending", is_open: false }),
      choice("e2", { objective_id: "o2", objective: "Other", required_status: "complete", current_status: "complete", is_open: true }),
    ];
    expect(objectiveGateTargets("o1", outgoing)).toEqual(["e1"]);
  });

  it("returns nothing when no route gates on this objective", () => {
    expect(objectiveGateTargets("o1", [choice("e1")])).toEqual([]);
  });
});

describe("objectiveThreadHint", () => {
  const consequence = (overrides: Partial<QuestConsequence> = {}): QuestConsequence => ({
    id: "c1", quest_id: "q1", on_beat_id: "beat-b", on_edge_id: null, on_objective_id: null,
    on_objective_status: null, on_quest_settled: false, after_days: 0, action: "raise",
    target_objective_id: "o1", target_npc_id: null, target_quest_id: null, action_payload: {},
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as QuestConsequence);

  it("names the sibling thread currently standing on the raising beat", () => {
    const threads = [threadCursor({ id: "t1", current_beat_id: "beat-a" }), threadCursor({ id: "t2", current_beat_id: "beat-b", label: "Side" })];
    expect(objectiveThreadHint("o1", [consequence()], threads, "t1")).toBe("B");
  });

  it("never names the current thread itself", () => {
    const threads = [threadCursor({ id: "t1", current_beat_id: "beat-b" })];
    expect(objectiveThreadHint("o1", [consequence()], threads, "t1")).toBeNull();
  });

  it("returns null when no rule raises this objective", () => {
    expect(objectiveThreadHint("o1", [], [threadCursor()], "t1")).toBeNull();
  });
});

describe("summarizeRoutePayoff", () => {
  const payoff = (overrides: Partial<QuestRoutePayoff> = {}): QuestRoutePayoff => ({
    consequence_id: "c1", action: "reveal", target_objective_id: "o1", target_objective: "Testify before the Guild",
    target_npc_id: null, target_npc: null, target_quest_id: null, target_quest: null,
    action_payload: {}, after_days: 0, on_edge: true,
    ...overrides,
  });

  it("returns null when the route carries no payoff", () => {
    expect(summarizeRoutePayoff(undefined)).toBeNull();
  });

  it("phrases a ledger verb with its named target", () => {
    expect(summarizeRoutePayoff(payoff())).toBe("reveal · Testify before the Guild");
  });

  it("falls back to the world-action sentence for a non-ledger payoff", () => {
    expect(summarizeRoutePayoff(payoff({ action: "send_broadcast", target_objective: null }))).toBe("Then sends a broadcast");
  });
});

describe("describeHeldPayoff", () => {
  it("names the action a held event will perform", () => {
    const held: QuestHeldPayoff = {
      event_id: "e1", consequence_id: "c1", action: "shift_npc_relationship", target_objective_id: null,
      target_npc_id: "npc-1", target_quest_id: null, action_payload: {}, after_days: 0,
      held_at: "2026-01-01T00:00:00Z", beat_id: "beat-1", beat_title: "Confront Ser Vallis",
    };
    expect(describeHeldPayoff(held)).toBe("Shifts an NPC's disposition");
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

describe("findBeatArrival and describeSpineSession", () => {
  const formatDate = (iso: string) => `on ${iso}`;
  const rows = [
    { to_quest_id: "q1", to_beat_id: "beat-1", kind: "enter", reason: "Session 22", created_at: "2026-01-01T00:00:00Z" },
    { to_quest_id: "q1", to_beat_id: "beat-2", kind: "forward", reason: "opened Thread B", created_at: "2026-01-02T00:00:00Z" },
    { to_quest_id: "q1", to_beat_id: "beat-1", kind: "jump", reason: null, created_at: "2026-01-03T00:00:00Z" },
  ];

  it("finds the first arrival at a beat by default", () => {
    expect(findBeatArrival(rows, "q1", "beat-1")).toEqual({ kind: "enter", reason: "Session 22", createdAt: "2026-01-01T00:00:00Z" });
  });

  it("finds the newest arrival when asked", () => {
    expect(findBeatArrival(rows, "q1", "beat-1", true)).toEqual({ kind: "jump", reason: null, createdAt: "2026-01-03T00:00:00Z" });
  });

  it("returns null for a beat with no arrival", () => {
    expect(findBeatArrival(rows, "q1", "beat-9")).toBeNull();
  });

  it("extracts a session number named in the reason", () => {
    expect(describeSpineSession(findBeatArrival(rows, "q1", "beat-1"), formatDate)).toBe("session 22");
  });

  it("falls back to the date when the reason names no session", () => {
    expect(describeSpineSession(findBeatArrival(rows, "q1", "beat-2"), formatDate)).toBe("on 2026-01-02T00:00:00Z");
  });

  it("returns nothing for a beat that was never arrived at", () => {
    expect(describeSpineSession(null, formatDate)).toBe("");
  });
});
