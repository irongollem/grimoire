import { describe, expect, it } from "vitest";
import { deriveSlotTags, withSlotTags } from "./slotTags";
import { baseGearWeight } from "./baseGearWeights";

describe("deriveSlotTags", () => {
  it.each([
    ["Cloak of Protection", "wondrous_item", ["shoulders"]],
    ["Winter Cloak", "gear", ["shoulders"]],
    ["Mantle of Spell Resistance", "wondrous_item", ["shoulders"]],
    ["Boots of Speed", "wondrous_item", ["feet"]],
    ["Slippers of Spider Climbing", "wondrous_item", ["feet"]],
    ["Gauntlets of Ogre Power", "wondrous_item", ["hands"]],
    ["Bracers of Defense", "wondrous_item", ["hands"]],
    ["Belt of Hill Giant Strength", "wondrous_item", ["waist"]],
    ["Amulet of Health", "wondrous_item", ["neck"]],
    ["Periapt of Wound Closure", "wondrous_item", ["neck"]],
    ["Brooch of Shielding", "wondrous_item", ["neck"]],
    ["Helm of Brilliance", "wondrous_item", ["head"]],
    ["Eyes of the Eagle", "wondrous_item", ["head"]],
    ["Goggles of Night", "wondrous_item", ["head"]],
    ["Headband of Intellect", "wondrous_item", ["head"]],
    ["Robe of Stars", "wondrous_item", ["clothes"]],
    ["Clothes, Fine", "gear", ["clothes"]],
    ["Wings of Flying", "wondrous_item", ["shoulders"]],
  ] as const)("%s is worn on %j", (name, type, slots) => {
    expect(deriveSlotTags(name, type)).toEqual(slots);
  });

  it.each([
    ["Bag of Holding", "wondrous_item"],
    ["Oil of Slipperiness", "gear"],
    ["Horseshoes of Speed", "wondrous_item"],
    ["Probe", "gear"],
    ["Hatchet", "gear"],
    ["That Which Is Lost", "wondrous_item"],
    ["Cubic Gate", "wondrous_item"],
    ["Ring of Protection", "ring"],
    ["Boots", "potion"],
    ["Shield of Missile Attraction", "shield"],
  ] as const)("%s is not worn by name", (name, type) => {
    expect(deriveSlotTags(name, type)).toEqual([]);
  });

  it("withSlotTags keeps existing tags and never duplicates", () => {
    expect(withSlotTags(["magic"], "Cloak of Elvenkind", "wondrous_item")).toEqual(["magic", "shoulders"]);
    expect(withSlotTags(["shoulders"], "Cloak of Elvenkind", "wondrous_item")).toEqual(["shoulders"]);
  });
});

describe("baseGearWeight", () => {
  it("reads the book weight across both editions' spellings", () => {
    expect(baseGearWeight("Chain mail")).toBe(55);
    expect(baseGearWeight("Plate Armor")).toBe(65);
    expect(baseGearWeight("Shield")).toBe(6);
    expect(baseGearWeight("Crossbow, Hand")).toBe(3);
    expect(baseGearWeight("Hand Crossbow")).toBe(3);
    expect(baseGearWeight("Dart")).toBe(0.25);
  });
  it("is null for anything that is not a base weapon or armor", () => {
    expect(baseGearWeight("Longsword +1")).toBeNull();
    expect(baseGearWeight("Flame Tongue")).toBeNull();
  });
});
