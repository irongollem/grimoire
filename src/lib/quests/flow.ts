import type { Edge, Node } from "@vue-flow/core";
import type { QuestBeat, QuestBeatEdge, QuestRouteGate, QuestRouteKind } from "@/types/quest.types";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { QuestBeatPresentation } from "./presentation";

/** Whose eyes the flow is drawn for: the DM's own, or what the party knows. */
export type QuestFlowLens = "dm" | "players";

/** The first line of a rumored beat's player copy, for a node to show in place of its title. */
export function rumorLine(rumorText: string | null | undefined): string | null {
  const line = tiptapToPlainText(rumorText).split("\n").map((part) => part.trim()).find(Boolean);
  return line ?? null;
}

export interface QuestFlowNodeData {
  beatId: string;
  title: string;
  kind: string;
  visibility: string;
  presentation?: QuestBeatPresentation;
  /** True when at least one incoming route is currently closed by a gate —
   *  drawn as a dashed muted border, independent of the wire itself (a beat
   *  can be gated from one route and open from another). */
  isGated: boolean;
  /** True for the one beat named by `quests.entry_beat_id` — the story's
   *  formal opening, as opposed to a computed graph root. */
  isEntry: boolean;
  /** The first line of a rumored beat's rumor copy; null unless drawn for the
   *  players, and for a rumored beat with no copy yet. */
  rumorLine: string | null;
}
export type QuestFlowNode = Node<QuestFlowNodeData>;
export interface QuestFlowEdgeData {
  edgeId: string;
  visited: boolean;
  gate: QuestRouteGate | null;
  routeKind: QuestRouteKind;
  threadLabel: string | null;
  /** The route's destination, for the self-labelling pill's fallback text —
   *  a parallel route with no authored `label` still has something to
   *  say ("opens <target title>"), and a choice route always names its target. */
  targetTitle: string;
  /** The target beat's own reach is `stranded` — the run has walked past the
   *  last junction that could still lead here. */
  stranded: boolean;
  /** Players' view only: the route leads to a beat the party cannot see yet. */
  unseen: boolean;
}
export type QuestFlowEdge = Edge<QuestFlowEdgeData>;

export type QuestGraphCommand =
  | { type: "select" | "open" | "delete-beat"; beatId: string }
  | { type: "move"; beatId: string; x: number; y: number }
  | { type: "link"; sourceBeatId: string; targetBeatId: string }
  | { type: "create"; sourceBeatId?: string; x?: number; y?: number }
  | { type: "select-edge"; edgeId: string }
  | { type: "deselect" };

export function toQuestFlowGraph(
  beats: QuestBeat[],
  edges: QuestBeatEdge[],
  presentations: Record<string, QuestBeatPresentation> = {},
  visitedEdgeIds: ReadonlySet<string> = new Set(),
  routeGates: Record<string, QuestRouteGate> = {},
  entryBeatId: string | null = null,
  lens: QuestFlowLens = "dm",
) {
  const beatsById = new Map(beats.map((beat) => [beat.id, beat]));
  const gatedClosedTargetIds = new Set(
    edges.filter((edge) => {
      const gate = routeGates[edge.id];
      return gate && !gate.is_open;
    }).map((edge) => edge.target_beat_id),
  );
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
      isGated: gatedClosedTargetIds.has(beat.id),
      isEntry: beat.id === entryBeatId,
      rumorLine: lens === "players" && beat.visibility === "rumored" ? rumorLine(beat.rumor_text) : null,
    },
  }));
  const flowEdges: QuestFlowEdge[] = edges.map((edge) => {
    const gate = routeGates[edge.id] ?? null;
    const stranded = presentations[edge.target_beat_id]?.reach === "stranded";
    const unseen = lens === "players" && beatsById.get(edge.target_beat_id)?.visibility === "hidden";
    return {
      id: edge.id,
      source: edge.source_beat_id,
      target: edge.target_beat_id,
      type: "questRoute",
      class: [
        "quest-flow-route",
        visitedEdgeIds.has(edge.id) && "is-visited",
        gate && !gate.is_open && "is-closed",
        edge.route_kind === "parallel" && "is-parallel",
        stranded && "is-stranded",
        unseen && "is-unseen",
      ].filter(Boolean).join(" "),
      data: {
        edgeId: edge.id,
        visited: visitedEdgeIds.has(edge.id),
        gate,
        routeKind: edge.route_kind,
        threadLabel: edge.label,
        targetTitle: beatsById.get(edge.target_beat_id)?.title || "Untitled beat",
        stranded,
        unseen,
      },
    };
  });
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

/** What the party knows of the quest, beat by beat: the Players' view tally. */
export function tallyBeatVisibility(beats: Pick<QuestBeat, "visibility">[]): { revealed: number; rumored: number; hidden: number } {
  const tally = { revealed: 0, rumored: 0, hidden: 0 };
  for (const beat of beats) tally[beat.visibility] += 1;
  return tally;
}
