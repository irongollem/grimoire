// The veil paints the map's darkness over the image rect, carved by the snapshot's lights, and nothing outside the
// image (epic #1073).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import type { MapLive } from "@/types/mapLive.types";

const painted = vi.hoisted(() => ({
  calls: [] as { rect: { x: number; y: number; w: number; h: number }; grid: Float32Array; gw: number; gh: number }[],
  player: [] as { seen: Float32Array; grey: Float32Array; gw: number; gh: number; images: number }[],
}));
vi.mock("@/lib/battlemap/darkness", async (orig) => ({
  ...(await orig<typeof import("@/lib/battlemap/darkness")>()),
  domMakeCanvas: () => () => null,
  paintLitVeil: (_ctx: unknown, rect: never, grid: Float32Array, gw: number, gh: number) => {
    painted.calls.push({ rect, grid, gw, gh });
    return true;
  },
  paintPlayerVeil: (_ctx: unknown, _rect: never, vision: { seen: Float32Array; grey: Float32Array }, gw: number, gh: number, _mc: unknown, images: unknown[]) => {
    painted.player.push({ ...vision, gw, gh, images: images.length });
    return true;
  },
}));

import BattleMapVeil from "./BattleMapVeil.vue";

const ctx = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), arc: vi.fn(), stroke: vi.fn(), setLineDash: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  painted.calls.length = 0;
  painted.player.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});

const snapshot = (over: Partial<MapLive> = {}): MapLive => ({
  version: 2,
  darkness: "dark",
  groups: [],
  lights: [],
  sprites: [],
  walls: [],
  doors: [],
  solid: [],
  ...over,
});
const torch = { x: 0.5, y: 0.5, color: "#ffaa33", bright: 10, dim: 10, phase: 0 };
const props = {
  hostW: 400,
  hostH: 300,
  panX: 20,
  panY: 10,
  imageW: 300,
  imageH: 200,
  cellPx: 50,
  originX: 20,
  originY: 10,
  live: snapshot(),
};

