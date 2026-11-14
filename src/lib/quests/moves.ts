import { describeQuestConsequenceAction } from "@/lib/quests/consequences";
import type { QuestBeat, QuestBeatEdge, QuestBeatTransition, QuestConsequence } from "@/types/quest.types";

export interface RoutePreview {
  /** The beat the route marks done. */
  doneTitle: string;
  /** Each payoff that fires when the route is taken. */
  payoffs: string[];
  /** Choice routes out of the same beat that become unreachable. */
  cutOff: string[];
  /** A parallel route opens a thread instead of cutting anything off. */
  opensThread: boolean;
}

/**
 * What taking `edge` would do, read the way `mark_quest_move(kind 'route')`
 * does it: the target's arrival rules and the edge's own rules fire, and a
 * choice route closes its sibling choices.
 */
export function previewRoute(input: {
  edge: Pick<QuestBeatEdge, "id" | "source_beat_id" | "target_beat_id" | "route_kind">;
  edges: Pick<QuestBeatEdge, "id" | "source_beat_id" | "target_beat_id" | "route_kind">[];
  beats: Pick<QuestBeat, "id" | "title">[];
  consequences: QuestConsequence[];
  objectiveLabel: (id: string | null) => string;
}): RoutePreview {
  const { edge, edges, beats, consequences, objectiveLabel } = input;
  const titleOf = (id: string) => beats.find((beat) => beat.id === id)?.title || "Untitled beat";
  const payoffs = consequences
    .filter((rule) => rule.on_edge_id === edge.id || (rule.on_beat_id === edge.target_beat_id && rule.on_beat_outcome === "arrived"))
    .map((rule) => describeQuestConsequenceAction(rule, objectiveLabel));
  const cutOff = edge.route_kind === "choice"
    ? edges
      .filter((other) => other.id !== edge.id && other.source_beat_id === edge.source_beat_id && other.route_kind === "choice")
      .map((other) => titleOf(other.target_beat_id))
    : [];
  return { doneTitle: titleOf(edge.target_beat_id), payoffs, cutOff, opensThread: edge.route_kind === "parallel" };
}

/**
 * The move the toolbar's Undo would take back: the quest's newest transition
 * that arrives at a beat, which is what `undo_quest_move` with no thread undoes
 * (every transition of that move together, so one row names it). Null when the
 * quest has no move to take back.
 */
export function newestUndoableMove<T extends Pick<QuestBeatTransition, "to_beat_id" | "created_at">>(transitions: readonly T[]): T | null {
  let newest: T | null = null;
  for (const transition of transitions) {
    if (!transition.to_beat_id) continue;
    if (!newest || Date.parse(transition.created_at) >= Date.parse(newest.created_at)) newest = transition;
  }
  return newest;
}

type RouteEnds = Pick<QuestBeatEdge, "source_beat_id" | "target_beat_id">;

/**
 * Every simple forward way from one beat to another over the quest's routes, as
 * beat ids from start to end inclusive, shortest first. Breadth-first, so the
 * order is the length order and the cap keeps the shortest ones. A way never
 * visits a beat twice, so a loop in the story cannot spin it; `maxDepth` and
 * the expansion budget bound a dense graph. From a beat to itself the one way is
 * that beat.
 */
export function waysBetween(
  edges: readonly RouteEnds[],
  fromBeatId: string,
  toBeatId: string,
  { maxWays = 6, maxDepth = 24 }: { maxWays?: number; maxDepth?: number } = {},
): string[][] {
  if (fromBeatId === toBeatId) return [[fromBeatId]];
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const list = next.get(edge.source_beat_id) ?? [];
    if (!list.includes(edge.target_beat_id)) list.push(edge.target_beat_id);
    next.set(edge.source_beat_id, list);
  }
  const ways: string[][] = [];
  const queue: string[][] = [[fromBeatId]];
  let expansions = 0;
  for (let head = 0; head < queue.length && ways.length < maxWays && expansions < 20000; head += 1) {
    const path = queue[head]!;
    if (path.length > maxDepth) continue;
    expansions += 1;
    for (const target of next.get(path[path.length - 1]!) ?? []) {
      if (path.includes(target)) continue;
      const extended = [...path, target];
      if (target === toBeatId) {
        ways.push(extended);
        if (ways.length >= maxWays) break;
      } else {
        queue.push(extended);
      }
    }
  }
  return ways;
}

