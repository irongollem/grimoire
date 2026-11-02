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
