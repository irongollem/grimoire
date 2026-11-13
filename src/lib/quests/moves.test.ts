import { describe, expect, it } from "vitest";
import { newestUndoableMove, previewRoute } from "./moves";
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
