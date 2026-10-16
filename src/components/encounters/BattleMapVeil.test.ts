// The veil paints the map's darkness over the image rect, and nothing outside it (epic #1073).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import BattleMapVeil from "./BattleMapVeil.vue";

const ctx = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), fillStyle: "" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});

const props = { hostW: 400, hostH: 300, panX: 20, panY: 10, imageW: 300, imageH: 200, darkness: "dark" as const };

describe("BattleMapVeil", () => {
  it("fills the image rect with the dark veil", () => {
    mount(BattleMapVeil, { props });
    expect(ctx.fillRect).toHaveBeenCalledWith(20, 10, 300, 200);
  });

  it("repaints when the level changes", async () => {
    const w = mount(BattleMapVeil, { props });
    ctx.fillRect.mockClear();
    await w.setProps({ darkness: "dim" });
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
  });

  it("repaints when the host is resized", async () => {
    const w = mount(BattleMapVeil, { props });
    ctx.fillRect.mockClear();
    await w.setProps({ hostW: 500, imageW: 400 });
    expect(ctx.fillRect).toHaveBeenCalledWith(20, 10, 400, 200);
  });
});