describe("BattleMapVeil", () => {
  it("paints a grid of light levels over the image's cells, clipped to the image", () => {
    mount(BattleMapVeil, { props });
    expect(painted.calls).toHaveLength(1);
    expect(painted.calls[0].rect).toEqual({ x: 20, y: 10, w: 300, h: 200 });
    expect([painted.calls[0].gw, painted.calls[0].gh]).toEqual([24, 16]);
    expect(ctx.rect).toHaveBeenCalledWith(20, 10, 300, 200);
    expect(ctx.clip).toHaveBeenCalled();
  });

  it("starts from the ambient level and lets a light clear it", () => {
    mount(BattleMapVeil, { props: { ...props, live: snapshot({ lights: [torch] }) } });
    const { grid, gw } = painted.calls[0];
    expect(grid[grid.length - 1]).toBe(0);
    // Sample at the torch's centre (cell 0.5 = sample index 2 at 4 per cell).
    expect(grid[2 * gw + 2]).toBe(1);
  });

  it("holds an ambient dim map at dim light away from any light", () => {
    mount(BattleMapVeil, { props: { ...props, live: snapshot({ darkness: "dim" }) } });
    expect(painted.calls[0].grid.every((v) => v === 0.5)).toBe(true);
  });

  it("does not recompute the grid for a pan that only translates", async () => {
    const w = mount(BattleMapVeil, { props: { ...props, live: snapshot({ lights: [torch] }) } });
    const first = painted.calls[0].grid;
    await w.setProps({ panX: 27, originX: 27, panY: 17, originY: 17 });
    const last = painted.calls[painted.calls.length - 1];
    expect(painted.calls.length).toBeGreaterThan(1);
    expect(last.grid).toBe(first);
    expect(last.rect.x).toBe(27);
  });

  it("repaints a new grid when the snapshot changes", async () => {
    const w = mount(BattleMapVeil, { props });
    const first = painted.calls[0].grid;
    await w.setProps({ live: snapshot({ lights: [torch] }) });
    expect(painted.calls[painted.calls.length - 1].grid).not.toBe(first);
  });

  it("repaints when the host is resized", async () => {
    const w = mount(BattleMapVeil, { props });
    await w.setProps({ hostW: 500, imageW: 400 });
    expect(painted.calls[painted.calls.length - 1].rect.w).toBe(400);
  });

  describe("magical darkness", () => {
    const zones = [{ x: 3.5, y: 2.5, radius: 10 }];

    it("zeroes the sphere on a daylight map and rings it for the DM", () => {
      mount(BattleMapVeil, { props: { ...props, live: snapshot({ darkness: "daylight" }), zones } });
      const { grid, gw } = painted.calls[0];
      // Sample (14, 10) is cell (3.6, 2.6), inside the sphere; the last sample, in the corner, is outside.
      expect(grid[10 * gw + 14]).toBe(0);
      expect(grid[grid.length - 1]).toBe(1);
      expect(ctx.arc).toHaveBeenCalledTimes(1);
    });

    it("blinds a darkvision player inside the sphere", () => {
      const viewer = { x: 0.5, y: 0.5, darkvisionFeet: 60, blindsightFeet: 0, truesightFeet: 0, devilsSightFeet: 0 };
      mount(BattleMapVeil, { props: { ...props, live: snapshot({ darkness: "daylight" }), viewers: [viewer], zones } });
      const { seen, gw } = painted.player[0];
      expect(seen[10 * gw + 14]).toBe(0);
      expect(seen[22]).toBe(1);
      expect(ctx.arc).not.toHaveBeenCalled();
    });
  });

  describe("for a player", () => {
    const viewer = { x: 0.5, y: 0.5, darkvisionFeet: 10, blindsightFeet: 0, truesightFeet: 0, devilsSightFeet: 0 };

    it("paints what the viewers see instead of the DM's veil", () => {
      mount(BattleMapVeil, { props: { ...props, viewers: [viewer] } });
      expect(painted.calls).toHaveLength(0);
      const { seen, grey, gw, gh } = painted.player[0];
      expect([gw, gh]).toEqual([24, 16]);
      // Darkness all around, 2 cells of darkvision: the viewer's own sample is dim and grey, far corner is blind.
      expect(seen[2 * gw + 2]).toBe(0.5);
      expect(grey[2 * gw + 2]).toBe(1);
      expect(seen[seen.length - 1]).toBe(0);
    });

    it("sees nothing in the dark with no viewers or no darkvision", () => {
      mount(BattleMapVeil, { props: { ...props, viewers: [] } });
      mount(BattleMapVeil, { props: { ...props, viewers: [{ ...viewer, darkvisionFeet: 0 }] } });
      for (const p of painted.player) expect(p.seen.every((v) => v === 0)).toBe(true);
    });

    it("does not rebuild the vision for an equal set of viewers or a pan", async () => {
      const w = mount(BattleMapVeil, { props: { ...props, viewers: [viewer] } });
      const first = painted.player[0].seen;
      await w.setProps({ viewers: [{ ...viewer }] });
      await w.setProps({ panX: 27, originX: 27 });
      expect(painted.player[painted.player.length - 1].seen).toBe(first);
    });

    it("rebuilds the vision when a viewer moves", async () => {
      const w = mount(BattleMapVeil, { props: { ...props, viewers: [viewer] } });
      const first = painted.player[0].seen;
      await w.setProps({ viewers: [{ ...viewer, x: 3.5 }] });
      expect(painted.player[painted.player.length - 1].seen).not.toBe(first);
    });

    it("starts without the grey pictures: none has loaded", () => {
      mount(BattleMapVeil, { props: { ...props, viewers: [viewer], groundUrl: "ground.webp" } });
      expect(painted.player[0].images).toBe(0);
    });
  });
});
