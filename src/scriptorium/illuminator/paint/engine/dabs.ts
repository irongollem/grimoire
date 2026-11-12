import { applyPressureCurve } from "./pressure";
import type { BrushPreset, DynamicControl, PenSample, PressureCurve, Rgb, Varied } from "./types";

/** One dab to stamp: where, how big, how turned, and how much paint. */
export interface DabSpec {
  x: number;
  y: number;
  /** Diameter in canvas pixels. */
  size: number;
  /** Degrees, clockwise. */
  angle: number;
  roundness: number;
  /** 0 to 1, from the brush's flow dynamics (multiplied by the base flow). */
  flow: number;
  /** 0 to 1 scaling of this dab's paint; the stroke's opacity cap is separate. */
  opacity: number;
  /** The dab's own colour when the brush varies colour, else null (use the stroke colour). */
  colour: Rgb | null;
}

export interface DabOptions {
  brush: BrushPreset;
  colour: Rgb;
  curve: PressureCurve;
  rng: () => number;
  /** The options bar's size, replacing the tip's own. */
  size?: number;
}

interface Point {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
}

interface Dynamics {
  pressure: number;
  tilt: number;
  rotation: number;
  direction: number;
  fade: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function rgbToHsv({ r, g, b }: Rgb): [number, number, number] {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const d = max - Math.min(rr, gg, bb);
  let h = 0;
  if (d > 0) {
    if (max === rr) h = ((gg - bb) / d + 6) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
  }
  return [h / 6, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h: number, s: number, v: number): Rgb {
  const hh = (((h % 1) + 1) % 1) * 6;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i % 6] ?? [v, p, q];
  return { r: (r ?? 0) * 255, g: (g ?? 0) * 255, b: (b ?? 0) * 255 };
}

/**
 * Turns pen samples into dabs: smooths, runs a Catmull-Rom curve through the points, and stamps a
 * dab every `spacing * size` pixels of arc length. The leftover distance carries across `add` calls,
 * and every random choice comes from the seeded rng, so a stroke replays from its samples.
 */
export class DabGenerator {
  private readonly brush: BrushPreset;
  private readonly colour: Rgb;
  private readonly curve: PressureCurve;
  private readonly rng: () => number;
  private readonly baseSize: number;
  private smoothed: { x: number; y: number } | null = null;
  private last: Point | null = null;
  private prev: Point | null = null;
  private mouse = false;
  private travelled = 0;
  private toNext = 0;
  private started = false;

  constructor(o: DabOptions) {
    this.brush = o.brush;
    this.colour = o.colour;
    this.curve = o.curve;
    this.rng = o.rng;
    this.baseSize = o.size ?? o.brush.tip.size;
  }

  add(samples: PenSample[]): DabSpec[] {
    const out: DabSpec[] = [];
    // Smoothing 0 follows the pen exactly; 1 keeps 5% of each new move.
    const follow = 1 - 0.95 * clamp01(this.brush.smoothing);
    for (const s of samples) {
      if (!this.last) this.mouse = s.pointer === "mouse";
      const pos = this.smoothed
        ? { x: lerp(this.smoothed.x, s.x, follow), y: lerp(this.smoothed.y, s.y, follow) }
        : { x: s.x, y: s.y };
      this.smoothed = pos;
      const p: Point = { x: pos.x, y: pos.y, pressure: s.pressure, tiltX: s.tiltX, tiltY: s.tiltY, twist: s.twist };
      if (!this.last) {
        this.last = p;
        continue;
      }
      if (Math.hypot(p.x - this.last.x, p.y - this.last.y) < 0.01) continue;
      this.segment(this.prev ?? this.last, this.last, p, out);
      this.prev = this.last;
      this.last = p;
    }
    return out;
  }

  /** A stroke of one sample (a tap) has laid nothing yet; this stamps it. */
  finish(): DabSpec[] {
    const out: DabSpec[] = [];
    if (!this.started && this.last) {
      this.started = true;
      this.emit(this.last.x, this.last.y, 0, this.last, out);
    }
    return out;
  }

