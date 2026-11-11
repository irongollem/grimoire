import { describe, it, expect } from "vitest";
import { createFurnitureItem, parsePageFurniture, snapCorner, freeCoordinates, SNAP_PCT } from "./model";

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

describe("corner pinning", () => {
  const stored = { id: "a", kind: "art", anchor: { type: "block", blockId: "b" }, x: 0, y: 0, width: 30, z: "over", props: {} };

  it("an unknown corner from a stored row is dropped, the item kept", () => {
    const [item] = parsePageFurniture([{ ...stored, corner: "middle" }]);
    expect(item.id).toBe("a");
    expect("corner" in item).toBe(false);
  });

  it("a valid stored corner survives parsing", () => {
    expect(parsePageFurniture([{ ...stored, corner: "bottom-right" }])[0].corner).toBe("bottom-right");
  });

  it("snaps only when both axes are within the threshold of the same corner", () => {
    expect(snapCorner(SNAP_PCT, SNAP_PCT, 30, 20)).toBe("top-left");
    expect(snapCorner(100 - 30 - 1, 100 - 20 - 1, 30, 20)).toBe("bottom-right");
    expect(snapCorner(0, 50, 30, 20)).toBeNull(); // hugging one edge is not a corner
    expect(snapCorner(SNAP_PCT + 0.5, 0, 30, 20)).toBeNull();
  });

  it("converts a right/bottom inset back to the left/top coordinates it is drawn at", () => {
    const item = { ...createFurnitureItem("art", { type: "block", blockId: "b" }, { width: 30 }), corner: "bottom-right" as const, x: 0, y: 0 };
    expect(freeCoordinates(item, 20)).toEqual({ x: 70, y: 80 });
  });

  it("gives no coordinates for a bottom corner whose height is unknown, rather than a guess that moves the picture", () => {
    const item = { ...createFurnitureItem("art", { type: "block", blockId: "b" }, { width: 30 }), corner: "bottom-left" as const, x: 0, y: 0 };
    expect(freeCoordinates(item, null)).toBeNull();
    expect(freeCoordinates({ ...item, corner: "top-right" }, null)).toEqual({ x: 70, y: 0 });
  });
});
