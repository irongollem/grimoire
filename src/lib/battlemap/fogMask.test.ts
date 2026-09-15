import { describe, it, expect } from "vitest";
import {
  encodeFogMask,
  decodeFogMask,
  roundBrushCells,
  cellBrushCells,
  applyBrush,
  shouldSeedFog,
  FEATHER_FRACTION,
  featherEdges,
  featherRect,
  fogOpacityAt,
  revealedCombatants,
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

describe("shouldSeedFog", () => {
  it("is true for a never-seeded row (null)", () => {
    expect(shouldSeedFog(null)).toBe(true);
  });

  it("is true for an absent value (undefined)", () => {
    expect(shouldSeedFog(undefined)).toBe(true);
  });

  it("is false for an explicit \"Hide all\" (empty string), not 'never seeded'", () => {
    expect(shouldSeedFog("")).toBe(false);
  });

  it("is false once any cells are revealed", () => {
    expect(shouldSeedFog("1,2;3,4")).toBe(false);
  });
});

describe("featherEdges", () => {
  it("returns nothing for a single revealed cell surrounded by nothing but revealed neighbours (fully-revealed draws nothing)", () => {
    // A 3x3 fully-revealed block: the centre cell (0,0) has all four
    // neighbours in the mask, so it contributes no feather edge at all.
    const mask = new Set<string>();
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) mask.add(`${x},${y}`);
    const edges = featherEdges(mask).filter((e) => e.cellX === 0 && e.cellY === 0);
    expect(edges).toEqual([]);
  });

  it("gives a revealed cell one edge per hidden neighbour", () => {
    // (0,0) revealed; only (0,-1) [top] and (1,0) [right] are also revealed.
    const mask = new Set(["0,0", "0,-1", "1,0"]);
    const edges = featherEdges(mask).filter((e) => e.cellX === 0 && e.cellY === 0);
    expect(edges.map((e) => e.side).sort()).toEqual(["bottom", "left"]);
  });

  it("never produces an edge for the hidden cell itself", () => {
    const mask = new Set(["0,0"]);
    const edges = featherEdges(mask);
    expect(edges.every((e) => mask.has(`${e.cellX},${e.cellY}`))).toBe(true);
  });
});

describe("featherRect", () => {
  it("places the top feather flush with the cell's top edge, fading downward", () => {
    const rect = featherRect({ cellX: 2, cellY: 3, side: "top" }, 50, 0, 0);
    expect(rect).toEqual({
      x: 100,
      y: 150,
      w: 50,
      h: 25,
      gradient: { x0: 100, y0: 150, x1: 100, y1: 175 },
    });
  });

  it("places the right feather flush with the cell's right edge, fading leftward", () => {
    const rect = featherRect({ cellX: 0, cellY: 0, side: "right" }, 40, 10, 10);
    // right edge at x = 10 + 40 = 50; feather band is the inner half [30, 50].
    expect(rect.x).toBeCloseTo(30, 10);
    expect(rect.w).toBeCloseTo(20, 10);
    expect(rect.gradient).toEqual({ x0: 50, y0: 10, x1: 30, y1: 10 });
  });
});

describe("fogOpacityAt", () => {
  const cellPx = 50;

  it("is fully opaque at a hidden cell's centre", () => {
    const mask = new Set<string>(); // nothing revealed at all
    expect(fogOpacityAt(75, 75, mask, cellPx, 0, 0)).toBe(1); // cell (1,1)
  });

  it("stays fully opaque anywhere inside a hidden cell, right up to a revealed border — the softening never bleeds into the hidden side", () => {
    // (0,0) hidden, (1,0) revealed. Sample just inside the hidden cell's own
    // right edge (x approaching 50 from below).
    const mask = new Set(["1,0"]);
    expect(fogOpacityAt(49.9, 25, mask, cellPx, 0, 0)).toBe(1);
  });

  it("softens only on the revealed side of that same border, fading to 0 within half a cell", () => {
    // (1,0) and (2,0) revealed, side by side; (0,0) is the hidden cell under
    // test, bordering (1,0) on its left. (2,0) being revealed too means
    // (1,0)'s own right border isn't also hidden, isolating the left
    // border's falloff from any other edge's — same reason sampling stays
    // on y=25 (mid-cell height), where the top/bottom borders (hidden here)
    // are already fully faded and so don't interfere either.
    const mask = new Set(["1,0", "2,0"]);
    // Just past the border into the revealed cell (1,0): still nearly opaque.
    expect(fogOpacityAt(50.1, 25, mask, cellPx, 0, 0)).toBeCloseTo(1, 1);
    // A quarter of a cell in (dist 0.25 of FEATHER_FRACTION 0.5 → half faded).
    expect(fogOpacityAt(50 + cellPx * 0.25, 25, mask, cellPx, 0, 0)).toBeCloseTo(0.5, 5);
    // A full half-cell in: fully faded, and beyond it (still within (1,0),
    // whose other three borders are all revealed) stays at 0.
    expect(fogOpacityAt(50 + cellPx * FEATHER_FRACTION, 25, mask, cellPx, 0, 0)).toBe(0);
    expect(fogOpacityAt(50 + cellPx * 0.9, 25, mask, cellPx, 0, 0)).toBe(0);
  });

  it("draws nothing anywhere inside a cell that is fully surrounded by revealed neighbours", () => {
    const mask = new Set<string>();
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) mask.add(`${x},${y}`);
    // Sample several points across the centre cell (0,0), unit square [0,50)x[0,50).
    for (const [px, py] of [[0, 0], [25, 25], [49, 49], [0, 49], [49, 0]]) {
      expect(fogOpacityAt(px, py, mask, cellPx, 0, 0)).toBe(0);
    }
  });
});

describe("revealedCombatants", () => {
  it("keeps a combatant with no position regardless of fog", () => {
    const combatants = [{ id: "a", position: null }];
    expect(revealedCombatants(combatants, new Set())).toEqual(combatants);
  });

  it("keeps only combatants whose cell is in the revealed mask", () => {
    const combatants = [
      { id: "seen", position: { x: 1, y: 1 } },
      { id: "hidden", position: { x: 9, y: 9 } },
    ];
    const result = revealedCombatants(combatants, new Set(["1,1"]));
    expect(result.map((c) => c.id)).toEqual(["seen"]);
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
