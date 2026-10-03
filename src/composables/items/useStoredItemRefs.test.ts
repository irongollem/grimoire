import { describe, expect, it } from "vitest";
import { missingLibraryIds } from "./useStoredItemRefs";

const UUID = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";

describe("missingLibraryIds", () => {
  it("returns library ids the known list cannot resolve, deduped and sorted", () => {
    const known = new Set(["srd_a_torch"]);
    expect(missingLibraryIds(["srd_z_rope", "srd_a_torch", "srd_z_rope", "srd_b_lamp"], known)).toEqual([
      "srd_b_lamp",
      "srd_z_rope",
    ]);
  });

  it("never fetches uuids, those are own items", () => {
    expect(missingLibraryIds([UUID], new Set())).toEqual([]);
  });
});
