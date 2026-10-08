// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { CustomSubclass } from "@/levelup/customTypes";

vi.mock("@/composables/spells/useSpellIndex", () => ({
  useSpellIndex: () => ({ data: { value: [{ id: "bless", name: "Bless" }, { id: "fog", name: "Fog Cloud" }] } }),
}));

import LevelUpSubclassSpells from "@/levelup/LevelUpSubclassSpells.vue";

const circle = {
  subclass_name: "Circle of the Land",
  granted_spells: { "3": ["bless"] },
  spell_variants: { Forest: { "3": ["fog"] }, Arctic: {} },
  spell_variant_label: "Land type",
  expanded_spells: {},
  expanded_spell_variants: {},
} as unknown as CustomSubclass;

describe("LevelUpSubclassSpells", () => {
  it("asks for the option under its label and names what is gained once chosen", async () => {
    const wrapper = mount(LevelUpSubclassSpells, {
      props: { subclass: circle, classLevel: 3, variant: "", ask: true },
    });
    expect(wrapper.text()).toContain("Land type");
    await wrapper.find("select").setValue("Forest");
    expect(wrapper.emitted("update:variant")?.[0]).toEqual(["Forest"]);
    await wrapper.setProps({ variant: "Forest" });
    expect(wrapper.get("[data-testid='subclass-granted-spells']").text()).toContain("Bless, Fog Cloud");
  });

  it("renders nothing when there is neither a question nor a grant", () => {
    const wrapper = mount(LevelUpSubclassSpells, {
      props: { subclass: circle, classLevel: 4, variant: "", ask: false },
    });
    expect(wrapper.html()).toBe("<!--v-if-->");
  });
});
