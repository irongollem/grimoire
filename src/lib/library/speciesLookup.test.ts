import { describe, expect, it } from "vitest";
import { indexById, splitSpeciesIds } from "./speciesLookup";

const UUID_A = "6f1f3d2a-8c1b-4f0e-9a52-1c2d3e4f5a6b";
const UUID_B = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

describe("splitSpeciesIds", () => {
  it("sends slugs to the library table and uuids to the custom table, sorted and deduplicated", () => {
    expect(splitSpeciesIds(["srd_srd_dragonborn", UUID_B, UUID_A, "srd_srd_dragonborn", "srd_elf"])).toEqual({
      libraryIds: ["srd_elf", "srd_srd_dragonborn"],
      customIds: [UUID_B, UUID_A].sort(),
    });
  });

  it("drops null, undefined and empty ids", () => {
    expect(splitSpeciesIds([null, undefined, ""])).toEqual({ libraryIds: [], customIds: [] });
  });
});

describe("indexById", () => {
  it("merges several lists into one map keyed by id", () => {
    const map = indexById([{ id: "a", name: "A" }], [{ id: "b", name: "B" }]);
    expect(map.get("a")?.name).toBe("A");
    expect(map.get("b")?.name).toBe("B");
    expect(map.size).toBe(2);
  });
});
