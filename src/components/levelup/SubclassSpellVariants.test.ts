import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SubclassSpellVariants from "./SubclassSpellVariants.vue";

const options = [{ id: "a", name: "Misty Step" }];

function mountVariants(
  variants: Record<string, Record<string, string[]>>,
  label: string | null = null,
  expandedVariants: Record<string, Record<string, string[]>> = {},
) {
  return mount(SubclassSpellVariants, {
    props: { variants, expandedVariants, label, allSpellOptions: options },
  });
}

function last(w: ReturnType<typeof mountVariants>, event: string) {
  const all = w.emitted(event)!;
  return all[all.length - 1][0];
}

describe("SubclassSpellVariants", () => {
  it("adds an option with an empty grid", async () => {
    const w = mountVariants({ Arctic: { "3": ["a"] } });
    await w.find('input[aria-label="New option name"]').setValue("Coast");
    await w.findAll("button").find(b => b.text().includes("Add option"))!.trigger("click");
    expect(last(w, "update:variants")).toEqual({ Arctic: { "3": ["a"] }, Coast: {} });
  });

  it("renames an option in place, keeping order and spells", async () => {
    const w = mountVariants({ Arctic: { "3": ["a"] }, Coast: {} });
    const input = w.find('input[aria-label="Option name"]');
    await input.setValue("Tundra");
    await input.trigger("change");
    const out = last(w, "update:variants") as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["Tundra", "Coast"]);
    expect(out.Tundra).toEqual({ "3": ["a"] });
  });

  it("refuses a rename onto an existing option", async () => {
    const w = mountVariants({ Arctic: {}, Coast: {} });
    const input = w.find('input[aria-label="Option name"]');
    await input.setValue("Coast");
    await input.trigger("change");
    expect(w.emitted("update:variants")).toBeUndefined();
  });

  it("removes an option", async () => {
    const w = mountVariants({ Arctic: {}, Coast: {} });
    await w.find('button[aria-label="Remove Arctic"]').trigger("click");
    expect(last(w, "update:variants")).toEqual({ Coast: {} });
  });

  it("emits the label, and null when cleared", async () => {
    const w = mountVariants({}, "Terrain");
    const input = w.find("#spell-variant-label");
    await input.setValue("Land type");
    await input.trigger("change");
    expect(last(w, "update:label")).toBe("Land type");
    await input.setValue("  ");
    await input.trigger("change");
    expect(last(w, "update:label")).toBeNull();
  });

  it("renames an option in both maps", async () => {
    const w = mountVariants({ Arctic: { "3": ["a"] } }, "T", { Arctic: { "1": ["a"] } });
    const input = w.find('input[aria-label="Option name"]');
    await input.setValue("Tundra");
    await input.trigger("change");
    expect(last(w, "update:variants")).toEqual({ Tundra: { "3": ["a"] } });
    expect(last(w, "update:expandedVariants")).toEqual({ Tundra: { "1": ["a"] } });
  });

  it("removes an option from both maps, and lists expanded-only options", async () => {
    const w = mountVariants({ Arctic: {} }, "T", { Arctic: { "1": ["a"] }, Water: { "2": ["a"] } });
    expect(w.findAll('input[aria-label="Option name"]')).toHaveLength(2);
    await w.find('button[aria-label="Remove Arctic"]').trigger("click");
    expect(last(w, "update:variants")).toEqual({});
    expect(last(w, "update:expandedVariants")).toEqual({ Water: { "2": ["a"] } });
  });
});
