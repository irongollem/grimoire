import { describe, expect, it } from "vitest";
import {
  sortByHierarchy,
  buildIdMapFromArrays,
  remapKeep,
  remapKeepArr,
  remapOrNull,
  freshId,
} from "@/lib/campaign/campaignSerialization";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("sortByHierarchy", () => {
  it("orders parents before their children", () => {
    const rows = [
      { id: "c", parent_id: "b" },
      { id: "b", parent_id: "a" },
      { id: "a", parent_id: null },
    ];
    const sorted = sortByHierarchy(rows, "parent_id");
    const order = sorted.map((r) => r.id);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
  });

  it("treats a parent that is not in the set as a root (sorts first)", () => {
    const rows = [
      { id: "child", parent_id: "external-not-here" },
      { id: "root", parent_id: null },
    ];
    const sorted = sortByHierarchy(rows, "parent_id");
    // Both qualify as roots immediately; every row survives, none dropped.
    expect(sorted).toHaveLength(2);
    expect(sorted.map((r) => r.id).sort()).toEqual(["child", "root"]);
  });

  it("keeps multiple roots and their subtrees in valid topological order", () => {
    const rows = [
      { id: "a1", parent_id: "a" },
      { id: "b", parent_id: null },
      { id: "a", parent_id: null },
      { id: "b1", parent_id: "b" },
      { id: "a1a", parent_id: "a1" },
    ];
    const sorted = sortByHierarchy(rows, "parent_id");
    const order = sorted.map((r) => r.id);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("a1"));
    expect(order.indexOf("a1")).toBeLessThan(order.indexOf("a1a"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("b1"));
    expect(sorted).toHaveLength(5);
  });

  it("does not drop rows caught in a circular reference", () => {
    const rows = [
      { id: "x", parent_id: "y" },
      { id: "y", parent_id: "x" },
    ];
    const sorted = sortByHierarchy(rows, "parent_id");
    expect(sorted).toHaveLength(2);
    expect(sorted.map((r) => r.id).sort()).toEqual(["x", "y"]);
  });

  it("returns an empty array for empty input", () => {
    expect(sortByHierarchy([], "parent_id")).toEqual([]);
  });
});

describe("buildIdMapFromArrays", () => {
  it("assigns a unique fresh UUID for every row with an id", () => {
    const map = buildIdMapFromArrays([
      [{ id: "a" }, { id: "b" }],
      [{ id: "c" }],
    ]);
    expect([...map.keys()].sort()).toEqual(["a", "b", "c"]);
    for (const [oldId, newId] of map) {
      expect(newId).not.toBe(oldId);
      expect(newId).toMatch(UUID_RE);
    }
    // All freshly minted ids are distinct.
    expect(new Set(map.values()).size).toBe(3);
  });

  it("skips undefined arrays and rows without an id", () => {
    const map = buildIdMapFromArrays([
      undefined,
      [{ id: "a" }, { name: "no-id-row" }],
    ]);
    expect([...map.keys()]).toEqual(["a"]);
  });
});

describe("remapKeep (preserve-on-miss)", () => {
  const map = new Map([["old", "new"]]);

  it("remaps an id present in the map", () => {
    expect(remapKeep("old", map)).toBe("new");
  });

  it("preserves the original id when not in the map", () => {
    expect(remapKeep("library-ref", map)).toBe("library-ref");
  });

  it("returns null for null/undefined/empty-string ids", () => {
    expect(remapKeep(null, map)).toBeNull();
    expect(remapKeep(undefined, map)).toBeNull();
    expect(remapKeep("", map)).toBeNull();
  });
});

describe("remapKeepArr", () => {
  const map = new Map([["a", "A"]]);

  it("remaps known ids and preserves unknown ones", () => {
    expect(remapKeepArr(["a", "z"], map)).toEqual(["A", "z"]);
  });

  it("returns [] for non-array input", () => {
    expect(remapKeepArr(null, map)).toEqual([]);
    expect(remapKeepArr(undefined, map)).toEqual([]);
    expect(remapKeepArr("a", map)).toEqual([]);
  });
});

describe("remapOrNull (null-on-miss)", () => {
  const map = new Map([["old", "new"]]);

  it("remaps an id present in the map", () => {
    expect(remapOrNull("old", map)).toBe("new");
  });

  it("returns null when the id is not in the map (entity did not travel)", () => {
    expect(remapOrNull("not-bundled", map)).toBeNull();
  });

  it("returns null for null/undefined/empty-string ids", () => {
    expect(remapOrNull(null, map)).toBeNull();
    expect(remapOrNull(undefined, map)).toBeNull();
    expect(remapOrNull("", map)).toBeNull();
  });
});

describe("freshId", () => {
  it("returns the mapped id when present", () => {
    expect(freshId("old", new Map([["old", "new"]]))).toBe("new");
  });

  it("mints a fresh UUID when the id is absent", () => {
    const minted = freshId("missing", new Map());
    expect(minted).toMatch(UUID_RE);
  });
});
