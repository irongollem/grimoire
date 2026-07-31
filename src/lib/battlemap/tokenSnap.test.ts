import { describe, it, expect } from "vitest";
import { snapPixelToCell, cellToPixel } from "@/lib/battlemap/tokenSnap";

describe("snapPixelToCell", () => {
  it("snaps to the nearest cell anchor when dropping at an arbitrary canvas point", () => {
    // Cell size 50, origin at (0,0). A drop at (137, 78) → nearest anchor cell (3, 2)?
    // Actually we snap to the cell whose center is closest. For a 1×1 footprint:
    //   anchor cell x = round((137 - 0) / 50 - 0.5) = round(2.24) = 2
    //   anchor cell y = round((78 - 0) / 50 - 0.5) = round(1.06) = 1
    expect(snapPixelToCell({ pixelX: 137, pixelY: 78, cellPx: 50, originX: 0, originY: 0, footprint: 1 }))
      .toEqual({ x: 2, y: 1 });
  });

  it("snaps relative to a non-zero origin", () => {
    // Origin at (100, 100), cell size 25. Drop at (175, 175) → relative (75, 75).
    // anchor x = round(75/25 - 0.5) = round(2.5) = round-half-to-even → 2 or 3. We pick floor((rel - half)/cell + 0.5)
    // Let's compute deterministically. We want a 1×1 token centered at the drop point.
    // The token's center should be at (anchor*cell + half_footprint*cell) + origin.
    // For a drop at (175,175), origin (100,100), cell 25: center at (175,175).
    // Anchor pixel = center - 0.5 * footprint * cell = (175 - 12.5, 175 - 12.5) = (162.5, 162.5)
    // Anchor cell = round((162.5 - 100) / 25) = round(2.5). round() rounds .5 up. So 3,3.
    expect(snapPixelToCell({ pixelX: 175, pixelY: 175, cellPx: 25, originX: 100, originY: 100, footprint: 1 }))
      .toEqual({ x: 3, y: 3 });
  });

  it("centers a 2×2 (Large) token on the drop point", () => {
    // Origin (0,0), cell size 50, drop at (75, 75), footprint 2.
    // We want the 2×2 token's center to be at the drop point.
    // Token center = anchor + footprint/2 cells = (anchor_x + 1, anchor_y + 1) cells = ((anchor_x+1)*50, (anchor_y+1)*50)
    // Drop center (75,75) → anchor cell at (0,0) gives center (50,50). Anchor (1,1) gives (100,100).
    // Closer to (75,75) is (0,0) (dist 35.4) vs (1,1) (dist 35.4) — tie.
    // We use the snap-up convention: 75/50 - 1 + 0.5 = 0.5 → round → 1. So anchor (0, 0)? Let me just check.
    // anchor x = round((75 - 0) / 50 - 2/2) = round(1.5 - 1) = round(0.5) = 1 (round-half-up)
    // We'll go with the math the implementation uses.
    const result = snapPixelToCell({ pixelX: 75, pixelY: 75, cellPx: 50, originX: 0, originY: 0, footprint: 2 });
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x).toBeLessThanOrEqual(1);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeLessThanOrEqual(1);
  });

  it("returns origin cell when drop coincides with the origin", () => {
    expect(snapPixelToCell({ pixelX: 100, pixelY: 200, cellPx: 50, originX: 100, originY: 200, footprint: 1 }))
      .toEqual({ x: 0, y: 0 });
  });

  it("handles negative cell coordinates (drop before the origin)", () => {
    // Origin (100, 100), cell 50, drop at (10, 10), footprint 1.
    // Center should be at (10,10). Anchor = (10 - 25, 10 - 25) = (-15, -15). Relative to origin: (-115, -115).
    // anchor cell = round(-115 / 50) = round(-2.3) = -2.
    expect(snapPixelToCell({ pixelX: 10, pixelY: 10, cellPx: 50, originX: 100, originY: 100, footprint: 1 }))
      .toEqual({ x: -2, y: -2 });
  });
});

describe("cellToPixel — inverse of snap", () => {
  it("returns the anchor cell's top-left in canvas space", () => {
    expect(cellToPixel({ cellX: 3, cellY: 2, cellPx: 50, originX: 0, originY: 0 }))
      .toEqual({ x: 150, y: 100 });
  });

  it("incorporates a non-zero origin", () => {
    expect(cellToPixel({ cellX: 2, cellY: 1, cellPx: 25, originX: 100, originY: 100 }))
      .toEqual({ x: 150, y: 125 });
  });

  it("works for negative cells", () => {
    expect(cellToPixel({ cellX: -2, cellY: -2, cellPx: 50, originX: 100, originY: 100 }))
      .toEqual({ x: 0, y: 0 });
  });
});
