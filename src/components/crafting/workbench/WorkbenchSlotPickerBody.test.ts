import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import WorkbenchSlotPickerBody from "./WorkbenchSlotPickerBody.vue";
import type { IngredientSlot, SlotCandidate } from "@/lib/crafting/ingredients";
import type { ItemQuality } from "@/types/inventory.types";

function cand(id: string, quality: ItemQuality, reason: SlotCandidate["reason"] = null): SlotCandidate {
  return { inv: { id, name: "Leather", quantity: 2, quality, carried_by: "m" } as SlotCandidate["inv"], item: null, reason };
}

const slot: IngredientSlot = {
  index: 0,
  requirement: { item_id: "i", library_item_id: null, tags: null, quantity: 2 },
  ref: "i",
  tags: null,
  name: "Leather",
  needed: 2,
  available: 4,
  met: true,
  candidates: [cand("a", "poor"), cand("b", "standard"), cand("c", "fine"), cand("d", "ruined", "ruined")],
};

describe("WorkbenchSlotPickerBody", () => {
  it("marks each row with its quality, in the order the plan will use, and leaves standard bare", () => {
    const w = mount(WorkbenchSlotPickerBody, {
      props: { slot, total: 1, chosenId: undefined, memberId: "m", memberName: "Brann", titleId: "t" },
    });
    const labels = w.findAll("label");
    expect(labels).toHaveLength(3);
    expect(labels[0].find("[data-quality=poor]").exists()).toBe(true);
    expect(labels[1].find("[data-quality]").exists()).toBe(false);
    expect(labels[2].find("[data-quality=fine]").exists()).toBe(true);
    expect(w.find("li [data-quality=ruined]").exists()).toBe(true);
  });
});
