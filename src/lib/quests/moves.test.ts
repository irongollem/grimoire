import { describe, expect, it } from "vitest";
import { beatMarkWays, beatsFilledIn, describeWay, newestUndoableMove, previewRoute, routeTakeState, threadStandings, waysBetween, type ThreadStanding } from "./moves";
import type { QuestConsequence } from "@/types/quest.types";

const edge = (id: string, source: string, target: string, route_kind: "choice" | "parallel" = "choice") =>
  ({ id, source_beat_id: source, target_beat_id: target, route_kind });
const beats = [{ id: "a", title: "Gate" }, { id: "b", title: "Cellar" }, { id: "c", title: "Roof" }, { id: "d", title: "" }];
const rule = (over: Partial<QuestConsequence>) => ({
  id: "r", on_beat_id: null, on_edge_id: null, on_beat_outcome: "arrived", action: "grant_knowledge",
  target_objective_id: null, action_payload: { text: "x" }, ...over,
}) as unknown as QuestConsequence;
const label = () => "";

describe("previewRoute", () => {
  const edges = [edge("e1", "a", "b"), edge("e2", "a", "c"), edge("e3", "d", "c")];

  it("lists the sibling choices out of the same beat as cut off, and no others (fails if siblings of other beats leak in)", () => {
    expect(previewRoute({ edge: edges[0]!, edges, beats, consequences: [], objectiveLabel: label }).cutOff).toEqual(["Roof"]);
  });

  it("a parallel route cuts nothing off and says it opens a thread (fails if parallel cuts siblings)", () => {
    const parallel = edge("e1", "a", "b", "parallel");
    const result = previewRoute({ edge: parallel, edges: [parallel, edge("e2", "a", "c")], beats, consequences: [], objectiveLabel: label });
    expect(result.cutOff).toEqual([]);
    expect(result.opensThread).toBe(true);
  });

  it("fires the target's arrival rules and the edge's rules, but not 'if it goes wrong' or other beats' rules", () => {
    const consequences = [
      rule({ id: "1", on_beat_id: "b" }),
      rule({ id: "2", on_edge_id: "e1" }),
      rule({ id: "3", on_beat_id: "b", on_beat_outcome: "failed" }),
      rule({ id: "4", on_beat_id: "c" }),
      rule({ id: "5", on_edge_id: "e2" }),
    ];
    expect(previewRoute({ edge: edges[0]!, edges, beats, consequences, objectiveLabel: label }).payoffs).toHaveLength(2);
  });

  it("names an untitled target", () => {
    expect(previewRoute({ edge: edge("e9", "a", "d"), edges, beats, consequences: [], objectiveLabel: label }).doneTitle).toBe("Untitled beat");
  });
});

describe("newestUndoableMove", () => {
  const t = (id: string, to: string | null, at: string) => ({ id, to_beat_id: to, created_at: at });

  it("is null with nothing to undo", () => {
    expect(newestUndoableMove([])).toBeNull();
    expect(newestUndoableMove([t("a", null, "2026-01-02T00:00:00Z")])).toBeNull();
  });

  // Fails if an assert row (no beat) or an older row is named as the move Undo takes back.
  it("names the newest transition that arrives at a beat", () => {
    const moves = [t("old", "b1", "2026-01-01T00:00:00Z"), t("new", "b2", "2026-01-03T00:00:00Z"), t("assert", null, "2026-01-04T00:00:00Z")];
    expect(newestUndoableMove(moves)?.id).toBe("new");
  });
});

const ends = (source: string, target: string) => ({ source_beat_id: source, target_beat_id: target });
const standingAt = (partyBeatId: string | null, reached: string[] = [], entryBeatId: string | null = "a"): ThreadStanding => ({ partyBeatId, reachedBeatIds: new Set(reached), entryBeatId });

describe("waysBetween", () => {
  // a to lodge two ways: through the kennels (k1, k2) or the tunnel (t).
  const graph = [ends("a", "k1"), ends("k1", "k2"), ends("k2", "lodge"), ends("a", "t"), ends("t", "lodge")];

  it("finds both ways and lists the shorter first (fails if the order is discovery order, not length)", () => {
    expect(waysBetween(graph, "a", "lodge")).toEqual([["a", "t", "lodge"], ["a", "k1", "k2", "lodge"]]);
  });

  it("stops at the cap and keeps the shortest ones", () => {
    expect(waysBetween(graph, "a", "lodge", { maxWays: 1 })).toEqual([["a", "t", "lodge"]]);
  });

  it("never loops on a cycle and visits no beat twice (fails if the walk revisits)", () => {
    const loop = [ends("a", "b"), ends("b", "a"), ends("b", "c")];
    expect(waysBetween(loop, "a", "c")).toEqual([["a", "b", "c"]]);
  });

  it("gives nothing for a beat that cannot be reached, and the beat itself for itself", () => {
    expect(waysBetween(graph, "lodge", "a")).toEqual([]);
    expect(waysBetween(graph, "a", "a")).toEqual([["a"]]);
  });

  it("gives up past the depth rather than walking a very long chain", () => {
    const chain = Array.from({ length: 30 }, (_, i) => ends(`n${i}`, `n${i + 1}`));
    expect(waysBetween(chain, "n0", "n30", { maxDepth: 5 })).toEqual([]);
  });
});

