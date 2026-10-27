import { describe, it, expect } from "vitest";
import { snapPixelToCell, cellToPixel } from "@/lib/battlemap/tokenSnap";

describe("snapPixelToCell", () => {
  it("snaps the dropped token's centre to the cell whose anchor is nearest", () => {
    // Cell 50px, origin (0,0), 1x1 token dropped with its centre at (137, 78): top-left lands at (112, 53),
    // which is (2.24, 1.06) cells, so the anchor cell is (2, 1).
    expect(snapPixelToCell({ pixelX: 137, pixelY: 78, cellPx: 50, originX: 0, originY: 0, footprint: 1 })).toEqual({ x: 2, y: 1 });
  });

  it("measures from the origin, which may differ per axis", () => {
    // Origin (100, 20), cell 25. Centre at (175, 95): top-left (162.5, 82.5) is (2.5, 2.5) cells in, which rounds up to (3, 3).
    expect(snapPixelToCell({ pixelX: 175, pixelY: 95, cellPx: 25, originX: 100, originY: 20, footprint: 1 })).toEqual({ x: 3, y: 3 });
  });

  it("centres a larger token on the drop point, not its corner", () => {
    // A 2x2 token (100px) centred at (100, 100) has its top-left at (50, 50): anchor cell (1, 1).
    expect(snapPixelToCell({ pixelX: 100, pixelY: 100, cellPx: 50, originX: 0, originY: 0, footprint: 2 })).toEqual({ x: 1, y: 1 });
    // A 3x3 token (150px) centred at (150, 150) has its top-left at (75, 75): 1.5 cells, rounds up to (2, 2).
    expect(snapPixelToCell({ pixelX: 150, pixelY: 150, cellPx: 50, originX: 0, originY: 0, footprint: 3 })).toEqual({ x: 2, y: 2 });
  });

  it("returns a plain 0, never -0, when the anchor rounds to zero from below", () => {
    // Centre on the origin: the top-left is half a cell before it, -0.5, and Math.round(-0.5) is -0.
    expect(snapPixelToCell({ pixelX: 100, pixelY: 200, cellPx: 50, originX: 100, originY: 200, footprint: 1 })).toEqual({ x: 0, y: 0 });
  });

  it("gives negative cells for a drop before the origin", () => {
    // Origin (100,100), cell 50, centre at (10,10): top-left (-15,-15), i.e. (-115,-115) from the origin = -2.3 cells.
    expect(snapPixelToCell({ pixelX: 10, pixelY: 10, cellPx: 50, originX: 100, originY: 100, footprint: 1 })).toEqual({ x: -2, y: -2 });
  });
});

describe("cellToPixel", () => {
  it("returns the anchor cell's top-left in canvas space, with each axis on its own origin", () => {
    expect(cellToPixel({ cellX: 3, cellY: 2, cellPx: 50, originX: 10, originY: 400 })).toEqual({ x: 160, y: 500 });
  });

  it("works for negative cells", () => {
    expect(cellToPixel({ cellX: -2, cellY: -2, cellPx: 50, originX: 100, originY: 100 })).toEqual({ x: 0, y: 0 });
  });
});