/** Where one thread stands, read the way `mark_quest_move` reads it. */
export interface ThreadStanding {
  /** Its newest arrival, else its cursor, else the quest's entry beat; null when the quest has none. */
  partyBeatId: string | null;
  /** Every beat the thread has arrived at. */
  reachedBeatIds: ReadonlySet<string>;
  entryBeatId: string | null;
}

/**
 * The standing of every thread in `cursors` (thread id to its cursor beat).
 * `transitions` come oldest first, as the quest's history query returns them,
 * so the last arrival of a thread is its newest.
 */
export function threadStandings(input: {
  transitions: readonly Pick<QuestBeatTransition, "thread_id" | "to_beat_id">[];
  cursors: Readonly<Record<string, string | null>>;
  entryBeatId: string | null;
}): Record<string, ThreadStanding> {
  const result: Record<string, ThreadStanding> = {};
  for (const [threadId, cursor] of Object.entries(input.cursors)) {
    const arrivals = input.transitions.filter((t) => t.thread_id === threadId && t.to_beat_id !== null);
    const newest = arrivals.length ? arrivals[arrivals.length - 1]!.to_beat_id : null;
    result[threadId] = {
      partyBeatId: newest ?? cursor ?? input.entryBeatId,
      reachedBeatIds: new Set(arrivals.map((t) => t.to_beat_id!)),
      entryBeatId: input.entryBeatId,
    };
  }
  return result;
}

export type RouteTakeState =
  | { kind: "here"; ways: string[][] }
  | { kind: "ahead"; ways: string[][] }
  | { kind: "past"; reason: string };

/**
 * What the party can do with a route: take it where it stands (it leaves from
 * the party's beat), mark it as taken when it lies ahead (the beats between are
 * filled in, by the way the DM names when there are several), or nothing when
 * it is behind or cut off. Never offered backwards.
 */
export function routeTakeState(input: { edge: RouteEnds; edges: readonly RouteEnds[]; standing: ThreadStanding }): RouteTakeState {
  const { edge, edges, standing } = input;
  if (standing.reachedBeatIds.has(edge.target_beat_id)) return { kind: "past", reason: "Already taken" };
  const start = standing.partyBeatId;
  if (start === null) return { kind: "past", reason: "Give the quest an entry beat first" };
  if (start === edge.source_beat_id) return { kind: "here", ways: [[start]] };
  const ways = waysBetween(edges, start, edge.source_beat_id);
  if (ways.length) return { kind: "ahead", ways };
  return standing.reachedBeatIds.has(edge.source_beat_id)
    ? { kind: "past", reason: "The party is past this route; use Undo to go back" }
    : { kind: "past", reason: "Cut off by an earlier choice" };
}

/** The ways the party could have come to `beatId` from where it stands, for Party here and Failed. */
export type BeatMarkWays = { kind: "direct" } | { kind: "ahead"; ways: string[][] };

export function beatMarkWays(input: { beatId: string; edges: readonly RouteEnds[]; standing: ThreadStanding }): BeatMarkWays {
  const { beatId, edges, standing } = input;
  if (standing.partyBeatId === null || standing.partyBeatId === beatId) return { kind: "direct" };
  const ways = waysBetween(edges, standing.partyBeatId, beatId);
  return ways.length ? { kind: "ahead", ways } : { kind: "direct" };
}

/** The beats a way would mark done: those on it the thread has not arrived at, in order. */
export function beatsFilledIn(way: readonly string[], standing: ThreadStanding, upToBeatId: string | null): string[] {
  const filled: string[] = [];
  for (const id of way) {
    if (id === upToBeatId) break;
    if (!standing.reachedBeatIds.has(id)) filled.push(id);
  }
  return filled;
}

/**
 * One way as a line for the picker and the preview: the beats it fills in, by
 * title, in order. A way that fills in nothing new (every beat on it was
 * already reached) falls back to all of its beats so two ways never read alike
 * for lack of words.
 */
export function describeWay(way: readonly string[], standing: ThreadStanding, upToBeatId: string | null, titleOf: (beatId: string) => string): string {
  const filled = beatsFilledIn(way, standing, upToBeatId);
  const ids = filled.length ? filled : way.filter((id) => id !== upToBeatId);
  return ids.map(titleOf).join(", ");
}
