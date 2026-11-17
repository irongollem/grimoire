import { describe, expect, it } from "vitest";
import { FLOOR_SAMPLES, floorFromPixels } from "./pictureFloor";

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
});
