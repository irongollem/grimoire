import { describe, expect, it } from "vitest";
import { applyFlowPositions, moveBeatCommand, retainSelectedBeatId, toQuestFlowGraph } from "./flow";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";
import type { QuestBeatPresentation } from "./presentation";

const beat = (id: string, x: number, y: number): QuestBeat => ({
  id, quest_id: "quest", campaign_id: "campaign", title: id, dm_content: null,
  read_aloud: null, how_it_plays: null, converge_mode: "any",
  rumor_text: null, reveal_text: null, visibility: "hidden", kind: "neutral",
  presentation_hint: null, canvas_x: x, canvas_y: y, is_improvised: false, staged_at_location_id: null, improv_reviewed_at: null,
  created_by: "dm", created_at: "now", updated_at: "now",
});

describe("quest flow adapter", () => {
  it("round-trips coordinates and edges without library state leaking into beats", () => {
    const beats = [beat("a", 10, 20), beat("b", 30, 40)];
    const edges = [{ id: "e", quest_id: "quest", campaign_id: "campaign", source_beat_id: "a", target_beat_id: "b", created_by: "dm", created_at: "now" }] as QuestBeatEdge[];
    const graph = toQuestFlowGraph(beats, edges);
    graph.nodes[0]!.position = { x: 125.5, y: -44 };
    expect(applyFlowPositions(beats, graph.nodes)).toEqual([beat("a", 125.5, -44), beat("b", 30, 40)]);
    expect(graph.edges[0]).toMatchObject({ source: "a", target: "b" });
    expect(graph.edges[0]!.data!.gate).toBeNull();
  });

  it("emits a domain move command rather than a Vue Flow node", () => {
    expect(moveBeatCommand({ id: "a", position: { x: 4, y: 8 } })).toEqual({ type: "move", beatId: "a", x: 4, y: 8 });
  });

  it("maps shared presentation and visited-route state without changing domain rows", () => {
    const presentation = { isCurrent: true, isVisited: true, isReady: false, isDisconnected: false, reach: "current", prepGapCount: 1, prepGaps: [{ kind: "guidance", label: "Add DM guidance" }], handoutCount: 1, loot: { total: 1, undispatched: 1, unclaimed: 0 }, currentThreadIds: [] } satisfies QuestBeatPresentation;
    const edges = [{ id: "e", source_beat_id: "a", target_beat_id: "b" }] as QuestBeatEdge[];
    const graph = toQuestFlowGraph([beat("a", 0, 0), beat("b", 1, 1)], edges, { a: presentation }, new Set(["e"]));
    expect(graph.nodes[0]!.data!.presentation).toBe(presentation);
    expect(graph.edges[0]).toMatchObject({ type: "questRoute", class: "quest-flow-route is-visited", data: { visited: true } });
  });

  it("marks a gated edge's class distinctly when the gate is closed", () => {
    const edges = [{ id: "e", source_beat_id: "a", target_beat_id: "b" }] as QuestBeatEdge[];
    const closedGate = { objective_id: "o1", objective: "Save the princess", required_status: "complete", current_status: "pending", is_open: false } as const;
    const graph = toQuestFlowGraph([beat("a", 0, 0), beat("b", 1, 1)], edges, {}, new Set(), { e: closedGate });
    expect(graph.edges[0]!.class).toBe("quest-flow-route is-closed");
    expect(graph.edges[0]!.data!.gate).toBe(closedGate);
  });

  it("retains selection across refreshed row objects and clears deleted beats", () => {
    expect(retainSelectedBeatId("a", [beat("a", 50, 60)])).toBe("a");
    expect(retainSelectedBeatId("a", [beat("b", 50, 60)])).toBeNull();
  });
});
