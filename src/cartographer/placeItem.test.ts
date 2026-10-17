import { describe, expect, it } from "vitest";
import { placeItemLabel, pushRecent, samePlaceItem } from "./placeItem";
import type { PlaceItem } from "./tools";

const chestAny: PlaceItem = { kind: "object", category: "objectChest", variant: "any" };
const chest1: PlaceItem = { kind: "object", category: "objectChest", variant: 1 };
const table: PlaceItem = { kind: "prop", propId: "table" };

describe("samePlaceItem", () => {
  it("compares kind, category, variant and prop id; null only equals null", () => {
    expect(samePlaceItem(chestAny, { ...chestAny })).toBe(true);
    expect(samePlaceItem(chestAny, chest1)).toBe(false);
    expect(samePlaceItem(table, { kind: "prop", propId: "table" })).toBe(true);
    expect(samePlaceItem(table, chestAny)).toBe(false);
    expect(samePlaceItem(null, null)).toBe(true);
    expect(samePlaceItem(null, table)).toBe(false);
  });
});

describe("pushRecent", () => {
  it("puts the newest first, drops its earlier copy and caps the list", () => {
    expect(pushRecent([chestAny, table], table)).toEqual([table, chestAny]);
    const many = Array.from({ length: 10 }, (_, i): PlaceItem => ({ kind: "prop", propId: `p${i}` }));
    expect(pushRecent(many, chest1, 8)).toHaveLength(8);
    expect(pushRecent(many, chest1, 8)[0]).toEqual(chest1);
  });
});

describe("placeItemLabel", () => {
  const manifest = { labels: { objectChest: ["Oak chest", "Iron chest"] } };
  it("names objects by the pack's labels and props by the library", () => {
    expect(placeItemLabel(chest1, manifest, () => undefined)).toBe("Iron chest");
    expect(placeItemLabel(chestAny, manifest, () => undefined)).toBe("Oak chest (any)");
    expect(placeItemLabel(table, manifest, (id) => (id === "table" ? "Long table" : undefined))).toBe("Long table");
    expect(placeItemLabel({ kind: "prop", propId: "gone" }, manifest, () => undefined)).toBe("Unknown prop");
  });
});
