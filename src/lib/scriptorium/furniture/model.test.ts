import { describe, it, expect } from "vitest";
import { createFurnitureItem, parsePageFurniture } from "./model";

describe("createFurnitureItem", () => {
  it("applies kind defaults", () => {
    const wc = createFurnitureItem("watercolor", { type: "page", page: 1 });
    expect(wc.kind).toBe("watercolor");
    expect(wc.z).toBe("under");
    expect(wc.props.variant).toBe(1);
    expect(wc.id).toBeTruthy();
  });

  it("watermark/art/credit have sensible defaults", () => {
    expect(createFurnitureItem("watermark", { type: "page", page: 1 }).props.text).toBe("DRAFT");
    expect(createFurnitureItem("art", { type: "page", page: 1 }).z).toBe("over");
    expect(createFurnitureItem("artistCredit", { type: "page", page: 1 }).props.position).toBe("bottom-right");
  });

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
    const a = createFurnitureItem("art", { type: "page", page: 1 });
    const b = createFurnitureItem("art", { type: "page", page: 1 });
    expect(a.id).not.toBe(b.id);
  });
});

describe("parsePageFurniture", () => {
  const valid = {
    id: "x",
    kind: "watercolor",
    anchor: { type: "page", page: 2 },
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
      { ...valid, anchor: { type: "block", blockId: "b" } },
    ]);
    expect(items).toHaveLength(2); // valid + valid-block-anchor
  });

  it("fills missing numeric/z fields with safe defaults", () => {
    const [item] = parsePageFurniture([{ id: "y", kind: "art", anchor: { type: "page", page: 1 } }]);
    expect(item.x).toBe(0);
    expect(item.z).toBe("under");
    expect(item.props).toEqual({});
  });
});
