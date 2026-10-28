import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SubclassSpellcastingFields from "./SubclassSpellcastingFields.vue";
import { thirdCasterPreset } from "@/levelup/subclassSpellcasting";

describe("SubclassSpellcastingFields", () => {
  it("offers the third-caster preset when there is none", async () => {
    const w = mount(SubclassSpellcastingFields, { props: { modelValue: null } });
    expect(w.text()).toContain("Only for a class that has no spellcasting");
    await w.findAll("button").find(b => b.text() === "Add spellcasting")?.trigger("click");
    expect(w.emitted("update:modelValue")?.[0]).toEqual([thirdCasterPreset()]);
  });

  it("removes the casting", async () => {
    const w = mount(SubclassSpellcastingFields, { props: { modelValue: thirdCasterPreset() } });
    await w.findAll("button").find(b => b.text() === "Remove spellcasting")?.trigger("click");
    expect(w.emitted("update:modelValue")?.[0]).toEqual([null]);
  });

  it("edits one slot without touching the rest", async () => {
    const w = mount(SubclassSpellcastingFields, { props: { modelValue: thirdCasterPreset() } });
    const first = w.findAll("tbody tr")[2].findAll("input")[0];
    await first.setValue("3");
    const next = w.emitted("update:modelValue")?.[0][0] as ReturnType<typeof thirdCasterPreset>;
    expect(next.spell_slots[2]).toEqual([3, 0, 0, 0]);
    expect(next.spell_slots[6]).toEqual([4, 2, 0, 0]);
    expect(next.spell_slots).toHaveLength(20);
  });

  it("warns only when the base class casts", () => {
    const casting = mount(SubclassSpellcastingFields, {
      props: { modelValue: thirdCasterPreset(), baseClassCasts: true, baseClass: "Cleric" },
    });
    expect(casting.text()).toContain("Cleric already casts");
    const plain = mount(SubclassSpellcastingFields, { props: { modelValue: thirdCasterPreset(), baseClass: "Fighter" } });
    expect(plain.text()).not.toContain("already casts");
  });

  it.each([
    ["", 0], // a cleared box reads as 0
    ["-2", 0], // never negative
    ["2.7", 2], // whole slots only
  ])("reads %j typed into a slot as %i", async (typed, stored) => {
    const w = mount(SubclassSpellcastingFields, { props: { modelValue: thirdCasterPreset() } });
    await w.findAll("tbody tr")[6].findAll("input")[0].setValue(typed);
    const next = w.emitted("update:modelValue")?.[0][0] as ReturnType<typeof thirdCasterPreset>;
    expect(next.spell_slots[6][0]).toBe(stored);
  });
});
