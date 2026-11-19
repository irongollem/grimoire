import { describe, expect, it } from "vitest";
import { FLOOR_SAMPLES, floorFromPixels, voidAround } from "./pictureFloor";

/** A picture of `cols` by `rows` squares where `paint` gives each square's colour (r, g, b, a). */
function picture(cols: number, rows: number, paint: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const width = cols * FLOOR_SAMPLES;
  const data = new Uint8ClampedArray(width * rows * FLOOR_SAMPLES * 4);
  for (let py = 0; py < rows * FLOOR_SAMPLES; py++) {
    for (let px = 0; px < width; px++) {
      data.set(paint(Math.floor(px / FLOOR_SAMPLES), Math.floor(py / FLOOR_SAMPLES)), (py * width + px) * 4);
    }
  }
  return data;
}

describe("floorFromPixels", () => {
  // Bug caught: a token seated in the black a map picture leaves around its rooms.
  it("takes lit squares for ground and leaves out the black and the transparent", () => {
    const floor = floorFromPixels(
      picture(3, 1, (x) => (x === 0 ? [90, 70, 40, 255] : x === 1 ? [0, 0, 0, 255] : [200, 200, 200, 0])),
      { cols: 3, rows: 1 },
    );
    expect([...floor]).toEqual(["0,0"]);
  });

  // Bug caught: a dim, lamp-lit cellar read as void, leaving a dark dungeon with nowhere to stand.
  it("keeps a dark but drawn floor", () => {
    expect(floorFromPixels(picture(1, 1, () => [28, 22, 18, 255]), { cols: 1, rows: 1 }).size).toBe(1);
  });

  // Bug caught (seen live): creatures stood, and a walk routed, on the dark slate a house is drawn on, which is not
  // black enough to be read as nothing.
  it("leaves out the dark surround a building is drawn on, and keeps the building", () => {
    // A 5 by 5 picture: slate all round, a lit 3 by 3 room in the middle.
    const inside = (x: number, y: number) => x >= 1 && x <= 3 && y >= 1 && y <= 3;
    const floor = floorFromPixels(picture(5, 5, (x, y) => (inside(x, y) ? [150, 110, 60, 255] : [38, 40, 46, 255])), { cols: 5, rows: 5 });
    expect(floor.size).toBe(9);
    expect(floor.has("0,0")).toBe(false);
    expect(floor.has("2,2")).toBe(true);
  });

  // Bug caught: a map whose ground runs to the picture's edge losing its whole floor to the "surround" rule.
  it("keeps ground that reaches the edge of the picture, light or dark", () => {
    expect(floorFromPixels(picture(4, 4, () => [150, 110, 60, 255]), { cols: 4, rows: 4 }).size).toBe(16);
    expect(floorFromPixels(picture(4, 4, () => [40, 38, 36, 255]), { cols: 4, rows: 4 }).size).toBe(16);
  });
});

describe("voidAround", () => {
  // Bug caught: the ground itself marked as somewhere nothing can go.
  it("is every square of the grid that is not ground", () => {
    expect([...voidAround(new Set(["0,0"]), { cols: 2, rows: 1 })]).toEqual(["1,0"]);
  });
});
