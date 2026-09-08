/**
 * Thread swimlanes for the story flow canvas (Quest Manager Redesign, frame
 * `02 Story flow`) — a dashed rectangle drawn behind the nodes, one per live
 * thread, framing every beat that thread has visited plus wherever its cursor
 * stands now. Pure geometry: this module never touches Vue Flow or the DOM,
 * so the canvas component only has to transform the result by its own
 * viewport (`translate(x,y) scale(zoom)`).
 *
 * A thread with nothing to show — no visited beat and no current one — gets
 * no lane at all rather than a lane the size of a single point; there is
 * nothing on the canvas yet for a dashed box to frame.
 */

import { threadBadges, type ThreadLike, type ThreadTone } from "./threads";

export interface SwimlaneRuntimeCursor {
  thread_id: string;
  current_beat_id: string | null;
}

export interface SwimlaneTransition {
  thread_id: string | null;
  to_beat_id: string | null;
}

export interface SwimlaneBeat {
  id: string;
  canvas_x: number;
  canvas_y: number;
}

export interface SwimlaneNodeSize {
  width: number;
  height: number;
}

/** The words the tag uses for where a live thread stands. Only one thread —
 *  the oldest live one — ever reads "party is here"; every other running
 *  thread says "still running" so the tag is not the same sentence repeated
 *  once per lane, and a thread parked at a converge-all beat says "waiting"
 *  regardless of its age. */
export type SwimlaneStateLabel = "party is here" | "still running" | "waiting";

export interface QuestFlowSwimlane {
  threadId: string;
  label: string;
  letter: string;
  stateLabel: SwimlaneStateLabel;
  tone: ThreadTone;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DeriveSwimlanesInput {
  threads: readonly ThreadLike[];
  runtime: readonly SwimlaneRuntimeCursor[];
  transitions: readonly SwimlaneTransition[];
  beats: readonly SwimlaneBeat[];
  nodeSize: SwimlaneNodeSize;
  /** Space between the lane's border and the beats it frames. */
  padding?: number;
}

const DEFAULT_PADDING = 48;

export function deriveSwimlanes(input: DeriveSwimlanesInput): QuestFlowSwimlane[] {
  const padding = input.padding ?? DEFAULT_PADDING;
  const beatPositions = new Map(input.beats.map((beat) => [beat.id, { x: beat.canvas_x, y: beat.canvas_y }]));
  const currentBeatByThread = new Map(input.runtime.map((row) => [row.thread_id, row.current_beat_id]));
  const visitedByThread = new Map<string, Set<string>>();
  for (const transition of input.transitions) {
    if (!transition.thread_id || !transition.to_beat_id) continue;
    const set = visitedByThread.get(transition.thread_id) ?? new Set<string>();
    set.add(transition.to_beat_id);
    visitedByThread.set(transition.thread_id, set);
  }

  const lanes: QuestFlowSwimlane[] = [];
  for (const badge of threadBadges(input.threads)) {
    if (badge.thread.status !== "live" && badge.thread.status !== "waiting") continue;
    const beatIds = new Set(visitedByThread.get(badge.thread.id) ?? []);
    const currentBeatId = currentBeatByThread.get(badge.thread.id);
    if (currentBeatId) beatIds.add(currentBeatId);
    const positions = [...beatIds]
      .map((id) => beatPositions.get(id))
      .filter((position): position is { x: number; y: number } => !!position);
    if (!positions.length) continue;

    const minX = Math.min(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));
    const maxX = Math.max(...positions.map((p) => p.x)) + input.nodeSize.width;
    const maxY = Math.max(...positions.map((p) => p.y)) + input.nodeSize.height;
    const stateLabel: SwimlaneStateLabel = badge.thread.status === "waiting"
      ? "waiting"
      : badge.index === 0
        ? "party is here"
        : "still running";

    lanes.push({
      threadId: badge.thread.id,
      label: badge.thread.label,
      letter: badge.letter,
      stateLabel,
      tone: badge.tone,
      x: minX - padding,
      y: minY - padding,
      w: (maxX - minX) + padding * 2,
      h: (maxY - minY) + padding * 2,
    });
  }
  return lanes;
}