  private segment(p0: Point, p1: Point, p2: Point, out: DabSpec[]): void {
    const p3 = { x: p2.x + (p2.x - p1.x), y: p2.y + (p2.y - p1.y) };
    const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const n = Math.min(2048, Math.max(1, Math.ceil(chord)));
    let px = p1.x;
    let py = p1.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      const len = Math.hypot(x - px, y - py);
      if (len > 0) {
        const heading = (Math.atan2(y - py, x - px) * 180) / Math.PI;
        const attrs = this.attrsAt(p1, p2, (i - 0.5) / n);
        if (!this.started) {
          this.started = true;
          this.emit(px, py, heading, this.attrsAt(p1, p2, 0), out);
        }
        let pos = 0;
        while (this.toNext <= len - pos) {
          pos += this.toNext;
          const f = pos / len;
          this.travelled += this.toNext;
          this.emit(lerp(px, x, f), lerp(py, y, f), heading, attrs, out);
        }
        this.travelled += len - pos;
        this.toNext -= len - pos;
      }
      px = x;
      py = y;
    }
  }

  private attrsAt(a: Point, b: Point, t: number): Point {
    return {
      x: 0,
      y: 0,
      pressure: lerp(a.pressure, b.pressure, t),
      tiltX: lerp(a.tiltX, b.tiltX, t),
      tiltY: lerp(a.tiltY, b.tiltY, t),
      twist: lerp(a.twist, b.twist, t),
    };
  }

  private dynamics(attrs: Point, heading: number): Dynamics {
    const lean = Math.min(1, Math.hypot(attrs.tiltX, attrs.tiltY) / 90);
    const fade = this.brush.fadeLength > 0 ? clamp01(1 - this.travelled / this.brush.fadeLength) : 1;
    return {
      pressure: this.mouse ? fade : applyPressureCurve(this.curve, attrs.pressure),
      tilt: lean,
      rotation: (((attrs.twist % 360) + 360) % 360) / 360,
      direction: (((heading % 360) + 360) % 360) / 360,
      fade,
    };
  }

  private control(c: DynamicControl, d: Dynamics): number {
    if (c === "off") return 1;
    // A mouse has no pressure, so a pressure control follows the fade instead.
    return d[c];
  }

  /** The factor (0 to 1) a varied value takes: its control, thinned by random jitter, never below its minimum. */
  private varied(v: Varied, d: Dynamics): number {
    let f = v.control === "off" ? 1 : lerp(v.minimum, 1, this.control(v.control, d));
    if (v.jitter > 0) f *= 1 - v.jitter * this.rng();
    return Math.max(v.minimum, f);
  }

  private emit(x: number, y: number, heading: number, attrs: Point, out: DabSpec[]): void {
    const { brush } = this;
    const d = this.dynamics(attrs, heading);
    const shape = brush.shape;
    let size = this.baseSize;
    let angle = brush.tip.angle + (brush.tip.followDirection ? heading : 0);
    let roundness = brush.tip.roundness;
    if (shape) {
      size *= this.varied(shape.size, d);
      if (shape.angle.control !== "off") angle += this.control(shape.angle.control, d) * 360;
      if (shape.angle.jitter > 0) angle += shape.angle.jitter * 360 * (this.rng() - 0.5);
      roundness *= this.varied(shape.roundness, d);
    }
    size = Math.max(1, size);
    const flow = this.varied(brush.transfer.flowDynamics, d);
    const opacity = this.varied(brush.transfer.opacityDynamics, d);

    const sc = brush.scatter;
    let count = 1;
    if (sc) count = Math.max(1, Math.round(sc.count * (1 + sc.countJitter * (this.rng() - 0.5) * 2)));
    const rad = (heading * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      let ox = 0;
      let oy = 0;
      if (sc && sc.amount > 0) {
        const reach = sc.amount * size;
        if (sc.bothAxes) {
          ox = (this.rng() - 0.5) * 2 * reach;
          oy = (this.rng() - 0.5) * 2 * reach;
        } else {
          const across = (this.rng() - 0.5) * 2 * reach;
          ox = -Math.sin(rad) * across;
          oy = Math.cos(rad) * across;
        }
      }
      out.push({ x: x + ox, y: y + oy, size, angle, roundness, flow, opacity, colour: this.jitterColour() });
    }
    this.toNext = Math.max(1, brush.tip.spacing * size);
  }

  private jitterColour(): Rgb | null {
    const c = this.brush.colour;
    if (!c) return null;
    const [h, s, v] = rgbToHsv(this.colour);
    return hsvToRgb(
      h + (this.rng() - 0.5) * c.hue,
      clamp01(s + (this.rng() - 0.5) * 2 * c.saturation),
      clamp01(v + (this.rng() - 0.5) * 2 * c.value),
    );
  }
}
