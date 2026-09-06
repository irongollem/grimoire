import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

type GraphEdge = Pick<QuestBeatEdge, "source_beat_id" | "target_beat_id">;
type GraphBeat = Pick<QuestBeat, "id" | "kind" | "is_improvised">;

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
 *
 * Improvised beats are excluded, and that exclusion is load-bearing rather
 * than tidy. `improvise_quest_runtime` defaults `p_keep_edge` to false, so a
 * beat named at the table mid-session has no incoming edge — which under the
 * rule above would make the quest sprout a second "opening" the moment the
 * party went off script. An improvisation is by definition something that
 * happened part-way through a story, never an entrance to it.
 */
export function rootBeatIds(beats: readonly GraphBeat[], edges: GraphEdge[]): string[] {
  const hasIncoming = new Set(edges.map((edge) => edge.target_beat_id));
  return beats
    .filter((beat) => beat.kind !== "archived" && !beat.is_improvised && !hasIncoming.has(beat.id))
    .map((beat) => beat.id);
}

/**
 * Every non-archived beat, in the order a party walking the authored story
 * would meet it: root-first, breadth-first from each root in turn — reusing
 * {@link rootBeatIds} and {@link getReachableBeatIds} rather than a third
 * traversal. A beat no root can reach — a cyclic island, or a quest authored
 * with no root at all (`rootBeatIds` returns none for a pure cycle) — still
 * needs a place in a backfill list, so anything left over is appended in
 * authored (array) order rather than silently dropped (#796).
 *
 * An edge pointing at an id absent from `beats` (a stray row, or a beat from
 * another quest) is ignored rather than trusted — the result only ever names
 * beats the caller actually has data for.
 */
export function storyBeatOrder(beats: readonly GraphBeat[], edges: GraphEdge[]): string[] {
  const validIds = new Set(beats.filter((beat) => beat.kind !== "archived").map((beat) => beat.id));
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const rootId of rootBeatIds(beats, edges)) {
    if (seen.has(rootId)) continue;
    seen.add(rootId);
    ordered.push(rootId);
    for (const id of getReachableBeatIds(rootId, edges)) {
      if (seen.has(id) || !validIds.has(id)) continue;
      seen.add(id);
      ordered.push(id);
    }
  }

  for (const beat of beats) {
    if (beat.kind === "archived" || seen.has(beat.id)) continue;
    seen.add(beat.id);
    ordered.push(beat.id);
  }

  return ordered;
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
