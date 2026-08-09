import type { Edge, Node } from "@vue-flow/core";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";
import type { QuestBeatPresentation } from "./presentation";

export interface QuestFlowNodeData {
  beatId: string;
  title: string;
  kind: string;
  visibility: string;
  presentation?: QuestBeatPresentation;
}
export type QuestFlowNode = Node<QuestFlowNodeData>;
export type QuestFlowEdge = Edge<{ edgeId: string; visited: boolean }>;

export type QuestGraphCommand =
  | { type: "select" | "open" | "delete-beat"; beatId: string }
  | { type: "move"; beatId: string; x: number; y: number }
  | { type: "link"; sourceBeatId: string; targetBeatId: string }
  | { type: "create"; sourceBeatId?: string; x?: number; y?: number }
  | { type: "select-edge"; edgeId: string };

export function toQuestFlowGraph(
  beats: QuestBeat[],
  edges: QuestBeatEdge[],
  presentations: Record<string, QuestBeatPresentation> = {},
  visitedEdgeIds: ReadonlySet<string> = new Set(),
) {
  const nodes: QuestFlowNode[] = beats.map((beat) => ({
    id: beat.id,
    type: "questBeat",
    position: { x: beat.canvas_x, y: beat.canvas_y },
    data: {
      beatId: beat.id,
      title: beat.title,
      kind: beat.kind,
      visibility: beat.visibility,
      presentation: presentations[beat.id],
    },
  }));
  const flowEdges: QuestFlowEdge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source_beat_id,
    target: edge.target_beat_id,
    label: edge.label || undefined,
    type: "questRoute",
    class: visitedEdgeIds.has(edge.id)
      ? "quest-flow-route is-visited"
      : "quest-flow-route",
    data: { edgeId: edge.id, visited: visitedEdgeIds.has(edge.id) },
  }));
  return { nodes, edges: flowEdges };
}

export function moveBeatCommand(
  node: Pick<QuestFlowNode, "id" | "position">,
): QuestGraphCommand {
  return {
    type: "move",
    beatId: node.id,
    x: node.position.x,
    y: node.position.y,
  };
}

export function retainSelectedBeatId(
  selectedBeatId: string | null,
  beats: Pick<QuestBeat, "id">[],
) {
  return selectedBeatId && beats.some((beat) => beat.id === selectedBeatId)
    ? selectedBeatId
    : null;
}

/** Applies persisted coordinates back to domain rows without retaining any
 * Vue Flow object. Used by save round-trip tests and optimistic rollback. */
export function applyFlowPositions(
  beats: QuestBeat[],
  nodes: Array<Pick<QuestFlowNode, "id" | "position">>,
): QuestBeat[] {
  const positions = new Map(nodes.map((node) => [node.id, node.position]));
  return beats.map((beat) => {
    const position = positions.get(beat.id);
    return position
      ? { ...beat, canvas_x: position.x, canvas_y: position.y }
      : beat;
  });
}
