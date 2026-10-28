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

  it("draws no level rows for an empty grid, and rows in ascending level order otherwise", () => {
    expect(mountGrid({}, "class").findAllComponents({ name: "EntityCombobox" })).toHaveLength(0);
    const w = mountGrid({ "10": [], "2": [], "5": [] }, "class");
    expect(w.findAll("span.text-primary").map((s) => s.text())).toEqual(["2", "5", "10"]);
  });

  it("adds a picked spell to its level, keeping the others", () => {
    const w = mountGrid({ "3": ["a"] }, "class");
    w.findComponent({ name: "EntityCombobox" }).vm.$emit("update:model-value", "b");
    expect(w.emitted("update:modelValue")![0][0]).toEqual({ "3": ["a", "b"] });
  });

  it("ignores a cleared pick and a spell the level already has", () => {
    const w = mountGrid({ "3": ["a"] }, "class");
    const combo = w.findComponent({ name: "EntityCombobox" });
    combo.vm.$emit("update:model-value", "");
    combo.vm.$emit("update:model-value", "a");
    expect(w.emitted("update:modelValue")).toBeUndefined();
  });

  it("offers a level only the spells it does not already hold", () => {
    const w = mountGrid({ "3": ["a"] }, "class");
    expect((w.findComponent({ name: "EntityCombobox" }).props("options") as { id: string }[]).map((o) => o.id)).toEqual(["b"]);
  });

  it("will not add a level that already has a row, nor with none chosen", async () => {
    const w = mountGrid({ "3": ["a"] }, "class");
    const add = () => w.findAll("button").find((b) => b.text().includes("Add class level"))!;
    expect(add().attributes("disabled")).toBeDefined();
    await w.find("select").setValue("3");
    expect(add().attributes("disabled")).toBeDefined();
    await w.find("select").setValue("4");
    expect(add().attributes("disabled")).toBeUndefined();
  });
});
