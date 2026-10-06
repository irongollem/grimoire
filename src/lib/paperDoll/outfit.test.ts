import { describe, expect, it } from "vitest";
import type { Item } from "@/types/item.types";
import type { InventorySlot } from "@/types/inventory.types";
import type { WornGear } from "@/rules/armorClass";
import { dollOutfitFor } from "./outfit";

function worn(slot: InventorySlot, name: string, armor_class: string | null = null): WornGear {
  return { slot, attuned: false, item: { id: name, name, armor_class, conceptual_key: null } as Item };
}

describe("dollOutfitFor", () => {
  it("shows underclothes when nothing is worn", () => {
    expect(dollOutfitFor([])).toBe("underclothes");
  });
  it("maps armour by how it takes Dex", () => {
    expect(dollOutfitFor([worn("body", "Leather Armor", "11 + Dex modifier")])).toBe("armour_light");
    expect(dollOutfitFor([worn("body", "Half Plate Armor", "15 + Dex modifier (max 2)")])).toBe("armour_medium");
    expect(dollOutfitFor([worn("body", "Plate Armor", "18")])).toBe("armour_heavy");
  });
  it("prefers armour over clothes", () => {
    expect(dollOutfitFor([worn("clothes", "Robes"), worn("body", "Plate Armor", "18")])).toBe("armour_heavy");
  });
  it("tells robes from other clothes", () => {
    expect(dollOutfitFor([worn("clothes", "Traveler's Robes")])).toBe("robes");
    expect(dollOutfitFor([worn("clothes", "Vestments of Faith")])).toBe("robes");
    expect(dollOutfitFor([worn("clothes", "Fine Clothes")])).toBe("clothes");
  });
  it("ignores a body item that is not armour", () => {
    expect(dollOutfitFor([worn("body", "Amulet Case")])).toBe("underclothes");
  });
});
