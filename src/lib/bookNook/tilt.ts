/**
 * Looking round a nook by tilting the phone (pure; the browser plumbing is `useDeviceTilt`).
 *
 * A reading of the phone's angle becomes a view tilt of -1..1 on each axis, measured from the angle the phone
 * was held at when the picture opened (the "level"). Held still, the level drifts to where the phone is, so
 * the view eases back to the middle.
 */
import type { Point } from "./scene.ts";

export interface Orientation {
  beta: number;
  gamma: number;
}

/** Degrees from level at which the view reaches its edge. */
export const FULL_TILT_DEGREES = 20;
/** Seconds of holding still before the level starts following the phone. */
export const STILL_AFTER_SECONDS = 3;
/** How quickly (seconds, exponential) the level follows once the phone has been still. */
export const RECENTRE_TAU = 1.5;

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * The view tilt for a reading, relative to `level`. `screenAngle` is the screen's rotation (0, 90, 180, 270,
 * as `screen.orientation.angle`), so right on the screen stays right when the phone is turned sideways.
 */
export function tiltFromOrientation(reading: Orientation, level: Orientation, screenAngle: number): Point {
  const gx = (reading.gamma - level.gamma) / FULL_TILT_DEGREES;
  const by = (reading.beta - level.beta) / FULL_TILT_DEGREES;
  const turns = ((Math.round(screenAngle / 90) % 4) + 4) % 4;
  const [x, y] = turns === 0 ? [gx, by] : turns === 1 ? [by, -gx] : turns === 2 ? [-gx, -by] : [-by, gx];
  return { x: clamp(x), y: clamp(y) };
}

/** `prev` followed toward `target` exponentially, with time constant `tau` seconds, over `dtSeconds`. */
export function smoothTilt(prev: Point, target: Point, dtSeconds: number, tau = 0.2): Point {
  const k = 1 - Math.exp(-Math.max(0, dtSeconds) / tau);
  return { x: prev.x + (target.x - prev.x) * k, y: prev.y + (target.y - prev.y) * k };
}

/**
 * The level after `dtSeconds` more, given the phone has been still for `stillSeconds`: unchanged until it has
 * been still for `STILL_AFTER_SECONDS`, then easing toward `current`.
 */
export function recentre(level: Orientation, current: Orientation, stillSeconds: number, dtSeconds = 1 / 30): Orientation {
  if (stillSeconds < STILL_AFTER_SECONDS) return level;
  const k = 1 - Math.exp(-Math.max(0, dtSeconds) / RECENTRE_TAU);
  return { beta: level.beta + (current.beta - level.beta) * k, gamma: level.gamma + (current.gamma - level.gamma) * k };
}
