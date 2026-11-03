import { describe, expect, it } from "vitest";
import { scaleToFit } from "./posterFrame";

describe("scaleToFit", () => {
  // #1125 decision 6: stills are held to 4096 px on the long edge.
  it("shrinks a wide 8192x4096 map to 4096 on its long edge, keeping the ratio", () => {
    expect(scaleToFit(8192, 4096)).toEqual({ width: 4096, height: 2048 });
  });
  it("shrinks by the height when the map is tall", () => {
    expect(scaleToFit(3000, 6000)).toEqual({ width: 2048, height: 4096 });
  });
  it("never upscales a small map", () => {
    expect(scaleToFit(1280, 720)).toEqual({ width: 1280, height: 720 });
  });
});
