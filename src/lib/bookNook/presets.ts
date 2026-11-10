/**
 * The studio's vocabulary over the engine's numbers. Six motions named for what they suit (Flame, Cloth,
 * Hanging, Wagging, Floating, Wandering), each with one Strength and one Pace; the engine's own numbers sit behind
 * "Exact". Everything is pure; a preset is a plain engine motion or effect, so a scene stores nothing new.
 */
import { loopFrequency, type Effect, type Layer, type Motion, type Point, type Rect } from "./scene.ts";

export type MotionName = "Flame" | "Cloth" | "Hanging" | "Wagging" | "Floating" | "Wandering";
export type Strength = "faint" | "gentle" | "lively";
export type Pace = "slow" | "steady" | "quick";

export const MOTION_NAMES: MotionName[] = ["Flame", "Cloth", "Hanging", "Wagging", "Floating", "Wandering"];
export const STRENGTHS: Strength[] = ["faint", "gentle", "lively"];
export const PACES: Pace[] = ["slow", "steady", "quick"];

const AMOUNT = {
  Flame: [0.05, 0.09, 0.14],
  Cloth: [0.015, 0.03, 0.05],
  Hanging: [1.2, 2.5, 4],
  // A tail, a flag, a pendulum: a quick wide swing about the pin, which the maker drags to where it joins (the
  // prison cell's dog, 8 Nov 2026, wagged 16 degrees twice a second).
  Wagging: [8, 14, 20],
  Floating: [0.01, 0.02, 0.035],
  Wandering: [0.05, 0.1, 0.18],
};
/** Flame: flickers a second. Hanging and Floating: seconds a cycle. Cloth and Wandering: cycles a loop. */
const PACE = {
  Flame: [1.6, 2.4, 3.4],
  Hanging: [6, 4, 2.5],
  Wagging: [0.8, 0.55, 0.4],
  Floating: [5, 3, 2],
  cycles: [1, 2, 3],
};
const CLOTH_WAVES = 0.8;
/** A tuned number within this share of a preset's still reads as that preset. */
const TOLERANCE = 0.08;

const at = <T>(list: T[], strength: Strength | Pace, order: readonly string[]): T => list[order.indexOf(strength)];

export function motionFor(name: MotionName, strength: Strength, pace: Pace, layer: Pick<Layer, "width">, loop: number): Motion {
  const amount = at(AMOUNT[name], strength, STRENGTHS);
  const cycles = at(PACE.cycles, pace, PACES);
  switch (name) {
    case "Flame":
      return { kind: "flicker", amount, speed: at(PACE.Flame, pace, PACES) };
    case "Cloth":
      return { kind: "billow", amount: amount * layer.width, period: loop / cycles, waves: CLOTH_WAVES };
    case "Hanging":
      return { kind: "sway", angle: amount, period: at(PACE.Hanging, pace, PACES) };
    case "Wagging":
      return { kind: "sway", angle: amount, period: at(PACE.Wagging, pace, PACES) };
    case "Floating":
      return { kind: "bob", dy: amount * layer.width, period: at(PACE.Floating, pace, PACES) };
    case "Wandering":
      return { kind: "drift", dx: amount * layer.width, dy: (amount * layer.width) / 3, period: loop / cycles };
  }
}

const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE * Math.abs(b);
/** The same number of whole cycles per loop: all a period means to the engine. */
const samePeriod = (loop: number, a: number, b: number) => loopFrequency(loop, a) === loopFrequency(loop, b);

/** The preset a motion is, or `{ custom: true }` for anything hand-tuned (Exact). */
export function describeMotion(
  motion: Motion,
  layer: Pick<Layer, "width">,
  loop: number,
): { name: MotionName; strength: Strength; pace: Pace } | { custom: true } {
  for (const name of namesOf(motion)) {
    for (const strength of STRENGTHS) {
      for (const pace of PACES) {
        const preset = motionFor(name, strength, pace, layer, loop);
        if (isPreset(motion, preset, loop)) return { name, strength, pace };
      }
    }
  }
  return { custom: true };
}

/** The presets an engine motion could be: a sway is Hanging when slow and small, Wagging when quick and wide. */
function namesOf(motion: Motion): MotionName[] {
  switch (motion.kind) {
    case "flicker":
      return ["Flame"];
    case "billow":
      return ["Cloth"];
    case "sway":
      return ["Hanging", "Wagging"];
    case "bob":
      return ["Floating"];
    case "drift":
      return ["Wandering"];
  }
}

