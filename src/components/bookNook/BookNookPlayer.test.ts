import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import BookNookPlayer from "./BookNookPlayer.vue";
import type { Scene } from "@/lib/bookNook/scene";

const render = vi.hoisted(() => ({ drawScene: vi.fn(), loadImages: vi.fn() }));
vi.mock("@/lib/bookNook/render", () => render);

const scene: Scene = {
  id: "r",
  title: "The Inn at Dawn",
  size: { width: 1000, height: 1000 },
  loop: 12,
  camera: { drift: 0.01, push: 0.01 },
  grade: { tint: { color: [0, 0, 0], amount: 0 }, vignette: 0 },
  seed: 1,
  frame: { wide: "frame.png", tall: "frame.png" },
  stack: [{ kind: "layer", id: "plate", src: "https://cdn/p.png", depth: 1, anchor: { x: 0.5, y: 0.5 }, at: { x: 500, y: 500 }, width: 1000 }],
};

let frames: FrameRequestCallback[];
let intersect: (on: boolean) => void;
let resize: (w: number, h: number) => void;
let clock: number;
let cost: number;

/** Runs `n` frames 33 ms apart, each drawScene costing `cost` ms of the fake clock. */
async function run(n: number) {
  for (let i = 0; i < n; i++) {
    const due = frames.splice(0);
    due.forEach((f) => f(1000 + i * 34));
    // Between real frames the page settles; so do reactive watchers.
    await nextTick();
  }
}

beforeEach(() => {
  frames = [];
  clock = 0;
  cost = 1;
  render.loadImages.mockReset().mockResolvedValue(new Map());
  render.drawScene.mockReset().mockImplementation(() => void (clock += cost));
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        intersect = (on) => cb([{ isIntersecting: on } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: ResizeObserverCallback) {
        resize = (width, height) => cb([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mountPlayer(props: Record<string, unknown> = {}) {
  const w = mount(BookNookPlayer, { props: { scene, still: "still.webp", screen: "wide", ...props } });
  await nextTick();
  resize(300, 200);
  intersect(true);
  await flushPromises();
  return w;
}
const stillHidden = (w: Awaited<ReturnType<typeof mountPlayer>>) => w.get("[data-testid=nook-still]").classes().includes("invisible");
const canvasWidth = (w: Awaited<ReturnType<typeof mountPlayer>>) => w.get("canvas").attributes("width");

describe("BookNookPlayer", () => {
  it("shows the still until the images are in (fails if the canvas is shown before loading)", async () => {
    let finish: (v: Map<string, HTMLImageElement>) => void = () => undefined;
    render.loadImages.mockReturnValue(new Promise((r) => (finish = r)));
    const w = await mountPlayer();
    await run(2);
    expect(stillHidden(w)).toBe(false);
    expect(render.drawScene).not.toHaveBeenCalled();
    finish(new Map());
    await flushPromises();
    await run(2);
    expect(stillHidden(w)).toBe(true);
    expect(render.drawScene).toHaveBeenCalled();
  });

  it("is a labelled picture with the canvas hidden from assistive tech", async () => {
    const w = await mountPlayer();
    expect(w.attributes("role")).toBe("img");
    expect(w.attributes("aria-label")).toBe("The Inn at Dawn");
    expect(w.get("canvas").attributes("aria-hidden")).toBe("true");
    expect(w.get("img").attributes("alt")).toBe("The Inn at Dawn");
  });

  it("caps the device pixel ratio at 1.5 (fails if the cap is removed)", async () => {
    vi.stubGlobal("devicePixelRatio", 3);
    const w = await mountPlayer();
    expect(canvasWidth(w)).toBe("450");
    expect(w.get("canvas").attributes("height")).toBe("300");
  });

  it("uses the real ratio below the cap", async () => {
    vi.stubGlobal("devicePixelRatio", 1);
    expect(canvasWidth(await mountPlayer())).toBe("300");
  });

  it("draws the frame only in full screen (fails if the scene's frame is always passed)", async () => {
    const small = await mountPlayer({ fullscreen: false });
    expect(render.loadImages.mock.calls[0][0].frame).toBeUndefined();
    await run(2);
    expect(render.drawScene.mock.calls[0][1].frame).toBeUndefined();
    small.unmount();
    render.drawScene.mockClear();
    await mountPlayer({ fullscreen: true });
    expect(render.loadImages.mock.calls.at(-1)?.[0].frame).toEqual({ wide: "frame.png", tall: "frame.png" });
    await run(2);
    expect(render.drawScene.mock.calls[0][1].frame).toEqual({ wide: "frame.png", tall: "frame.png" });
  });

  it("falls back to the still, tells the parent and never throws when a part fails to load", async () => {
    render.loadImages.mockRejectedValue(new Error("Scene r is missing p.png"));
    const w = await mountPlayer();
    await run(3);
    expect(render.drawScene).not.toHaveBeenCalled();
    expect(stillHidden(w)).toBe(false);
    expect(w.emitted("error")?.[0]?.[0]).toMatchObject({ message: "Scene r is missing p.png" });
  });

  it("falls back to the still when a draw throws", async () => {
    render.drawScene.mockImplementation(() => {
      throw new Error("bad layer");
    });
    const w = await mountPlayer();
    await run(3);
    expect(stillHidden(w)).toBe(false);
    expect(w.emitted("error")).toHaveLength(1);
  });

  it("gives up and shows the still when the median draw over 60 frames is over 4 ms (fails without the budget)", async () => {
    cost = 6;
    const w = await mountPlayer();
    await run(80);
    expect(stillHidden(w)).toBe(false);
    const drawn = render.drawScene.mock.calls.length;
    await run(10);
    expect(render.drawScene.mock.calls.length).toBe(drawn);
  });

  it("keeps playing when only a few frames are slow (the median, not the worst)", async () => {
    const w = await mountPlayer();
    let n = 0;
    render.drawScene.mockImplementation(() => void (clock += n++ % 10 === 0 ? 20 : 1));
    await run(150);
    expect(stillHidden(w)).toBe(true);
  });

  it("shows the still while paused", async () => {
    const w = await mountPlayer({ paused: true });
    await run(3);
    expect(render.drawScene).not.toHaveBeenCalled();
    expect(stillHidden(w)).toBe(false);
    await w.setProps({ paused: false });
    await run(3);
    expect(stillHidden(w)).toBe(true);
  });

  it("looks through the window for its screen and stops breathing while tilted, easing rather than jumping", async () => {
    await mountPlayer({ screen: "tall", tilt: { x: 0.5, y: 0 } });
    await run(1);
    const first = render.drawScene.mock.calls[0][4];
    expect(first.window.w / first.window.h).toBeCloseTo(9 / 19.5);
    expect(first.tilt).toEqual({ x: 0.5, y: 0 });
    await run(90);
    expect(render.drawScene.mock.calls.at(-1)?.[4].breathe).toBeLessThan(0.05);
  });

  it("breathes at full strength when level", async () => {
    await mountPlayer();
    await run(5);
    expect(render.drawScene.mock.calls.at(-1)?.[4].breathe).toBe(1);
  });
});
