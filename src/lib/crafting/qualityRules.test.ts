import { describe, expect, it } from "vitest";
import { buildIngredientSlots } from "./ingredients";
import { degradeSentence, isFineResult, qualityNote, spentQualityModifier, spentRows } from "./qualityRules";
import type { PartyInventoryItem } from "@/types/inventory.types";

describe("qualityRules", () => {
  it("makes a Fine result only on a success beating the DC by the margin", () => {
    expect(isFineResult("success", 10)).toBe(true);
    expect(isFineResult("success", 9)).toBe(false);
    expect(isFineResult("fail", 12)).toBe(false);
    expect(isFineResult("ruin", 12)).toBe(false);
  });

  it("averages the spent rows toward the worse", () => {
    expect(spentQualityModifier([{ name: "Leather", quality: "poor", qty: 1 }, { name: "Ingot", quality: "fine", qty: 1 }])).toBe(-1);
    expect(spentQualityModifier([{ name: "Ingot", quality: "standard", qty: 2 }])).toBe(0);
    expect(spentQualityModifier([])).toBe(0);
  });

  it("weighs each spent row by its units, not once per row", () => {
    // One poor (-2) against three fine (+1): (-2 + 3) / 4 rounds down to 0. Counted per row it would be -1.
    expect(spentQualityModifier([{ name: "Leather", quality: "poor", qty: 1 }, { name: "Ingot", quality: "fine", qty: 3 }])).toBe(0);
  });

  it("names the non-standard materials, or nothing", () => {
    expect(qualityNote([{ name: "Leather", quality: "poor", qty: 1 }, { name: "Ingots", quality: "fine", qty: 1 }, { name: "Thread", quality: "standard", qty: 1 }])).toBe("Poor leather, fine ingots");
    expect(qualityNote([{ name: "Thread", quality: "standard", qty: 1 }])).toBeNull();
  });

  it("names a material once when two stacks of it share a quality", () => {
    expect(qualityNote([{ name: "Leather", quality: "poor", qty: 1 }, { name: "Leather", quality: "poor", qty: 2 }])).toBe("Poor leather");
  });

  it("reads the roll's rows from the consumption plan, skipping an id no slot holds", () => {
    const row = (id: string, name: string, quality: PartyInventoryItem["quality"], ref: string): PartyInventoryItem => ({
      id, campaign_id: "c", user_id: "u", item_id: null, library_item_id: ref, name, quantity: 3,
      carried_by: "m", location: "backpack", slot: null, is_container: false, container_id: null,
      is_attuned: false, is_equipped: false, notes: null, current_charges: null, updated_at: "",
      is_identified: true, quality, sort_order: 0, curse_revealed: false,
    });
    const need = (ref: string) => ({ item_id: null, library_item_id: ref, tags: null, quantity: 1 });
    const slots = buildIngredientSlots([need("hide"), need("ore")], [row("a", "Leather", "poor", "hide"), row("b", "Ingot", "fine", "ore")], []);
    expect(spentRows(slots, [{ id: "b", qty: 2 }, { id: "gone", qty: 1 }, { id: "a", qty: 1 }])).toEqual([
      { name: "Ingot", quality: "fine", qty: 2 },
      { name: "Leather", quality: "poor", qty: 1 },
    ]);
  });

  it("says what a failure did to the primary", () => {
    expect(degradeSentence("Iron Ingot", "standard")).toBe("Your Iron Ingot is now Poor.");
    expect(degradeSentence("Iron Ingot", "fine")).toBe("Your Iron Ingot is now Standard.");
    expect(degradeSentence("Iron Ingot", "poor")).toBe("Your Iron Ingot is ruined.");
  });
});
