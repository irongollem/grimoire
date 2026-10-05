import { describe, expect, it } from "vitest";
import type { Item } from "@/types/item.types";
import { equipSlotOptions, itemSummaryLine, visibleTypeLabel } from "./itemDetailSummary";

function item(over: Partial<Item>): Item {
  return { item_type: "gear", rarity: "mundane", tags: [], ...over } as Item;
}
const never = () => false;

describe("visibleTypeLabel / itemSummaryLine", () => {
  it("reads rarity and type for an identified magic item", () => {
    expect(itemSummaryLine(item({ item_type: "wondrous_item", rarity: "very_rare" }), true)).toBe("Very rare wondrous item");
  });
  it("is just the type for a mundane item", () => {
    expect(itemSummaryLine(item({ item_type: "weapon" }), true)).toBe("Weapon");
  });
  it("masks an unidentified magic item as a mundane stand-in", () => {
    const ring = item({ item_type: "ring", rarity: "rare" });
    expect(visibleTypeLabel(ring, false)).toBe("Art Object");
    expect(itemSummaryLine(ring, false)).toBe("Art object");
    expect(itemSummaryLine(item({ item_type: "potion", rarity: "uncommon" }), false)).toBe("Provision");
  });
});

describe("equipSlotOptions", () => {
  it("puts armor on the body and a shield in the off hand", () => {
    expect(equipSlotOptions(item({ item_type: "armor" }), never, never).map((o) => o.slot)).toEqual(["body"]);
    expect(equipSlotOptions(item({ item_type: "shield" }), never, never).map((o) => o.slot)).toEqual(["off_hand"]);
  });
  it("offers both hands for a weapon, and flags a taken one", () => {
    const opts = equipSlotOptions(item({ item_type: "weapon" }), (s) => s === "main_hand", never);
    expect(opts).toEqual([
      { slot: "main_hand", label: "Main hand", free: false },
      { slot: "off_hand", label: "Off hand", free: true },
    ]);
  });
  it("uses the tag-matched slot for wondrous items, else other", () => {
    const cloak = item({ item_type: "wondrous_item" });
    expect(equipSlotOptions(cloak, never, (s) => s === "shoulders").map((o) => o.slot)).toEqual(["shoulders"]);
    expect(equipSlotOptions(cloak, never, never).map((o) => o.slot)).toEqual(["other"]);
  });
  it("offers nothing for a potion or an unknown item", () => {
    expect(equipSlotOptions(item({ item_type: "potion" }), never, never)).toEqual([]);
    expect(equipSlotOptions(null, never, never)).toEqual([]);
  });
});
