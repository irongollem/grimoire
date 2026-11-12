/*
 * Which finger does what on the painting stage (#1181), as a small state machine with no DOM and no clock:
 * the stage feeds it pointer records with their time and does what it answers.
 *
 * The rules are an iPad painting app's. Once a pen has been seen, a single finger pans and the pen paints;
 * before that, one finger paints. Two fingers pinch. A quick two-finger tap undoes, a three-finger tap
 * redoes. While the pen is down every touch is a resting palm and is ignored.
 */

export interface PointerRecord {
  id: number;
  type: string;
  x: number;
  y: number;
  /** Milliseconds, from the event's own timestamp. */
  time: number;
}

/** A tap is every finger down and up within this long. */
export const TAP_MS = 300;
/** A finger that travels further than this (CSS px) is not tapping. */
export const TAP_SLOP = 10;
/** A finger-painted stroke is not started until the finger has gone this far (CSS px)... */
export const COMMIT_DISTANCE = 4;
/** ...or has been down this long, so a second finger landing a moment later can still cancel it. */
export const COMMIT_MS = 120;

export type DownAction =
  | { kind: "ignore" }
  /** Pen or mouse: paint now. cancelTouches means fingers were already down and are now dropped. */
  | { kind: "paint"; cancelTouches: boolean }
  /** A lone finger with no pen seen: buffer its samples until the stage is told to commit. */
  | { kind: "paint-pending" }
  | { kind: "pan" }
  /** keepStroke: the first finger had painted enough to keep (otherwise the stage discards its buffer). */
  | { kind: "pinch-start"; ids: [number, number]; keepStroke: boolean }
  /** A third finger joined: the pinch is over and this is a three-finger gesture. */
  | { kind: "pinch-end" };

export type MoveAction =
  | { kind: "ignore" }
  | { kind: "pan" }
  | { kind: "pinch" }
  /** Still deciding; keep the samples. */
  | { kind: "buffer" }
  /** Decided to paint: begin the stroke from the buffer, then continue. */
  | { kind: "commit" }
  | { kind: "paint" };

export type UpAction =
  | { kind: "ignore" }
  | { kind: "tap-undo" }
  | { kind: "tap-redo" }
  /** The only finger lifted. commitFirst: it never started a stroke, so begin one (a dot) before ending. */
  | { kind: "end"; commitFirst: boolean }
  | { kind: "none" };

interface Finger {
  startX: number;
  startY: number;
  x: number;
  y: number;
  downTime: number;
}

type Role = "pan" | "paint";

export interface TouchGestures {
  /** True the first time a pen is seen on this page, so the caller can remember it. */
  seePen(): boolean;
  readonly penSeen: boolean;
  down(rec: PointerRecord): DownAction;
  move(rec: PointerRecord): MoveAction;
  up(rec: PointerRecord): UpAction;
  cancel(rec: PointerRecord): UpAction;
}

export function createTouchGestures(opts: { penSeen: boolean }): TouchGestures {
  let penSeen = opts.penSeen;
  let penId: number | null = null;
  const fingers = new Map<number, Finger>();
  // Touches that landed while the pen was down, or were dropped when it came down. Their events are noise.
  const ignored = new Set<number>();
  let gestureStart = 0;
  let maxFingers = 0;
  let tapBroken = false;
  let startDistance = 0;
  let role: Role = "paint";
  let committed = false;

  function resetGesture(): void {
    fingers.clear();
    maxFingers = 0;
    tapBroken = false;
    committed = false;
  }

  function pairDistance(): number {
    const [a, b] = [...fingers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function finish(rec: PointerRecord, cancelled: boolean): UpAction {
    if (rec.type === "pen") {
      if (penId === rec.id) penId = null;
      return { kind: "none" };
    }
    if (rec.type !== "touch") return { kind: "none" };
    if (ignored.delete(rec.id)) return { kind: "ignore" };
    if (!fingers.delete(rec.id)) return { kind: "ignore" };
    if (fingers.size > 0) return { kind: "none" };

    const count = maxFingers;
    const tap = !cancelled && !tapBroken && rec.time - gestureStart <= TAP_MS;
    const commitFirst = role === "paint" && !committed && !cancelled;
    resetGesture();
    if (count === 1) return { kind: "end", commitFirst };
    if (tap && count === 2) return { kind: "tap-undo" };
    if (tap && count === 3) return { kind: "tap-redo" };
    return { kind: "none" };
  }

  return {
    get penSeen() {
      return penSeen;
    },
    seePen() {
      if (penSeen) return false;
      penSeen = true;
      return true;
    },
    down(rec) {
      if (rec.type === "pen") {
        penSeen = true;
        penId = rec.id;
        const had = fingers.size > 0;
        for (const id of fingers.keys()) ignored.add(id);
        resetGesture();
        return { kind: "paint", cancelTouches: had };
      }
      if (rec.type !== "touch") return { kind: "paint", cancelTouches: false };
      if (penId !== null) {
        ignored.add(rec.id);
        return { kind: "ignore" };
      }
      if (fingers.size === 0) {
        gestureStart = rec.time;
        maxFingers = 0;
        tapBroken = false;
        committed = false;
        role = penSeen ? "pan" : "paint";
      }
      fingers.set(rec.id, { startX: rec.x, startY: rec.y, x: rec.x, y: rec.y, downTime: rec.time });
      maxFingers = Math.max(maxFingers, fingers.size);

      if (fingers.size === 1) return penSeen ? { kind: "pan" } : { kind: "paint-pending" };
      if (fingers.size === 2 && maxFingers === 2) {
        const ids = [...fingers.keys()];
        const [a, b] = [ids[0], ids[1]];
        if (a === undefined || b === undefined) return { kind: "ignore" };
        startDistance = pairDistance();
        const first = fingers.get(a);
        // A stroke the first finger had barely started is not a stroke: it was the start of this gesture.
        const keepStroke =
          role === "paint" &&
          first !== undefined &&
          (committed || Math.hypot(first.x - first.startX, first.y - first.startY) >= COMMIT_DISTANCE || rec.time - first.downTime >= COMMIT_MS);
        return { kind: "pinch-start", ids: [a, b], keepStroke };
      }
      return { kind: "pinch-end" };
    },
    move(rec) {
      if (rec.type === "pen") return { kind: "paint" };
      if (rec.type !== "touch") return { kind: "paint" };
      const f = fingers.get(rec.id);
      if (!f || ignored.has(rec.id) || penId !== null) return { kind: "ignore" };
      f.x = rec.x;
      f.y = rec.y;
      if (Math.hypot(f.x - f.startX, f.y - f.startY) > TAP_SLOP) tapBroken = true;
      if (fingers.size === 2 && maxFingers === 2) {
        if (Math.abs(pairDistance() - startDistance) > TAP_SLOP) tapBroken = true;
        return { kind: "pinch" };
      }
      if (fingers.size !== 1 || maxFingers !== 1) return { kind: "ignore" };
      if (role === "pan") return { kind: "pan" };
      if (committed) return { kind: "paint" };
      if (Math.hypot(f.x - f.startX, f.y - f.startY) >= COMMIT_DISTANCE || rec.time - f.downTime >= COMMIT_MS) {
        committed = true;
        return { kind: "commit" };
      }
      return { kind: "buffer" };
    },
    up: (rec) => finish(rec, false),
    cancel: (rec) => finish(rec, true),
  };
}
