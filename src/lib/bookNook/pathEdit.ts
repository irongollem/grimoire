/**
 * The maths behind drawing a path on the studio's stage (#1198): points are offsets in room pixels from the
 * layer's `at`, the stage draws them in screen pixels, and a freehand stroke is thinned to a few points the
 * smooth curve passes through. Pure.
 */
import { pathSampler } from "./pathMotion.ts";
import type { Layer, Motion, Point, Scene } from "./scene.ts";
import type { Projector } from "./stageGeometry.ts";

type LayerPlace = Pick<Layer, "at" | "depth">;

/** Where an offset from the layer's `at` falls on the stage. */
export function offsetToScreen(projector: Projector, layer: LayerPlace, offset: Point): Point {
  return projector.toScreen({ x: layer.at.x + offset.x, y: layer.at.y + offset.y }, layer.depth);
}

/** The offset from the layer's `at` under a stage point: the way back from `offsetToScreen`. */
export function screenToOffset(projector: Projector, layer: LayerPlace, point: Point): Point {
  const room = projector.toRoom(point, layer.depth);
  return { x: room.x - layer.at.x, y: room.y - layer.at.y };
}

/** The index of the point nearest `p` within `radius` of it, or -1. A tie goes to the later point (drawn on top). */
export function hitPoint(points: readonly Point[], p: Point, radius: number): number {
  let best = -1;
  let bestDistance = radius;
  points.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - (a.x + f * dx), p.y - (a.y + f * dy));
}

/** Ramer-Douglas-Peucker: the fewest of `points` that keep the line within `tolerance` of the original. */
export function simplifyLine(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  const keep = Array.from({ length: points.length }, () => false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop() as [number, number];
    let far = -1;
    let farDistance = tolerance;
    for (let i = from + 1; i < to; i++) {
      const d = distanceToSegment(points[i], points[from], points[to]);
      if (d > farDistance) {
        far = i;
        farDistance = d;
      }
    }
    if (far >= 0) {
      keep[far] = true;
      stack.push([from, far], [far, to]);
    }
  }
  return points.filter((_, i) => keep[i]).map((p) => ({ ...p }));
}

/**
 * A freehand stroke as the handful of points the curve is built from. Samples closer than `minStep` to the
 * last one kept are dropped, then the line is thinned until it has no more than `max` points: the tolerance
 * doubles from `tolerance` until it does, so a long scribble still ends as a few points and a gentle arc as two or three.
 */
export function strokeToPoints(stroke: readonly Point[], tolerance: number, max = 12, minStep = 2): Point[] {
  const spaced: Point[] = [];
  for (const p of stroke) {
    const last = spaced[spaced.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minStep) spaced.push(p);
  }
  // The stroke's end is where the hand stopped, even when it is closer than a step.
  const end = stroke[stroke.length - 1];
  if (end && spaced[spaced.length - 1] !== end && spaced.length > 1) spaced[spaced.length - 1] = end;
  let line = simplifyLine(spaced, tolerance);
  for (let t = tolerance; line.length > max; t *= 2) line = simplifyLine(spaced, t);
  return line;
}

/**
 * The smooth curve the engine follows through `points`, as offsets to draw, `samples` of them (a closed path
 * ends back on its first point). Fewer than two points have no curve and come back as they are.
 */
export function curveThrough(points: readonly Point[], closed: boolean, samples = 120): Point[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const at = pathSampler([...points], closed);
  // An open sampler goes there and back over one cycle, so the way there is its first half.
  const span = closed ? 1 : 0.5;
  return Array.from({ length: samples + 1 }, (_, i) => {
    const s = at((i / samples) * span);
    return { x: s.x, y: s.y };
  });
}

/**
 * The scene as the stage draws it while a cut-out's path is being edited: that layer's paths stand still (a path
 * with no points leaves the part where it is placed) so the points line up with the picture, and everything else,
 * its other motions included, plays. The motions keep their places, so a flame's flicker does not change.
 */
export function withPathsResting(scene: Scene, layerId: string): Scene {
  const resting = (m: Motion): Motion => (m.kind === "path" ? { ...m, points: [] } : m);
  return {
    ...scene,
    stack: scene.stack.map((item) =>
      item.kind === "layer" && item.id === layerId && item.motions?.some((m) => m.kind === "path") ? ({ ...item, motions: item.motions.map(resting) } as Layer) : item,
    ),
  };
}
