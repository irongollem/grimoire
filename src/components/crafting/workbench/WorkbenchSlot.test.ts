import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import WorkbenchSlot from "./WorkbenchSlot.vue";
import type { IngredientSlot } from "@/lib/crafting/ingredients";
import { benchArtFor } from "@/lib/crafting/workbench/art";
import type { SlotState } from "@/lib/crafting/workbench/slotMaterial";

function slot(over: Partial<IngredientSlot> = {}): IngredientSlot {
  return {
    index: 0,
    requirement: { item_id: "i1", library_item_id: null, tags: null, quantity: 2 },
    ref: "i1",
    tags: null,
    name: "Iron Ingot",
    needed: 2,
    available: 5,
    met: true,
    candidates: [],
    ...over,
  };
}

function mountSlot(state: SlotState, s = slot(), variant: "bench" | "row" = "bench") {
  return mount(WorkbenchSlot, {
    props: { slot: s, total: 4, variant, state, art: benchArtFor("smithing"), material: { sprite: "mat-ingot-iron", filter: null }, used: null },
  });
}

describe("WorkbenchSlot", () => {
  it("names the ingredient, its place, its state and its counts", () => {
    const w = mountSlot("ready", slot({ tags: ["metal", "iron", "ingot"], ref: null, name: 'Any [metal + iron + ingot]' }));
    expect(w.get("button").attributes("aria-label")).toBe(
      "Ingredient 1 of 4, primary: Any [metal + iron + ingot]. Ready. Need 2, have 5, any metal, iron, ingot.",
    );
  });

  it.each([
    ["ready", "Ready"],
    ["missing", "Missing"],
    ["short", "Short"],
    ["spent", "Spent"],
    ["ruined", "Ruined"],
  ] as const)("says %s in words", (state, word) => {
    expect(mountSlot(state).text()).toContain(word);
  });

  it("marks only the first slot as primary", () => {
    expect(mountSlot("ready").text()).toContain("Primary");
    expect(mountSlot("ready", slot({ index: 1 })).text()).not.toContain("Primary");
  });

  it("shows what was used once spent, not what is held", () => {
    const w = mountSlot("spent");
    expect(w.text()).toContain("Used 2");
    expect(w.text()).not.toContain("have");
  });

  it("emits open with its button", async () => {
    const w = mountSlot("ready", slot(), "row");
    await w.get("button").trigger("click");
    expect(w.emitted("open")?.[0]?.[0]).toBeInstanceOf(HTMLButtonElement);
  });

  it("shows the quality of the row that will be used, and nothing for standard", () => {
    const inv = (quality: string) => ({ inv: { id: "r", name: "Leather", quantity: 2, quality }, item: null, reason: null });
    const mountUsed = (quality: string) =>
      mount(WorkbenchSlot, {
        props: { slot: slot(), total: 1, variant: "row", state: "ready", art: benchArtFor("smithing"), material: { sprite: "mat-ingot-iron", filter: null }, used: inv(quality) as never },
      });
    expect(mountUsed("poor").find("[data-quality=poor]").exists()).toBe(true);
    expect(mountUsed("standard").find("[data-quality]").exists()).toBe(false);
  });
});
