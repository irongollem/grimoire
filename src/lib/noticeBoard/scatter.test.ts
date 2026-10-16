import { describe, expect, it } from "vitest";
import { BOARD_H, BOARD_W, POSTER_SCRAPS, SCRAPS, TACKS, pinSize, type PinSlot } from "./geometry";
import { FULL_SCATTER, MIN_GAP, freeCells, scatterBoard, scatterCount } from "./scatter";

const ART = new Set<string>([...SCRAPS, ...POSTER_SCRAPS, ...TACKS, "nail"]);

/** A board tiled with large posters, edge to edge. */
function crowded(): PinSlot[] {
  const { w, h } = pinSize("poster", "lg");
  const pins: PinSlot[] = [];
  for (let y = 0; y < BOARD_H; y += h) {
    for (let x = 0; x < BOARD_W; x += w) pins.push({ style: "poster", size: "lg", x: x / BOARD_W, y: y / BOARD_H });
  }
  return pins;
}

describe("scatterBoard", () => {
  it("gives an empty board the full scatter, and a crowded one none", () => {
    expect(scatterCount([])).toBe(FULL_SCATTER);
    expect(scatterBoard([], "seed")).toHaveLength(FULL_SCATTER);
    expect(scatterBoard(crowded(), "seed")).toEqual([]);
  });

  it("gives a half-hung board fewer pieces than an empty one", () => {
    const pins: PinSlot[] = [
      { style: "poster", size: "lg", x: 0.05, y: 0.08 },
      { style: "note", size: "lg", x: 0.3, y: 0.1 },
      { style: "letter", size: "lg", x: 0.3, y: 0.55 },
    ];
    const count = scatterBoard(pins, "seed").length;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(FULL_SCATTER);
    expect(count).toBe(scatterCount(pins));
  });

  it("is the same board for the same seed, and a different one for another", () => {
    expect(scatterBoard([], "a")).toEqual(scatterBoard([], "a"));
    expect(scatterBoard([], "a")).not.toEqual(scatterBoard([], "b"));
  });

  it("keeps every piece inside the frame, in the free space, apart from the others, and drawn with real art", () => {
    const pins: PinSlot[] = [{ style: "poster", size: "lg", x: 0.4, y: 0.3 }];
    const pieces = scatterBoard(pins, "seed");
    const { w, h } = pinSize("poster", "lg");
    for (const [i, piece] of pieces.entries()) {
      const x = piece.x * BOARD_W;
      const y = piece.y * BOARD_H;
      // Clear of the frame's rail, with room for half a scrap; the jitter moves a centre up to half a cell.
      expect(x).toBeGreaterThan(120);
      expect(x).toBeLessThan(BOARD_W - 120);
      expect(y).toBeGreaterThan(120);
      expect(y).toBeLessThan(BOARD_H - 120);
      expect(x > 0.4 * BOARD_W && x < 0.4 * BOARD_W + w && y > 0.3 * BOARD_H && y < 0.3 * BOARD_H + h).toBe(false);
      expect(ART.has(piece.art)).toBe(true);
      if (piece.tack !== null) expect(ART.has(piece.tack)).toBe(true);
      for (const other of pieces.slice(i + 1)) {
        // The jitter can pull two centres in by up to a cell's width.
        expect(Math.hypot((other.x - piece.x) * BOARD_W, (other.y - piece.y) * BOARD_H)).toBeGreaterThan(MIN_GAP - 60);
      }
    }
  });

  it("holds a poster's scrap with a nail and a note's with a tack", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      for (const piece of scatterBoard([], seed)) {
        if ((POSTER_SCRAPS as readonly string[]).includes(piece.art)) expect(piece.tack).toBe("nail");
        if ((SCRAPS as readonly string[]).includes(piece.art)) expect(TACKS as readonly string[]).toContain(piece.tack);
      }
    }
  });

  it("measures free space inside the frame only", () => {
    const { free, total } = freeCells([]);
    expect(free).toHaveLength(total);
    expect(total).toBeGreaterThan(100);
  });
});
