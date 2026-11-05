import { describe, expect, it } from "vitest";
import { stillSize, STILL_WIDTH } from "./still";
import { newScene } from "./edit";

describe("stillSize", () => {
  // Bug: a still cut to the room's own shape (a tall painting) shown in a 16:9 card and on the TV, cropped twice.
  it("takes the wide window's shape, not the room's", () => {
    const tall = newScene({ id: "n", title: "N", room: { url: "r", width: 1024, height: 1536 } });
    const { width, height } = stillSize(tall);
    expect(width).toBe(STILL_WIDTH);
    expect(width / height).toBeCloseTo(16 / 9, 2);
  });
});
