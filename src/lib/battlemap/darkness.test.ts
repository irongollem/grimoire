import { describe, expect, it, vi } from "vitest";
import { DM_VEIL, paintVeil, veilFill } from "./darkness";

describe("darkness veil", () => {
  it("casts no veil in daylight", () => {
    expect(veilFill("daylight")).toBeNull();
  });

  it("gets stronger from dim to dark", () => {
    expect(DM_VEIL.dim).toBeGreaterThan(DM_VEIL.daylight);
    expect(DM_VEIL.dark).toBeGreaterThan(DM_VEIL.dim);
    expect(veilFill("dim")).toBe("rgba(8, 10, 24, 0.3)");
    expect(veilFill("dark")).toBe("rgba(8, 10, 24, 0.6)");
  });

  it("keeps the DM's veil translucent", () => {
    expect(DM_VEIL.dark).toBeLessThan(1);
  });

  it("paints the rect once for a dark map and nothing for daylight", () => {
    const ctx = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), fillStyle: "" };
    expect(paintVeil(ctx, { x: 1, y: 2, w: 30, h: 40 }, "dark")).toBe(true);
    expect(ctx.fillRect).toHaveBeenCalledWith(1, 2, 30, 40);
    ctx.fillRect.mockClear();
    expect(paintVeil(ctx, { x: 0, y: 0, w: 10, h: 10 }, "daylight")).toBe(false);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it("accepts a viewer strength and skips an empty rect", () => {
    const ctx = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), fillStyle: "" };
    expect(paintVeil(ctx, { x: 0, y: 0, w: 0, h: 10 }, "dark")).toBe(false);
    expect(paintVeil(ctx, { x: 0, y: 0, w: 5, h: 5 }, "dim", 1)).toBe(true);
  });
});