function isPreset(motion: Motion, preset: Motion, loop: number): boolean {
  // A shifted start is a hand-tuned motion.
  if ("phase" in motion && motion.phase) return false;
  switch (motion.kind) {
    case "flicker":
      return preset.kind === "flicker" && near(motion.amount, preset.amount) && near(motion.speed, preset.speed);
    case "billow":
      return preset.kind === "billow" && near(motion.amount, preset.amount) && samePeriod(loop, motion.period, preset.period) && (motion.waves ?? 1) === CLOTH_WAVES;
    case "sway":
      return preset.kind === "sway" && near(motion.angle, preset.angle) && samePeriod(loop, motion.period, preset.period);
    case "bob":
      return preset.kind === "bob" && near(motion.dy, preset.dy) && samePeriod(loop, motion.period, preset.period);
    case "drift":
      return preset.kind === "drift" && near(motion.dx, preset.dx) && near(motion.dy, preset.dy) && samePeriod(loop, motion.period, preset.period);
  }
}

/** How a part is held in the room: it stands on something, hangs from something, or floats. */
export type Hold = "stands" | "hangs" | "floats";

/** The image point pinned to the part's place: feet, hook or middle. */
export function anchorFor(hold: Hold): Point {
  if (hold === "stands") return { x: 0.5, y: 1 };
  if (hold === "hangs") return { x: 0.5, y: 0 };
  return { x: 0.5, y: 0.5 };
}

/** The contact shadow a part that stands gets by default. */
export function standingShadow(width: number): NonNullable<Layer["shadow"]> {
  return { rx: width * 0.4, ry: width * 0.08, opacity: 0.35 };
}

/** Depth: how far a part moves with the camera. The picture is the plate. */
export const DEPTH = { far: 0.3, picture: 1, near: 1.45, min: 0.2, max: 1.6 };

export function clampDepth(depth: number): number {
  return Math.max(DEPTH.min, Math.min(DEPTH.max, depth));
}

export type TouchKind = "glow" | "steam" | "smoke" | "dust" | "embers" | "rain" | "snow" | "fireflies" | "leaves";

/**
 * A touch dropped on the room: a point for a glow, steam or smoke, a rectangle for the rest. Sizes scale with
 * the room's width. `loop` caps a wisp's life, which must stay under it. Smoke is steam gone grey and slow.
 */
export function touchPreset(kind: TouchKind, where: Point | Rect, roomWidth: number, loop = 12): Effect {
  const k = roomWidth / 1000;
  const isArea = "w" in where;
  if (kind === "glow" || kind === "steam" || kind === "smoke") {
    if (isArea) throw new Error(`A ${kind} is placed at a point, not over an area.`);
    if (kind === "glow") return { kind: "light", at: where, depth: DEPTH.picture, radius: 260 * k, color: [255, 190, 110], intensity: 0.6 };
    // Tuned on the inn's kettle (#1139): many faint overlapping wisps read as one plume; a few strong ones read
    // as bubbles. Pale steam on a pale wall has to be fairly strong to show at all.
    const smoke = kind === "smoke";
    const life = smoke ? Math.min(7, loop * 0.6) : Math.min(5, loop * 0.45);
    return {
      kind: "steam",
      at: where,
      depth: DEPTH.picture,
      count: smoke ? 30 : 40,
      life,
      rise: 260 * k * (smoke ? 1.2 : 1),
      spread: 80 * k,
      size: [10 * k, 48 * k],
      opacity: smoke ? 0.4 : 0.5,
      color: smoke ? [120, 110, 100] : [250, 242, 232],
    };
  }
  if (!isArea) throw new Error(`${kind} fills an area, not a point.`);
  const style = kind === "dust" ? "motes" : kind;
  if (style === "motes") return { kind: "motes", area: where, depth: DEPTH.picture, count: 28, size: [2 * k, 5 * k], opacity: 0.5, color: [255, 235, 190] };
  const sizes: Record<typeof style, { count: number; size: [number, number]; opacity: number; color: [number, number, number] }> = {
    embers: { count: 22, size: [2 * k, 4.5 * k], opacity: 0.9, color: [255, 150, 60] },
    rain: { count: 90, size: [2 * k, 5 * k], opacity: 0.45, color: [190, 205, 225] },
    snow: { count: 60, size: [2 * k, 5 * k], opacity: 0.8, color: [250, 250, 255] },
    fireflies: { count: 14, size: [3 * k, 6 * k], opacity: 0.9, color: [210, 255, 120] },
    leaves: { count: 12, size: [6 * k, 11 * k], opacity: 0.85, color: [190, 120, 50] },
  };
  return { kind: "particles", style, area: where, depth: DEPTH.near, ...sizes[style] };
}
