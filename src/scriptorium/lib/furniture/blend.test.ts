import { describe, expect, it } from "vitest";
import { artBlend, asBlend, imageBlend } from "./blend";

describe("picture blend", () => {
  // Fails on: a picture in the text defaulting to multiply, which would tint every existing picture.
  it("a picture in the text sits on top unless it was printed into the paper", () => {
    expect(imageBlend({})).toBe("top");
    expect(imageBlend({ blend: "paper" })).toBe("paper");
    expect(imageBlend({ blend: "screen" })).toBe("top");
  });

  // Fails on: art behind the text losing the multiply it has always had.
  it("art behind the text defaults to the paper, art in front to on top, and a choice wins either way", () => {
    expect(artBlend({ z: "under", props: {} })).toBe("paper");
    expect(artBlend({ z: "over", props: {} })).toBe("top");
    expect(artBlend({ z: "under", props: { blend: "top" } })).toBe("top");
    expect(artBlend({ z: "over", props: { blend: "paper" } })).toBe("paper");
  });

  it("reads only the two blends", () => {
    expect(asBlend("paper")).toBe("paper");
    expect(asBlend(1)).toBeNull();
  });
});
