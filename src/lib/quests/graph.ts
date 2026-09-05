import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

type GraphEdge = Pick<QuestBeatEdge, "source_beat_id" | "target_beat_id">;
type GraphBeat = Pick<QuestBeat, "id" | "kind">;

function outgoingByBeat(edges: GraphEdge[]): Map<string, string[]> {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoing.get(edge.source_beat_id) ?? [];
    targets.push(edge.target_beat_id);
    outgoing.set(edge.source_beat_id, targets);
  }
  return outgoing;
}

/** Breadth-first graph walk. `seen` is updated before enqueueing, so authored
 * cycles and converging branches cannot loop or duplicate beats. */
export function getReachableBeatIds(startBeatId: string, edges: GraphEdge[]): string[] {
  const outgoing = outgoingByBeat(edges);
  const seen = new Set([startBeatId]);
  const queue = [startBeatId];
  const reachable: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const target of outgoing.get(current) ?? []) {
      if (seen.has(target)) continue;
      seen.add(target);
      reachable.push(target);
      queue.push(target);
    }
  }

  return reachable;
}

/**
 * The opening beat, computed rather than stored (#793): a non-archived beat
 * with no incoming edge. A quest may legitimately open from more than one
 * place — the party can pick the thread up at the tavern or at the docks —
 * so this returns every root rather than inventing a single winner. An empty
 * result is equally legitimate: a pure cycle, or no beats authored yet.
 */
export function rootBeatIds(beats: readonly GraphBeat[], edges: GraphEdge[]): string[] {
  const hasIncoming = new Set(edges.map((edge) => edge.target_beat_id));
  return beats
    .filter((beat) => beat.kind !== "archived" && !hasIncoming.has(beat.id))
    .map((beat) => beat.id);
}

/** Returns the shortest directed path, including both endpoints. */
export function findBeatPath(
  startBeatId: string,
  targetBeatId: string,
  edges: GraphEdge[],
): string[] | null {
  if (startBeatId === targetBeatId) return [startBeatId];

  const outgoing = outgoingByBeat(edges);
  const seen = new Set([startBeatId]);
  const queue: string[][] = [[startBeatId]];

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1]!;
    for (const target of outgoing.get(current) ?? []) {
      if (seen.has(target)) continue;
      const nextPath = [...path, target];
      if (target === targetBeatId) return nextPath;
      seen.add(target);
      queue.push(nextPath);
    }
  }

  return null;
}
