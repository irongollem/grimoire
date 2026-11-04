import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { reactive } from "vue";
import CartographerMotionLayer from "./CartographerMotionLayer.vue";
import { MOTION_REBUILD_INTERVAL_MS } from "@/cartographer/motion";
import * as mapLive from "@/cartographer/mapLive";
import { paintGroundCells } from "@/cartographer/groundRegions";
import { cellKey, emptyLayers } from "@/types/dungeonMap.types";
import { makeRuntime } from "@/cartographer/testCanvas";

enableAutoUnmount(afterEach);

const FOAM = { url: "https://cdn/foam.webp", cells: 4, drift: [0.1, 0] as [number, number], alpha: 0.5 };

function props(over: Record<string, unknown> = {}) {
  const layers = paintGroundCells(emptyLayers(), new Set(["0,0"]), { pack_id: "sea", pack_version: 1, variant: 0 }, "terrainWater");
  return {
    layers, revision: 0, runtimes: new Map([["sea", makeRuntime("sea", { motion: { terrainWater: [FOAM] } })]]),
    dressing: new Map(), tilePx: 64, viewportOffset: { x: 0, y: 0 }, dpr: 2, width: 400, height: 300, playing: true,
    ...over,
  };
}

describe("the editor's motion layer", () => {
  let raf: ReturnType<typeof vi.fn>;
  let cancel: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    let id = 0;
    raf = vi.fn(() => ++id);
    cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("animates while playing and schedules no frame at all once paused", async () => {
    const w = mount(CartographerMotionLayer, { props: props() });
    await w.vm.$nextTick();
    expect(raf).toHaveBeenCalled();
    await w.setProps({ playing: false });
    expect(cancel).toHaveBeenCalled();
    const framesAtPause = raf.mock.calls.length;
    vi.advanceTimersByTime(2000);
    expect(raf.mock.calls.length).toBe(framesAtPause);
    expect(w.findAll("canvas")).toHaveLength(0);
  });

  it("does not build a snapshot while paused", () => {
    const build = vi.spyOn(mapLive, "buildMapLive");
    mount(CartographerMotionLayer, { props: props({ playing: false }) });
    expect(build).not.toHaveBeenCalled();
  });

  it("an edit made between gestures is in the snapshot at once, so a moved swaying prop does not vanish", async () => {
    const build = vi.spyOn(mapLive, "buildMapLive");
    const w = mount(CartographerMotionLayer, { props: props() });
    expect(build).toHaveBeenCalledTimes(1);
    await w.setProps({ revision: 1 });
    expect(build).toHaveBeenCalledTimes(2); // no timer advanced
  });

  it("edits during a drag rebuild on an interval, and the release builds the last state at once", async () => {
    const build = vi.spyOn(mapLive, "buildMapLive");
    const w = mount(CartographerMotionLayer, { props: props({ busy: true }) });
    for (let i = 1; i <= 5; i++) {
      await w.setProps({ revision: i });
      vi.advanceTimersByTime(MOTION_REBUILD_INTERVAL_MS / 10);
    }
    expect(build).toHaveBeenCalledTimes(1); // the throttle has not fired yet
    await w.setProps({ busy: false });
    expect(build).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(MOTION_REBUILD_INTERVAL_MS * 2);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("drops a pending rebuild when paused, so a paused editor never builds", async () => {
    const build = vi.spyOn(mapLive, "buildMapLive");
    const w = mount(CartographerMotionLayer, { props: props({ busy: true }) });
    await w.setProps({ revision: 1 });
    await w.setProps({ playing: false });
    vi.advanceTimersByTime(MOTION_REBUILD_INTERVAL_MS * 2);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("lays the live water under the editor's standing canvas and the live top layer over it", async () => {
    const w = mount(CartographerMotionLayer, { props: props(), slots: { default: '<canvas class="standing"></canvas>' } });
    await w.vm.$nextTick();
    const order = w.findAll("canvas").map((c) => (c.classes().includes("standing") ? "standing" : "live"));
    expect(order).toEqual(["live", "standing", "live"]);
    const layers = w.findAllComponents({ name: "BattleMapLiveLayer" }).map((l) => l.props("stratum"));
    expect(layers).toEqual(["ground", "top"]);
  });

  it("lays the breathing darkness veil over the standing canvas on a dark map, and none by day", async () => {
    const slots = { default: '<canvas class="standing"></canvas>' };
    const dark = mount(CartographerMotionLayer, { props: props({ darkness: "dark" }), slots });
    await dark.vm.$nextTick();
    expect(dark.findAllComponents({ name: "BattleMapVeil" })).toHaveLength(1);
    const day = mount(CartographerMotionLayer, { props: props({ darkness: "daylight" }), slots });
    await day.vm.$nextTick();
    expect(day.findAllComponents({ name: "BattleMapVeil" })).toHaveLength(0);
  });

  it("paused, the standing canvas is still there and no live layer is", async () => {
    const w = mount(CartographerMotionLayer, { props: props({ playing: false }), slots: { default: '<canvas class="standing"></canvas>' } });
    expect(w.findAll("canvas")).toHaveLength(1);
  });

  it("draws in CSS pixels: tile size and viewport offset are divided by the device pixel ratio", async () => {
    const w = mount(CartographerMotionLayer, { props: props({ viewportOffset: { x: 200, y: 100 } }) });
    await w.vm.$nextTick();
    const layer = w.findComponent({ name: "BattleMapLiveLayer" });
    expect(layer.props()).toMatchObject({ cellPx: 32, originX: -100, originY: -50, hostW: 400, hostH: 300 });
  });

  it("a pack that loads after the first build lights the map: the snapshot is rebuilt when the runtime Map grows", async () => {
    // The editor keeps its runtimes in one Map that packs are set into as they load; the Map's identity never changes.
    const runtimes = reactive(new Map<string, ReturnType<typeof makeRuntime>>());
    const layers = emptyLayers();
    layers.object[cellKey(2, 2)] = { pack_id: "stone-dungeon", pack_version: 1, variant: 0, category: "objectBrazier" };
    const w = mount(CartographerMotionLayer, { props: props({ layers, runtimes, darkness: "dark" }) });
    const lightsOf = () => (w.findComponent({ name: "BattleMapVeil" }).props("live") as { lights: unknown[] }).lights;
    expect(lightsOf()).toHaveLength(0);
    runtimes.set("stone-dungeon", makeRuntime("stone-dungeon", { lights: { objectBrazier: [{ color: "#ff9116", bright: 20, dim: 20 }] } }));
    await w.vm.$nextTick();
    expect(lightsOf()).toHaveLength(1);
  });

  it("the animated veil covers the painted cells, as the still one does, and not the whole view", async () => {
    const layers = emptyLayers();
    layers.floor[cellKey(2, 3)] = { floor: { pack_id: "stone-dungeon", pack_version: 1, variant: 0 } };
    layers.floor[cellKey(4, 3)] = { floor: { pack_id: "stone-dungeon", pack_version: 1, variant: 0 } };
    const w = mount(CartographerMotionLayer, { props: props({ layers, darkness: "dark", viewportOffset: { x: 64, y: 0 } }) });
    await w.vm.$nextTick();
    // tilePx 64 at dpr 2 is 32 css px a cell; the offset of 64 device px moves the origin 32 css px left.
    expect(w.findComponent({ name: "BattleMapVeil" }).props()).toMatchObject({ panX: -32 + 2 * 32, panY: 3 * 32, imageW: 3 * 32, imageH: 32 });
  });
});
