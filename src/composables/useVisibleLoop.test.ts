import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref, type EffectScope } from "vue";
import { useVisibleLoop } from "./useVisibleLoop";

/** rAF driven by hand, an IntersectionObserver we can fire, and a settable visibility and reduce-motion. */
let queue: Map<number, FrameRequestCallback>;
let nextId: number;
let observers: { cb: IntersectionObserverCallback; el: Element | null }[];
let visibility: DocumentVisibilityState;
let reduced: boolean;

function runFrame(at: number) {
  const due = [...queue.entries()];
  queue.clear();
  for (const [, cb] of due) cb(at);
}
function intersect(isIntersecting: boolean) {
  for (const o of observers) o.cb([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
}

beforeEach(() => {
  queue = new Map();
  nextId = 1;
  observers = [];
  visibility = "visible";
  reduced = false;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.set(nextId, cb);
    return nextId++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => void queue.delete(id));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      entry: { cb: IntersectionObserverCallback; el: Element | null };
      constructor(cb: IntersectionObserverCallback) {
        this.entry = { cb, el: null };
        observers.push(this.entry);
      }
      observe(el: Element) {
        this.entry.el = el;
      }
      disconnect() {
        observers.splice(observers.indexOf(this.entry), 1);
      }
    },
  );
  vi.stubGlobal("matchMedia", () => ({ get matches() { return reduced; }, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function start(opts: Parameters<typeof useVisibleLoop>[2] = {}) {
  const scope: EffectScope = effectScope();
  const frame = vi.fn();
  const target = ref<Element | null>(document.createElement("div"));
  const loop = scope.run(() => useVisibleLoop(target, frame, opts))!;
  await nextTick();
  return { scope, frame, target, loop };
}

describe("useVisibleLoop", () => {
  it("does not run until the element is on screen (fails if the IntersectionObserver is ignored)", async () => {
    const { loop, frame } = await start();
    expect(loop.running.value).toBe(false);
    runFrame(0);
    expect(frame).not.toHaveBeenCalled();
    intersect(true);
    expect(loop.running.value).toBe(true);
    runFrame(0);
    expect(frame).toHaveBeenCalledTimes(1);
  });

  it("stops when the element scrolls away", async () => {
    const { loop } = await start();
    intersect(true);
    intersect(false);
    expect(loop.running.value).toBe(false);
    expect(queue.size).toBe(0);
  });

  it("stops in a hidden tab and resumes on return (fails without the visibilitychange listener)", async () => {
    const { loop } = await start();
    intersect(true);
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(loop.running.value).toBe(false);
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(loop.running.value).toBe(true);
  });

  it("never runs under reduced motion", async () => {
    reduced = true;
    const { loop } = await start();
    intersect(true);
    expect(loop.running.value).toBe(false);
    expect(queue.size).toBe(0);
  });

  it("holds while paused and goes on when released", async () => {
    const paused = ref(true);
    const { loop } = await start({ paused });
    intersect(true);
    expect(loop.running.value).toBe(false);
    paused.value = false;
    await nextTick();
    expect(loop.running.value).toBe(true);
  });

  it("draws at most fps frames a second (fails if the throttle is removed)", async () => {
    const { frame } = await start({ fps: 30 });
    intersect(true);
    // A 60 Hz display for one second.
    for (let i = 0; i <= 60; i++) runFrame((i * 1000) / 60);
    expect(frame.mock.calls.length).toBeGreaterThanOrEqual(30);
    expect(frame.mock.calls.length).toBeLessThanOrEqual(32);
  });

  it("carries time on across a stop, without a jump", async () => {
    const { frame } = await start({ fps: 60 });
    intersect(true);
    runFrame(1000);
    runFrame(1500);
    expect(frame).toHaveBeenLastCalledWith(0.5);
    intersect(false);
    intersect(true);
    runFrame(900000);
    expect(frame).toHaveBeenLastCalledWith(0.5);
    runFrame(900100);
    expect(frame).toHaveBeenLastCalledWith(0.6);
  });

  it("cancels its frame and observer when its scope ends", async () => {
    const { scope } = await start();
    intersect(true);
    scope.stop();
    expect(queue.size).toBe(0);
    expect(observers).toHaveLength(0);
  });

  it("stays still where requestAnimationFrame does not exist", async () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const { loop } = await start();
    intersect(true);
    expect(loop.running.value).toBe(false);
  });
});
