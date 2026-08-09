import type { QuestBeatEdge } from "@/types/quest.types";

type GraphEdge = Pick<QuestBeatEdge, "source_beat_id" | "target_beat_id">;

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
