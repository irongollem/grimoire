import { describe, expect, it } from "vitest";
import { wallKindCategory } from "./wallKinds";

describe("wallKindCategory", () => {
  it("draws each painted kind from its own category, by edge direction", () => {
    expect(wallKindCategory("wall", "N")).toBe("wallSegmentH");
    expect(wallKindCategory("wall", "W")).toBe("wallSegmentV");
    expect(wallKindCategory("grate", "N")).toBe("edgeGrateH");
    expect(wallKindCategory("sluice", "W")).toBe("edgeSluiceV");
  });

});
