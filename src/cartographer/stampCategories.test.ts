import { describe, expect, it } from "vitest";
import { decalLabel, STAMP_CATEGORIES, stampLabel } from "./stampCategories";

describe("stampLabel", () => {
  it("uses the pack's own name first, so a forest's pillar reads as its tree", () => {
    expect(stampLabel({ labels: { objectPillar: ["Old tree"] } }, "objectPillar")).toBe("Old tree");
  });

  it("falls back to the schema's name, without the object prefix", () => {
    expect(stampLabel(null, "objectChest")).toBe("Chest");
    expect(stampLabel({ labels: {} }, "stairsUp")).toBe("Stairs up");
  });
});

describe("decalLabel", () => {
  it("names each decal by the pack's label for that variant, else by its number", () => {
    const manifest = { labels: { wallDecal: ["Outflow pipe", "Rat hole"] } };
    expect(decalLabel(manifest, 1)).toBe("Rat hole");
    expect(decalLabel(manifest, 2)).toBe("Decal 3");
    expect(decalLabel(undefined, 0)).toBe("Decal 1");
  });
});

describe("STAMP_CATEGORIES", () => {
  it("adds the stairs and the litter to the six object stamps", () => {
    expect(STAMP_CATEGORIES).toEqual(expect.arrayContaining(["objectChest", "stairsUp", "stairsDown", "rubble", "debris"]));
    expect(STAMP_CATEGORIES).toHaveLength(10);
  });
});
