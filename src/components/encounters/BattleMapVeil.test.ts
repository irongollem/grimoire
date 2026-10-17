// The veil paints the map's darkness over the image rect, carved by the snapshot's lights, and nothing outside the
// image (epic #1073).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import type { MapLive } from "@/types/mapLive.types";

const painted = vi.hoisted(() => ({
  calls: [] as { rect: { x: number; y: number; w: number; h: number }; grid: Float32Array; gw: number; gh: number }[],
}));
vi.mock("@/lib/battlemap/darkness", async (orig) => ({
  ...(await orig<typeof import("@/lib/battlemap/darkness")>()),
  domMakeCanvas: () => () => null,
  paintLitVeil: (_ctx: unknown, rect: never, grid: Float32Array, gw: number, gh: number) => {
    painted.calls.push({ rect, grid, gw, gh });
    return true;
  },
}));

import BattleMapVeil from "./BattleMapVeil.vue";

const ctx = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  painted.calls.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});

const snapshot = (over: Partial<MapLive> = {}): MapLive => ({
  version: 1,
  darkness: "dark",
  groups: [],
  lights: [],
  sprites: [],
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
});
