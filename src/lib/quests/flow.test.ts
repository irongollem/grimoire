import { describe, expect, it } from "vitest";
import { applyFlowPositions, moveBeatCommand, toQuestFlowGraph } from "./flow";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const beat = (id: string, x: number, y: number): QuestBeat => ({
  id, quest_id: "quest", campaign_id: "campaign", title: id, dm_content: null,
  rumor_text: null, reveal_text: null, visibility: "hidden", kind: "neutral",
  presentation_hint: null, canvas_x: x, canvas_y: y, is_improvised: false,
  created_by: "dm", created_at: "now", updated_at: "now",
});

describe("quest flow adapter", () => {
  it("round-trips coordinates and edges without library state leaking into beats", () => {
    const beats = [beat("a", 10, 20), beat("b", 30, 40)];
    const edges = [{ id: "e", quest_id: "quest", campaign_id: "campaign", source_beat_id: "a", target_beat_id: "b", label: "if trusted", created_by: "dm", created_at: "now" }] as QuestBeatEdge[];
    const graph = toQuestFlowGraph(beats, edges);
    graph.nodes[0]!.position = { x: 125.5, y: -44 };
    expect(applyFlowPositions(beats, graph.nodes)).toEqual([beat("a", 125.5, -44), beat("b", 30, 40)]);
    expect(graph.edges[0]).toMatchObject({ source: "a", target: "b", label: "if trusted" });
  });

  it("emits a domain move command rather than a Vue Flow node", () => {
    expect(moveBeatCommand({ id: "a", position: { x: 4, y: 8 } })).toEqual({ type: "move", beatId: "a", x: 4, y: 8 });
  });
});
