import { describe, expect, it } from "vitest";
import {
  BOARD_H,
  BOARD_W,
  boardScale,
  keepOnBoard,
  clampScale,
  constrainPan,
  findFreeSpot,
  MAX_SCALE,
  pinSize,
  READABLE_FLOOR,
  seededRotation,
  seededScrap,
  seededTack,
  TACKS,
  zoomAt,
} from "./geometry";

describe("boardScale", () => {
  it("holds the readable floor on a phone held upright and pans along the board", () => {
    const s = boardScale(390, 700);
    expect(s.scale).toBe(READABLE_FLOOR);
    expect(s.fit).toBeCloseTo(0.24375, 5);
    expect(s.overflowX).toBe(true);
    expect(s.overflowY).toBe(false);
  });

  it("fits the whole board on a desktop, with nothing to pan", () => {
    const s = boardScale(1920, 1080);
    expect(s.scale).toBeCloseTo(1080 / BOARD_H, 5);
    expect(s.scale).toBe(s.fit);
    expect(s.overflowX).toBe(false);
    expect(s.overflowY).toBe(false);
  });

  // A viewport measured half a pixel short of the board is still a fit, not a pan.
  it("does not offer a pan for a sub-pixel overhang", () => {
    expect(boardScale(799.8, 1000).overflowX).toBe(false);
    expect(boardScale(799, 1000).overflowX).toBe(true);
  });

  it("fits a portrait tablet by width when the pins stay readable there", () => {
    const s = boardScale(820, 1180);
    expect(s.scale).toBeCloseTo(820 / BOARD_W, 5);
    expect(s.overflowX).toBe(false);
  });

  it("shows nearly the whole board on a landscape phone, with a little vertical pan", () => {
    const s = boardScale(844, 390);
    expect(s.scale).toBe(READABLE_FLOOR);
    expect(s.overflowX).toBe(false);
    expect(s.overflowY).toBe(true);
  });
});

describe("zoom and pan", () => {
  it("keeps zoom between the whole board and 2.5", () => {
    expect(clampScale(0.01, 0.24)).toBe(0.24);
    expect(clampScale(9, 0.24)).toBe(MAX_SCALE);
    expect(clampScale(1, 0.24)).toBe(1);
  });

  it("centres a board that fits and holds a bigger one against its edges", () => {
    expect(constrainPan(1920, 1080, 1, { x: 0, y: 0 })).toEqual({ x: 160, y: (1080 - BOARD_H) / 2 });
    expect(constrainPan(390, 700, 0.5, { x: 50, y: 0 }).x).toBe(0);
    expect(constrainPan(390, 700, 0.5, { x: -9999, y: 0 }).x).toBe(390 - 800);
  });

  it("zooms about a point so what is under it stays under it", () => {
    const from = { scale: 0.5, pan: { x: -100, y: 0 } };
    const focus = { x: 200, y: 100 };
    const pan = zoomAt(390, 300, from, 1, focus);
    // The board point under the focus before: (200 + 100) / 0.5 = 600 units. After: (200 - pan.x) / 1.
    expect((focus.x - pan.x) / 1).toBeCloseTo(600, 5);
    // Same on the other axis: the board point under the focus is (100 - 0) / 0.5 = 200.
    expect(focus.y - pan.y).toBeCloseTo(200, 5);
  });
});

describe("seeded look", () => {
  it("gives a pin the same tilt, tack and scrap every time", () => {
    const id = "6f1c2f0e-1d1c-4a39-8e52-3b0a7b9a1e11";
    expect(seededRotation(id)).toBe(seededRotation(id));
    expect(seededTack(id, "note")).toBe(seededTack(id, "note"));
    expect(seededScrap(id, "note")).toBe(seededScrap(id, "note"));
  });

  it("keeps the tilt within four degrees and varies it across ids", () => {
    const angles = Array.from({ length: 200 }, (_, i) => seededRotation(`pin-${i}`));
    expect(Math.max(...angles)).toBeLessThanOrEqual(4);
    expect(Math.min(...angles)).toBeGreaterThanOrEqual(-4);
    expect(new Set(angles).size).toBeGreaterThan(40);
  });

  it("nails a wanted poster and tacks everything else, using every colour across a board", () => {
    expect(seededTack("grell", "poster")).toBe("nail");
    const tacks = new Set(Array.from({ length: 100 }, (_, i) => seededTack(`n-${i}`, "letter")));
    expect([...tacks].sort()).toEqual([...TACKS].sort());
  });

  it("tears a poster's scrap from poster paper and a note's from parchment", () => {
    expect(seededScrap("grell", "poster")).toMatch(/^poster-scrap-[01]$/);
    expect(seededScrap("gerald", "note")).toMatch(/^scrap-[012]$/);
  });
});

