import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";

let reduced = false;

/** A fresh module per test: the permission answer is cached at module scope on purpose. */
async function load() {
  vi.resetModules();
  const mod = await import("./useDeviceTilt");
  const scope = effectScope();
  return { mod, scope };
}

function reading(beta: number, gamma: number, timeStamp: number) {
  const e = new Event("deviceorientation") as DeviceOrientationEvent;
  Object.defineProperties(e, { beta: { value: beta }, gamma: { value: gamma }, timeStamp: { value: timeStamp } });
  window.dispatchEvent(e);
}

beforeEach(() => {
  reduced = false;
  vi.stubGlobal("matchMedia", () => ({ get matches() { return reduced; }, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useDeviceTilt", () => {
  it("without a permission API (Android, desktop) listens at once and is inactive until the phone moves", async () => {
    const { mod, scope } = await load();
    const t = scope.run(() => mod.useDeviceTilt())!;
    t.start();
    reading(60, 0, 1000);
    reading(60, 0, 1016);
    expect(t.active.value).toBe(false);
    reading(60, 15, 1032);
    expect(t.active.value).toBe(true);
    expect(t.tilt.value.x).toBeGreaterThan(0);
    scope.stop();
  });

  it("asks iOS synchronously inside start(), before any await (fails if the call is deferred)", async () => {
    const request = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("DeviceOrientationEvent", { requestPermission: request });
    const { mod, scope } = await load();
    const t = scope.run(() => mod.useDeviceTilt())!;
    expect(request).not.toHaveBeenCalled();
    t.start();
    expect(request).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("asks once per session, however many pictures start (fails if the answer is not cached)", async () => {
    const request = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("DeviceOrientationEvent", { requestPermission: request });
    const { mod, scope } = await load();
    const a = scope.run(() => mod.useDeviceTilt())!;
    a.start();
    a.stop();
    const b = scope.run(() => mod.useDeviceTilt())!;
    b.start();
    expect(request).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("stays inactive and deaf when the answer is denied", async () => {
    vi.stubGlobal("DeviceOrientationEvent", { requestPermission: vi.fn().mockResolvedValue("denied") });
    const { mod, scope } = await load();
    const t = scope.run(() => mod.useDeviceTilt())!;
    t.start();
    await nextTick();
    await Promise.resolve();
    reading(60, 0, 1000);
    reading(60, 20, 1016);
    expect(t.active.value).toBe(false);
    expect(t.tilt.value).toEqual({ x: 0, y: 0 });
    scope.stop();
  });

  it("stays inactive when the prompt itself fails", async () => {
    vi.stubGlobal("DeviceOrientationEvent", { requestPermission: vi.fn().mockRejectedValue(new Error("no gesture")) });
    const { mod, scope } = await load();
    const t = scope.run(() => mod.useDeviceTilt())!;
    t.start();
    await Promise.resolve();
    await Promise.resolve();
    reading(60, 0, 1000);
    reading(60, 20, 1016);
    expect(t.active.value).toBe(false);
    scope.stop();
  });

  it("starts listening once granted", async () => {
    vi.stubGlobal("DeviceOrientationEvent", { requestPermission: vi.fn().mockResolvedValue("granted") });
    const { mod, scope } = await load();
    const t = scope.run(() => mod.useDeviceTilt())!;
    t.start();
    await Promise.resolve();
    await Promise.resolve();
    reading(60, 0, 1000);
    reading(60, 20, 1016);
    expect(t.active.value).toBe(true);
    scope.stop();
  });

  it("never starts under reduced motion", async () => {
    reduced = true;
    const request = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("DeviceOrientationEvent", { requestPermission: request });
    const { mod, scope } = await load();
    const t = scope.run(() => mod.useDeviceTilt())!;
    t.start();
    reading(60, 0, 1000);
    reading(60, 20, 1016);
    expect(request).not.toHaveBeenCalled();
    expect(t.active.value).toBe(false);
    scope.stop();
  });

  it("stop() ends listening, levels the view and goes inactive", async () => {
    const { mod, scope } = await load();
    const t = scope.run(() => mod.useDeviceTilt())!;
    t.start();
    reading(60, 0, 1000);
    reading(60, 20, 1016);
    t.stop();
    reading(60, 20, 1032);
    expect(t.active.value).toBe(false);
    expect(t.tilt.value).toEqual({ x: 0, y: 0 });
    scope.stop();
  });

  it("drifts back to the middle when held still for several seconds", async () => {
    const { mod, scope } = await load();
    const t = scope.run(() => mod.useDeviceTilt())!;
    t.start();
    reading(60, 0, 0);
    reading(60, 15, 16);
    let at = 16;
    // Held at 15 degrees for 12 seconds of readings at 20 Hz.
    for (let i = 0; i < 240; i++) reading(60, 15, (at += 50));
    expect(Math.abs(t.tilt.value.x)).toBeLessThan(0.1);
    scope.stop();
  });
});

describe("usePointerTilt", () => {
  function el() {
    const e = document.createElement("div");
    e.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON() {} });
    return e;
  }
  let frames: FrameRequestCallback[];
  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });
  function run(ms: number) {
    let now = 1000;
    for (let i = 0; i < ms / 16; i++) {
      const due = frames.splice(0);
      now += 16;
      due.forEach((f) => f(now));
    }
  }
  const move = (target: Element, x: number, y: number) => target.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: x, clientY: y }));

  it("follows the pointer toward its place and returns to 0 on leave", async () => {
    const { mod, scope } = await load();
    const target = el();
    const { tilt } = scope.run(() => mod.usePointerTilt(ref(target)))!;
    await nextTick();
    move(target, 200, 0);
    run(2000);
    expect(tilt.value.x).toBeCloseTo(1, 1);
    expect(tilt.value.y).toBeCloseTo(-1, 1);
    target.dispatchEvent(new Event("pointerleave"));
    run(2000);
    expect(tilt.value).toEqual({ x: 0, y: 0 });
    scope.stop();
  });

  it("is a gradual follow, not a jump (fails if smoothing is dropped)", async () => {
    const { mod, scope } = await load();
    const target = el();
    const { tilt } = scope.run(() => mod.usePointerTilt(ref(target)))!;
    await nextTick();
    move(target, 200, 50);
    run(32);
    expect(tilt.value.x).toBeGreaterThan(0);
    expect(tilt.value.x).toBeLessThan(0.5);
    scope.stop();
  });

  it("does nothing under reduced motion", async () => {
    reduced = true;
    const { mod, scope } = await load();
    const target = el();
    const { tilt } = scope.run(() => mod.usePointerTilt(ref(target)))!;
    await nextTick();
    move(target, 200, 0);
    run(500);
    expect(tilt.value).toEqual({ x: 0, y: 0 });
    scope.stop();
  });
});
