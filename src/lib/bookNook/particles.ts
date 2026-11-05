/**
 * Particles: weather and small living things in a rectangle (embers, rain, snow, fireflies, leaves). Pure, and
 * exactly periodic in the scene's loop, like every other motion: each particle's travel is a whole number of
 * trips per loop, and every wobble is a whole number of cycles.
 */
import { mod, seeded, type Scene, type Effect } from "./scene.ts";

export type Particles = Extract<Effect, { kind: "particles" }>;

export interface Particle {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  /** Radians, 0 to a full turn: a leaf's turn, or how far a raindrop leans from straight down. */
  angle: number;
}

const TAU = Math.PI * 2;
/** How far a raindrop leans: sideways pixels per pixel fallen. */
export const RAIN_LEAN = 0.18;

const frac = (x: number) => x - Math.floor(x);
/** A whole number from `lo` to `hi`, inclusive. */
const whole = (rand: () => number, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

/** The particles of an effect at `t`; `index` is the effect's place in the stack, so two effects differ. */
export function particlesAt(scene: Scene, effect: Particles, t: number, index = 0): Particle[] {
  const rand = seeded(scene.seed + 4409 * (index + 1));
  const { x, y, w, h } = effect.area;
  const [lo, hi] = effect.size;
  return Array.from({ length: effect.count }, () => {
    const cx = x + rand() * w;
    const cy = y + rand() * h;
    const phase = rand();
    const turn = rand() * TAU;
    const radius = lo + rand() * (hi - lo);
    const sway = whole(rand, 1, 3);
    const spin = whole(rand, 1, 2);
    const blink = whole(rand, 3, 6);
    const trips = whole(rand, 3, 5);
    const rise = whole(rand, 1, 2);
    const a = (TAU * t) / scene.loop;
    switch (effect.style) {
      case "rain": {
        const f = frac(phase + (trips * t) / scene.loop);
        const fall = f * h;
        return { x: cx + fall * RAIN_LEAN, y: y + fall, radius, alpha: effect.opacity * Math.sin(Math.PI * f), angle: Math.atan(RAIN_LEAN) };
      }
      case "snow": {
        const f = frac(phase + t / scene.loop);
        return { x: cx + Math.sin(sway * a + turn) * w * 0.03, y: y + f * h, radius, alpha: effect.opacity * Math.sin(Math.PI * f), angle: 0 };
      }
      case "leaves": {
        const f = frac(phase + t / scene.loop);
        return { x: cx + Math.sin(sway * a + turn) * w * 0.05, y: y + f * h, radius, alpha: effect.opacity * Math.sin(Math.PI * f), angle: mod(spin * a + turn, TAU) };
      }
      case "embers": {
        const f = frac(phase + (rise * t) / scene.loop);
        const glow = 0.6 + 0.4 * Math.sin(blink * a + turn);
        return { x: cx + Math.sin(sway * a + turn) * w * 0.03, y: y + h - f * h, radius, alpha: effect.opacity * Math.sin(Math.PI * f) * glow, angle: 0 };
      }
      case "fireflies": {
        const k = whole(rand, 1, 2);
        const b = k * a + turn;
        const on = Math.max(0, Math.sin(blink * a + turn));
        return { x: cx + Math.sin(b) * w * 0.1, y: cy + Math.sin(2 * b) * h * 0.08, radius, alpha: effect.opacity * on * on, angle: 0 };
      }
    }
  });
}
