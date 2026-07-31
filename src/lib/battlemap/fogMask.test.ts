import { describe, it, expect } from "vitest";
import {
  encodeFogMask,
  decodeFogMask,
  roundBrushCells,
  cellBrushCells,
  applyBrush,
} from "@/lib/battlemap/fogMask";

describe("encode / decode fog mask", () => {
  it("round-trips an empty set", () => {
    expect(decodeFogMask(encodeFogMask(new Set()))).toEqual(new Set());
    expect(decodeFogMask("")).toEqual(new Set());
    expect(decodeFogMask(null)).toEqual(new Set());
  });

  it("round-trips a small set", () => {
    const original = new Set(["0,0", "1,2", "-3,4"]);
    const encoded = encodeFogMask(original);
    expect(decodeFogMask(encoded)).toEqual(original);
  });

  it("encodes as a comma-joined list separated by semicolons", () => {
    expect(encodeFogMask(new Set(["1,2", "3,4"]))).toMatch(/^1,2;3,4$|^3,4;1,2$/);
  });

  it("ignores malformed tokens during decode", () => {
    expect(decodeFogMask("1,2;garbage;3,4")).toEqual(new Set(["1,2", "3,4"]));
  });
});

describe("roundBrushCells", () => {
  it("returns the single centre cell for size 1 at the cursor", () => {
    // cursor at canvas (75, 75), cellPx 50, origin (0,0), radius 1 cell
    // centre cell of cursor = (1, 1). Round brush size 1 → just that cell.
    expect(
      roundBrushCells({ pixelX: 75, pixelY: 75, cellPx: 50, originX: 0, originY: 0, brushCells: 1 }),
    ).toEqual(new Set(["1,1"]));
  });

  it("returns a plus-shape ring for a 3-cell round brush at a cell centre", () => {
    // centre (1,1), radius = 1.5 cells, so cells with centre within 1.5 * cellPx are in.
    // Surrounding 8 cells are at distance 1 or sqrt(2) ≈ 1.414 cells → all within.
    // Cells 2 away (e.g. (3,1) at distance 2 cells) are out.
    const result = roundBrushCells({
      pixelX: 75,
      pixelY: 75,
      cellPx: 50,
      originX: 0,
      originY: 0,
      brushCells: 3,
    });
    expect(result.has("1,1")).toBe(true);
    expect(result.has("0,1")).toBe(true);
    expect(result.has("2,1")).toBe(true);
    expect(result.has("0,0")).toBe(true);
    expect(result.has("2,2")).toBe(true);
    expect(result.has("3,1")).toBe(false);
    expect(result.has("-1,1")).toBe(false);
  });

  it("returns empty set for non-positive cellPx", () => {
    expect(
      roundBrushCells({ pixelX: 0, pixelY: 0, cellPx: 0, originX: 0, originY: 0, brushCells: 3 }),
    ).toEqual(new Set());
  });
});

describe("cellBrushCells", () => {
  it("snaps to the cell under the cursor for size 1", () => {
    expect(
      cellBrushCells({ pixelX: 137, pixelY: 78, cellPx: 50, originX: 0, originY: 0, brushCells: 1 }),
    ).toEqual(new Set(["2,1"]));
  });

  it("returns a 3x3 block centred on the cursor cell for size 3", () => {
    const result = cellBrushCells({
      pixelX: 75,
      pixelY: 75,
      cellPx: 50,
      originX: 0,
      originY: 0,
      brushCells: 3,
    });
    // Cursor at (75,75) → cell (1,1). 3x3 block = (0,0)..(2,2).
    const expected = new Set<string>();
    for (let y = 0; y <= 2; y++) for (let x = 0; x <= 2; x++) expected.add(`${x},${y}`);
    expect(result).toEqual(expected);
  });

  it("clamps even brush sizes to the floor (4 → 3)", () => {
    const result = cellBrushCells({
      pixelX: 75,
      pixelY: 75,
      cellPx: 50,
      originX: 0,
      originY: 0,
      brushCells: 4,
    });
    expect(result.size).toBe(9);
  });
});

describe("applyBrush", () => {
  it("reveal mode adds cells to the mask", () => {
    const before = new Set(["0,0"]);
    const after = applyBrush(before, new Set(["1,1", "1,2"]), "reveal");
    expect(after).toEqual(new Set(["0,0", "1,1", "1,2"]));
  });

  it("re-hide mode removes cells from the mask", () => {
    const before = new Set(["0,0", "1,1", "1,2"]);
    const after = applyBrush(before, new Set(["1,1", "1,2"]), "rehide");
    expect(after).toEqual(new Set(["0,0"]));
  });

  it("returns a new set without mutating the input", () => {
    const before = new Set(["0,0"]);
    const after = applyBrush(before, new Set(["1,1"]), "reveal");
    expect(after).not.toBe(before);
    expect(before).toEqual(new Set(["0,0"]));
  });
});