describe("threadStandings", () => {
  it("the party stands at the thread's newest arrival, else its cursor, else the entry (fails if the cursor beats a newer arrival)", () => {
    const standings = threadStandings({
      transitions: [{ thread_id: "t1", to_beat_id: "a" }, { thread_id: "t1", to_beat_id: "b" }, { thread_id: "t2", to_beat_id: "x" }, { thread_id: "t1", to_beat_id: null }],
      cursors: { t1: "a", t2: null, t3: "c", t4: null },
      entryBeatId: "e",
    });
    expect(standings.t1!.partyBeatId).toBe("b");
    expect([...standings.t1!.reachedBeatIds]).toEqual(["a", "b"]);
    expect(standings.t3!.partyBeatId).toBe("c");
    expect(standings.t4!.partyBeatId).toBe("e");
  });
});

describe("routeTakeState", () => {
  const edges = [ends("a", "b"), ends("b", "c"), ends("b", "d"), ends("c", "e"), ends("x", "y")];

  it("here: the route leaves from where the party stands", () => {
    expect(routeTakeState({ edge: ends("b", "c"), edges, standing: standingAt("b", ["a", "b"]) })).toEqual({ kind: "here", ways: [["b"]] });
  });

  it("ahead: the route lies further on, with the way there", () => {
    expect(routeTakeState({ edge: ends("c", "e"), edges, standing: standingAt("a", ["a"]) })).toEqual({ kind: "ahead", ways: [["a", "b", "c"]] });
  });

  it("past: already taken when its target was reached (fails if it is offered again)", () => {
    expect(routeTakeState({ edge: ends("b", "c"), edges, standing: standingAt("c", ["a", "b", "c"]) })).toEqual({ kind: "past", reason: "Already taken" });
  });

  it("past: the party has walked beyond its source (fails if it is offered backwards)", () => {
    const state = routeTakeState({ edge: ends("b", "d"), edges, standing: standingAt("e", ["a", "b", "c", "e"]) });
    expect(state).toEqual({ kind: "past", reason: "The party is past this route; use Undo to go back" });
  });

  it("past: cut off when no forward way leads to its source and it was never reached", () => {
    expect(routeTakeState({ edge: ends("x", "y"), edges, standing: standingAt("b", ["a", "b"]) })).toEqual({ kind: "past", reason: "Cut off by an earlier choice" });
  });

  it("past with no place to start from", () => {
    expect(routeTakeState({ edge: ends("b", "c"), edges, standing: standingAt(null, [], null) }).kind).toBe("past");
  });
});

describe("beatMarkWays", () => {
  const edges = [ends("a", "k"), ends("k", "z"), ends("a", "t"), ends("t", "z")];
  it("lists every way to a beat further on, and is direct where there is none or the party is already there", () => {
    expect(beatMarkWays({ beatId: "z", edges, standing: standingAt("a") })).toEqual({ kind: "ahead", ways: [["a", "k", "z"], ["a", "t", "z"]] });
    expect(beatMarkWays({ beatId: "a", edges, standing: standingAt("z", ["a", "z"]) })).toEqual({ kind: "direct" });
    expect(beatMarkWays({ beatId: "z", edges, standing: standingAt("z") })).toEqual({ kind: "direct" });
  });
});

describe("describing a way", () => {
  const titles: Record<string, string> = { a: "Gate", k: "Kennels", t: "Tunnel", z: "Lodge" };
  const titleOf = (id: string) => titles[id]!;
  it("names the beats it would fill in, skipping those already reached and stopping before the move's own beat", () => {
    expect(beatsFilledIn(["a", "k", "z"], standingAt("a", ["a"]), "z")).toEqual(["k"]);
    expect(beatsFilledIn(["a", "k", "z"], standingAt("a", ["a"]), null)).toEqual(["k", "z"]);
    expect(describeWay(["a", "t", "z"], standingAt("a", ["a"]), "z", titleOf)).toBe("Tunnel");
  });
});
