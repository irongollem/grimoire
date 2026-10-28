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
  const mountBody = (over: Record<string, unknown> = {}, s: IngredientSlot = slot) =>
    mount(WorkbenchSlotPickerBody, { props: { slot: s, total: 1, chosenId: undefined, memberId: "m", memberName: "Brann", titleId: "t", ...over } });

  it("starts on the stack the plan would use first, and on the player's own choice once made", () => {
    const radios = (w: ReturnType<typeof mountBody>) => w.findAll("input[type=radio]").map((r) => (r.element as HTMLInputElement).checked);
    expect(radios(mountBody())).toEqual([true, false, false]);
    expect(radios(mountBody({ chosenId: "c" }))).toEqual([false, false, true]);
  });

  it("hands on the stack the player picked", async () => {
    const w = mountBody();
    await w.findAll("input[type=radio]")[2].setValue(true);
    expect(w.emitted("choose")).toEqual([["c"]]);
  });

  it("lists ruined and equipped stacks apart, with the reason they are never used, and says when none can be used", () => {
    const w = mountBody();
    expect(w.text()).toContain("Matching, but never used");
    expect(w.text()).toContain("ruined");
    const none = mountBody({}, { ...slot, candidates: [cand("e", "standard", "equipped")] });
    expect(none.text()).toContain("You have none.");
    expect(none.text()).toContain("equipped");
    expect(none.findAll("input[type=radio]")).toHaveLength(0);
  });

  it("says whose pack a stack is in", () => {
    const stash = { ...slot, candidates: [{ ...cand("a", "standard"), inv: { ...cand("a", "standard").inv, carried_by: "other" } }] };
    expect(mountBody({}, stash).text()).toContain("Party stash");
    expect(mountBody().text()).toContain("Carried by Brann");
  });
});
