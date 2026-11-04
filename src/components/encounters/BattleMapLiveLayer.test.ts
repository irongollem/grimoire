import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import BattleMapLiveLayer from "./BattleMapLiveLayer.vue";
import type { MapLive } from "@/types/mapLive.types";

enableAutoUnmount(afterEach);

const withFire = (color: string): MapLive => ({
  version: 3,
  darkness: "dark",
  groups: [],
  lights: [{ x: 2, y: 2, color, bright: 20, dim: 20, phase: 0.3 }], // no flicker field
  sprites: [],
  walls: [],
  doors: [],
  solid: [],
});
const mountLayer = (live: MapLive) =>
  mount(BattleMapLiveLayer, { props: { hostW: 200, hostH: 200, cellPx: 50, originX: 0, originY: 0, live, stratum: "ground" } });

describe("the live layer's loop for firelight", () => {
  const frame = vi.fn(() => 1);
  beforeEach(() => {
    frame.mockClear();
    vi.stubGlobal("requestAnimationFrame", frame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());
  const reduced = (on: boolean) =>
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: on && query.includes("reduce"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));

  it("runs a loop for a brazier in a flame's colour that declares no flicker", () => {
    reduced(false);
    mountLayer(withFire("#ffb347"));
    expect(frame).toHaveBeenCalled();
  });

  it("holds still for reduced motion: no loop, so the fire stays at its baked glow", () => {
    reduced(true);
    mountLayer(withFire("#ffb347"));
    expect(frame).not.toHaveBeenCalled();
  });

  it("runs a loop for a cool light too: it pulses", () => {
    reduced(false);
    mountLayer(withFire("#88aaff"));
    expect(frame).toHaveBeenCalled();
  });
});

// The maintainer, 2 Nov 2026: "zooming and panning feels REALLY slow". Each fire's glow was composed at the map's own
// resolution (2,000 px wide at 128 px a cell) and laid on the layer one light at a time, every frame.
describe("the live layer's glow", () => {
  type Draw = { canvas: HTMLCanvasElement; source: unknown; op: string; args: unknown[] };
  let draws: Draw[] = [];
  let tick: FrameRequestCallback | null = null;
  beforeEach(() => {
    draws = [];
    tick = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => ((tick = cb), 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      const ctx = {
        canvas: this,
        globalCompositeOperation: "source-over",
        imageSmoothingEnabled: false,
        fillStyle: "" as unknown,
        save: () => {},
        restore: () => {},
        clearRect: () => {},
        fillRect: () => {},
        createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        drawImage: (source: unknown, ...args: unknown[]) => draws.push({ canvas: ctx.canvas, source, op: ctx.globalCompositeOperation, args }),
      };
      return ctx as unknown as CanvasRenderingContext2D;
    } as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("composes every light's glow at a few pixels a cell and lays it on the layer in one draw", () => {
    const live: MapLive = {
      ...withFire("#ffb347"),
      lights: [
        { x: 2, y: 2, color: "#ffb347", bright: 20, dim: 20, phase: 0.3 },
        { x: 4, y: 3, color: "#ffb347", bright: 20, dim: 20, phase: 1.1 },
      ],
    };
    const w = mount(BattleMapLiveLayer, { props: { hostW: 800, hostH: 800, cellPx: 128, originX: 0, originY: 0, live, stratum: "ground" } });
    tick?.(500);
    const layer = w.find("canvas").element as HTMLCanvasElement;
    const onLayer = draws.filter((d) => d.canvas === layer && d.op === "screen");
    expect(onLayer).toHaveLength(1);
    // Source box (sx, sy, sw, sh) then destination (dx, dy, dw, dh): the source is a fraction of what it covers.
    const [, , sw, , , , dw] = onLayer[0].args as number[];
    expect(sw).toBeLessThanOrEqual(dw / 8);
  });
});
