import { describe, expect, it } from "vitest";
import { wallKindCategory, WALL_KINDS } from "./wallKinds";

describe("wallKindCategory", () => {
  it("draws each painted kind from its own category, by edge direction", () => {
    expect(wallKindCategory("wall", "N")).toBe("wallSegmentH");
    expect(wallKindCategory("wall", "W")).toBe("wallSegmentV");
    expect(wallKindCategory("grate", "N")).toBe("edgeGrateH");
    expect(wallKindCategory("sluice", "W")).toBe("edgeSluiceV");
  });

  it("offers decal as a kind of its own", () => {
    expect(WALL_KINDS.map((k) => k.value)).toEqual(["wall", "grate", "sluice", "decal"]);
  });
});
