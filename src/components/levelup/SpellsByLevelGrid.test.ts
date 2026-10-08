import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SpellsByLevelGrid from "./SpellsByLevelGrid.vue";

const options = [
  { id: "a", name: "Misty Step" },
  { id: "b", name: "Fireball" },
];

function mountGrid(modelValue: Record<string, string[]>, levelKind: "class" | "spell") {
  return mount(SpellsByLevelGrid, {
    props: { modelValue, allSpellOptions: options, levelKind },
  });
}

describe("SpellsByLevelGrid", () => {
  it("offers class levels 1-20 in class mode", () => {
    const w = mountGrid({}, "class");
    const opts = w.findAll("select option").filter(o => (o.element as HTMLOptionElement).value !== "");
    expect(opts).toHaveLength(20);
    expect(w.text()).toContain("Add class level");
  });

  it("offers spell levels 1-9 in spell mode", () => {
    const w = mountGrid({}, "spell");
    const opts = w.findAll("select option").filter(o => (o.element as HTMLOptionElement).value !== "");
    expect(opts).toHaveLength(9);
    expect(w.text()).toContain("Add spell level");
  });

  it("adds a level as an empty row", async () => {
    const w = mountGrid({ "3": ["a"] }, "spell");
    await w.find("select").setValue("5");
    await w.findAll("button").find(b => b.text().includes("Add spell level"))!.trigger("click");
    expect(w.emitted("update:modelValue")![0][0]).toEqual({ "3": ["a"], "5": [] });
  });

  it("removes a spell and drops the level when it empties", async () => {
    const w = mountGrid({ "3": ["a"], "5": ["a", "b"] }, "class");
    await w.find('button[aria-label="Remove Misty Step"]').trigger("click");
    expect(w.emitted("update:modelValue")![0][0]).toEqual({ "5": ["a", "b"] });
  });
});
