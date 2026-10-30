import { describe, it, expect } from "vitest";
import { createFurnitureItem, parsePageFurniture } from "./model";

describe("createFurnitureItem", () => {
  it("merges overrides (incl. nested props)", () => {
    const item = createFurnitureItem(
      "watercolor",
      { type: "block", blockId: "b1" },
      { x: 50, props: { color: "#000000" } },
    );
    expect(item.x).toBe(50);
    expect(item.props.color).toBe("#000000");
    expect(item.props.variant).toBe(1); // default kept
    expect(item.anchor).toEqual({ type: "block", blockId: "b1" });
  });

  it("gives each item a unique id", () => {
    const a = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 });
    const b = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 });
    expect(a.id).not.toBe(b.id);
  });
});

describe("parsePageFurniture", () => {
  const valid = {
    id: "x",
    kind: "watercolor",
    anchor: { type: "page", chapterId: "c1", page: 2 },
    x: 5, y: 6, width: 30, z: "under",
    props: { variant: 3 },
  };

  it("parses a valid array", () => {
    expect(parsePageFurniture([valid])).toHaveLength(1);
  });

  it("parses a JSON string", () => {
    expect(parsePageFurniture(JSON.stringify([valid]))).toHaveLength(1);
  });

  it("returns [] for null / non-array / bad json", () => {
    expect(parsePageFurniture(null)).toEqual([]);
    expect(parsePageFurniture("{not json")).toEqual([]);
    expect(parsePageFurniture({})).toEqual([]);
  });

  it("drops malformed items (bad kind, missing id, bad anchor)", () => {
    const items = parsePageFurniture([
      valid,
      { ...valid, kind: "bogus" },
      { ...valid, id: 5 },
      { ...valid, anchor: { type: "page" } },
      { ...valid, anchor: { type: "page", page: 1 } }, // no chapter to count the page in
      { ...valid, anchor: { type: "block", blockId: "b" } },
    ]);
    expect(items).toHaveLength(2); // valid + valid-block-anchor
  });

  it("keeps z over, and drops a block anchor whose blockId is not a string", () => {
    const items = parsePageFurniture([
      { ...valid, z: "over" },
      { ...valid, anchor: { type: "block", blockId: 7 } },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].z).toBe("over");
  });

  it("fills missing numeric/z fields with safe defaults", () => {
    const [item] = parsePageFurniture([{ id: "y", kind: "art", anchor: { type: "page", chapterId: "c1", page: 1 } }]);
    expect(item.x).toBe(0);
    expect(item.z).toBe("under");
    expect(item.props).toEqual({});
  });
});
