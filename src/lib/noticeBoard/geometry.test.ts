import { describe, expect, it } from "vitest";
import {
  BOARD_H,
  BOARD_W,
  boardScale,
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
  it("makes a medium note 300 units wide and a poster three by four", () => {
    expect(pinSize("note", "md").w).toBe(300);
    expect(pinSize("note", "sm").w).toBe(220);
    expect(pinSize("note", "lg").w).toBe(400);
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

  it("finds the one open corner of a crowded board", () => {
    const crowd = [];
    for (let x = 0.05; x < 0.9; x += 0.19) for (let y = 0.05; y < 0.8; y += 0.3) crowd.push({ style: "note" as const, size: "md" as const, x, y });
    const spot = findFreeSpot(crowd, "note", "sm");
    expect(spot.x).toBeGreaterThanOrEqual(0);
    expect(spot.x).toBeLessThanOrEqual(1);
  });
});
