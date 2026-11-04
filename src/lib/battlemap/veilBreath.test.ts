import { describe, expect, it } from "vitest";
import { lightReachCells } from "@/cartographer/lights";
import { DM_VEIL } from "@/lib/battlemap/darkness";
import { lightRadiusScale } from "@/lib/battlemap/liveLayer";
import { breathingLights, breathOf, createVeilBreath, SCRATCH_SCALE, type BreathFrame, type BreathMask } from "@/lib/battlemap/veilBreath";
import type { MapLiveLight } from "@/types/mapLive.types";

// A recording canvas: every draw op is logged with the composite mode it ran under.
interface Op {
  kind: "fillRect" | "drawImage" | "gradient" | "stop";
  op: string;
  args: unknown[];
}
function recorder(log: Op[]) {
  const ctx = {
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: false,
    fillStyle: "" as unknown,
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    createRadialGradient: (...args: number[]) => {
      log.push({ kind: "gradient", op: ctx.globalCompositeOperation, args });
      return { addColorStop: (...stop: unknown[]) => log.push({ kind: "stop", op: ctx.globalCompositeOperation, args: stop }) };
    },
    fillRect: () => log.push({ kind: "fillRect", op: ctx.globalCompositeOperation, args: [] }),
    drawImage: (...args: unknown[]) => log.push({ kind: "drawImage", op: ctx.globalCompositeOperation, args }),
  };
  return ctx;
}

const CELL = 40;
const fire = (over: Partial<MapLiveLight> = {}): MapLiveLight => ({ x: 5, y: 5, color: "#ff8833", bright: 20, dim: 20, phase: 0, ...over });
const MASK_CANVAS = { tag: "mask" } as unknown as CanvasImageSource;
const mask: BreathMask = { canvas: MASK_CANVAS, x0: 0, y0: 0, x1: 12, y1: 12 };

function setup() {
  const scratchLog: Op[] = [];
  const veilLog: Op[] = [];
  const scratch = recorder(scratchLog);
  const veil = recorder(veilLog);
  const breath = createVeilBreath(() => ({ canvas: { width: 1, height: 1 } as unknown as CanvasImageSource, ctx: scratch as never }));
  const frame = (over: Partial<BreathFrame>): BreathFrame => ({
    lights: [fire()],
    t: 0,
    cellPx: CELL,
    originX: 0,
    originY: 0,
    hostW: 800,
    hostH: 800,
    darkness: "dark",
    maskOf: () => mask,
    ...over,
  });
  return { breath, scratchLog, veilLog, veil, frame };
}

/** A time at which the light's reach is past (or inside) its steady one by at least `by`. */
function timeWhere(light: MapLiveLight, test: (scale: number) => boolean): number {
  for (let t = 0; t < 120; t += 0.05) if (test(lightRadiusScale(light, t))) return t;
  throw new Error("no such moment");
}

