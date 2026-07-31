import { describe, it, expect } from "vitest";
import { toReorderEntries, toRpcArrays } from "@/lib/reorder";

describe("toReorderEntries", () => {
  it("assigns 0-based sort_order by position, preserving input order", () => {
    expect(toReorderEntries(["c", "a", "b"])).toEqual([
      { id: "c", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
  });

  it("returns an empty array for an empty list", () => {
    expect(toReorderEntries([])).toEqual([]);
  });

  it("handles a single id", () => {
    expect(toReorderEntries(["only"])).toEqual([{ id: "only", sort_order: 0 }]);
  });
});

describe("toRpcArrays", () => {
  it("splits entries into parallel id/order arrays, preserving pairing", () => {
    const entries = [
      { id: "id-1", sort_order: 5 },
      { id: "id-2", sort_order: 2 },
      { id: "id-3", sort_order: 9 },
    ];
    expect(toRpcArrays(entries)).toEqual({
      ids: ["id-1", "id-2", "id-3"],
      orders: [5, 2, 9],
    });
  });

  it("returns empty parallel arrays for an empty list", () => {
    expect(toRpcArrays([])).toEqual({ ids: [], orders: [] });
  });

  it("round-trips through toReorderEntries for a drag-reordered id list", () => {
    const orderedIds = ["z", "y", "x"];
    expect(toRpcArrays(toReorderEntries(orderedIds))).toEqual({
      ids: ["z", "y", "x"],
      orders: [0, 1, 2],
    });
  });
});
