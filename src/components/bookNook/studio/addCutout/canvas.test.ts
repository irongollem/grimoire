import { describe, expect, it } from "vitest";
import { fitWithin } from "./canvas";

describe("fitWithin", () => {
  it("shrinks a big photo so its longest side is the limit, keeping its shape", () => {
    // Bug: a phone photo went to the model at full size and was refused as too large.
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3000, 6000, 2048)).toEqual({ width: 1024, height: 2048 });
  });
  it("never scales a small picture up", () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
});