describe("the veil's lit edge breathing", () => {
  it("lifts the veil out to the swollen reach, past the steady edge, when a light swells", () => {
    const light = fire();
    const t = timeWhere(light, (s) => s > 1.1);
    const { breath, scratchLog, veilLog, veil, frame } = setup();
    breath.paint(veil as never, frame({ lights: [light], t }));
    const grad = scratchLog.find((o) => o.kind === "gradient");
    const steady = lightReachCells(light) * CELL;
    expect(grad?.args[5]).toBeGreaterThan(steady * SCRATCH_SCALE);
    expect(grad?.args[5]).toBeCloseTo(steady * SCRATCH_SCALE * lightRadiusScale(light, t), 5);
    expect(veilLog.some((o) => o.kind === "drawImage" && o.op === "destination-out")).toBe(true);
  });

  it("lays the veil back inside the steady edge, in the veil's own colour, when a light fades", () => {
    const light = fire();
    const t = timeWhere(light, (s) => s < 0.9);
    const { breath, scratchLog, veilLog, veil, frame } = setup();
    breath.paint(veil as never, frame({ lights: [light], t }));
    const grad = scratchLog.find((o) => o.kind === "gradient");
    expect(grad?.args[5]).toBeCloseTo(lightReachCells(light) * CELL * SCRATCH_SCALE, 5);
    const layed = veilLog.filter((o) => o.kind === "drawImage");
    expect(layed.some((o) => o.op === "source-over")).toBe(true);
    expect(layed.some((o) => o.op === "destination-out")).toBe(false);
    const colour = scratchLog.filter((o) => o.kind === "stop").map((o) => String(o.args[1]));
    expect(colour.some((c) => c.startsWith("rgba(8,10,24,"))).toBe(true);
  });

  it("cuts the ring to the light's sight, so a wall behind the light keeps its darkness", () => {
    const light = fire();
    const t = timeWhere(light, (s) => s > 1.1);
    const { breath, scratchLog, veil, frame } = setup();
    breath.paint(veil as never, frame({ lights: [light], t }));
    const ring = scratchLog.findIndex((o) => o.kind === "fillRect");
    const cut = scratchLog.findIndex((o, i) => i > ring && o.kind === "drawImage" && o.op === "destination-in" && o.args[0] === MASK_CANVAS);
    expect(cut).toBeGreaterThan(ring);
  });

  // The maintainer, 2 Nov 2026: "zooming and panning feels REALLY slow". Each light was laid on the screen-sized veil
  // two or three times a frame, about half a millisecond a draw.
  it("lays every light's halo onto the veil in one draw, however many lights breathe", () => {
    const a = fire({ x: 5, y: 5 });
    const b = fire({ x: 9, y: 6 });
    const t = timeWhere(a, (s) => s > 1.1);
    const { breath, veilLog, veil, frame } = setup();
    expect(breath.paint(veil as never, frame({ lights: [a, b], t }))).toBe(2);
    expect(veilLog.filter((o) => o.kind === "drawImage" && o.op === "screen")).toHaveLength(1);
  });

  it("draws nothing for a light whose reach is at its steady one", () => {
    const light = fire();
    const t = timeWhere(light, (s) => Math.abs(s - 1) < 0.005);
    expect(breathOf(light, t).mode).toBe("none");
    const { breath, scratchLog, veilLog, veil, frame } = setup();
    expect(breath.paint(veil as never, frame({ lights: [light], t }))).toBe(0);
    expect([...scratchLog, ...veilLog]).toHaveLength(0);
  });

  it("skips a light that is off screen", () => {
    const light = fire({ x: 500, y: 500 });
    const t = timeWhere(light, (s) => s > 1.1);
    const { breath, veil, frame } = setup();
    expect(breath.paint(veil as never, frame({ lights: [light], t }))).toBe(0);
  });

  it("two lights breathe out of step: one swells while the other is drawn in", () => {
    const a = fire({ phase: 0 });
    const b = fire({ phase: 2.4 });
    let opposed = false;
    for (let t = 0; t < 60; t += 0.1) {
      if (lightRadiusScale(a, t) > 1.05 && lightRadiusScale(b, t) < 0.95) opposed = true;
    }
    expect(opposed).toBe(true);
  });

  it("a fading light standing in another's core is not laid darker, but a swelling one still lifts", () => {
    const small = fire({ x: 5, y: 5, bright: 5, dim: 5 });
    const big = fire({ x: 5.5, y: 5, bright: 40, dim: 40, phase: 1 });
    const tFade = timeWhere(small, (s) => s < 0.9);
    const { breath, veilLog, veil, frame } = setup();
    // `big` is given no sight mask so it draws nothing itself: whatever is laid back is `small`'s.
    breath.paint(veil as never, frame({ lights: [small, big], t: tFade, maskOf: (l) => (l === big ? null : mask) }));
    expect(veilLog.filter((o) => o.kind === "drawImage" && o.op === "source-over")).toHaveLength(0);
    const alone = setup();
    alone.breath.paint(alone.veil as never, alone.frame({ lights: [small], t: tFade }));
    expect(alone.veilLog.filter((o) => o.kind === "drawImage" && o.op === "source-over")).toHaveLength(1);
  });

  it("scales the veil laid back to the ambient: a dim map is laid back half as strongly as a dark one", () => {
    const light = fire();
    const t = timeWhere(light, (s) => s < 0.88);
    const alpha = (darkness: "dim" | "dark") => {
      const { breath, scratchLog, veil, frame } = setup();
      breath.paint(veil as never, frame({ lights: [light], t, darkness }));
      const last = scratchLog.filter((o) => o.kind === "stop" && String(o.args[1]).startsWith("rgba(8,10,24,")).pop();
      return Number(String(last?.args[1]).split(",")[3].replace(")", ""));
    };
    expect(alpha("dim") / alpha("dark")).toBeCloseTo(DM_VEIL.dim / DM_VEIL.dark, 2);
  });

  it("never lifts the veil where a player sees nothing", () => {
    const light = fire();
    const t = timeWhere(light, (s) => s > 1.1);
    const { breath, veilLog, veil, frame } = setup();
    breath.paint(veil as never, frame({ lights: [light], t, limit: null }));
    expect(veilLog.some((o) => o.op === "destination-out" || o.op === "screen")).toBe(false);
  });

  it("holds a player's ring to what they see", () => {
    const light = fire();
    const t = timeWhere(light, (s) => s > 1.1);
    const seen = { tag: "seen" } as unknown as CanvasImageSource;
    const { breath, scratchLog, veil, frame } = setup();
    breath.paint(veil as never, frame({ lights: [light], t, limit: seen }));
    expect(scratchLog.some((o) => o.kind === "drawImage" && o.op === "destination-in" && o.args[0] === seen)).toBe(true);
  });

  it("a light inside a sphere of magical darkness does not breathe", () => {
    const inside = fire({ x: 2, y: 2 });
    const outside = fire({ x: 30, y: 30 });
    expect(breathingLights([inside, outside], [{ x: 2, y: 2, radius: 15 }])).toEqual([outside]);
  });
});