describe("pinSize", () => {
  it("grows with the chosen size for every style, and a poster stands taller than it is wide", () => {
    for (const style of ["note", "poster", "letter", "image"] as const) {
      const { w: sm } = pinSize(style, "sm");
      const { w: md } = pinSize(style, "md");
      const { w: lg } = pinSize(style, "lg");
      expect(sm, style).toBeLessThan(md);
      expect(md, style).toBeLessThan(lg);
    }
    const poster = pinSize("poster", "md");
    expect(poster.h / poster.w).toBeCloseTo(4 / 3, 2);
  });
});

describe("findFreeSpot", () => {
  it("answers the same way twice and keeps a new pin on the board", () => {
    const a = findFreeSpot([], "note", "md");
    expect(findFreeSpot([], "note", "md")).toEqual(a);
    const { w, h } = pinSize("note", "md");
    expect(a.x * BOARD_W + w).toBeLessThanOrEqual(BOARD_W);
    expect(a.y * BOARD_H + h).toBeLessThanOrEqual(BOARD_H);
  });

  it("avoids a pin already pinned in the first spot it would have chosen", () => {
    const first = findFreeSpot([], "note", "md");
    const second = findFreeSpot([{ style: "note", size: "md", ...first }], "note", "md");
    const dx = Math.abs(second.x - first.x) * BOARD_W;
    const dy = Math.abs(second.y - first.y) * BOARD_H;
    expect(dx >= pinSize("note", "md").w || dy >= pinSize("note", "md").h).toBe(true);
  });

  it("finds the one open stretch of a crowded board", () => {
    // Nine large notes tile the left three quarters of the board (x 0 to 1200 of 1600).
    const crowd = [0, 0.25, 0.5].flatMap((x) =>
      [0, 0.3375, 0.675].map((y) => ({ style: "note" as const, size: "lg" as const, x, y })),
    );
    const spot = findFreeSpot(crowd, "note", "sm");
    expect(spot.x * BOARD_W).toBeGreaterThanOrEqual(1200);
  });

  it("puts a second pin as far from the first as the board allows when nothing is in the way", () => {
    const corner = { style: "note" as const, size: "sm" as const, x: 0.05, y: 0.08 };
    const spot = findFreeSpot([corner], "note", "sm");
    expect(spot.x).toBeGreaterThan(0.5);
    expect(spot.y).toBeGreaterThan(0.5);
  });
});

describe("keepOnBoard", () => {
  it("leaves a pin that fits where it is", () => {
    expect(keepOnBoard(0.25, 0.3, "note", "md")).toEqual({ x: 0.25, y: 0.3 });
  });

  it("nudges a pin flush to the right back on when it grows to Large", () => {
    const flush = 1 - 300 / BOARD_W;
    expect(keepOnBoard(flush, 0.1, "note", "lg")).toEqual({ x: 1 - 400 / BOARD_W, y: 0.1 });
  });

  it("never rounds a pin back over the far edge", () => {
    const { h } = pinSize("poster", "lg");
    const at = keepOnBoard(0.1, 1, "poster", "lg");
    expect(at.y * BOARD_H + h).toBeLessThanOrEqual(BOARD_H);
    expect(at.x).toBe(0.1);
  });

  it("keeps a pin off the near edges too", () => {
    expect(keepOnBoard(-0.2, -0.01, "letter", "sm")).toEqual({ x: 0, y: 0 });
  });
});
