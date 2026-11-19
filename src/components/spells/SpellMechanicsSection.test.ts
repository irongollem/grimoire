import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SpellMechanicsSection from "./SpellMechanicsSection.vue";

const props = {
  attackType: "save", saveAttribute: "WIS", saveEffect: "negates", damageRolls: [], healingDice: "", targetDescription: "",
  aoeShape: "", aoeSize: "", conditionEffect: null, school: "enchantment" as const, concentration: true,
  description: "Text.", higherLevels: "",
};

describe("SpellMechanicsSection", () => {
  // Bug caught: the retired free-text "Condition Inflicted" box surviving beside the form a fight actually reads.
  it("has no free-text condition box, and hands the condition form the spell's own save, concentration and text", () => {
    const wrapper = mount(SpellMechanicsSection, { props, global: { stubs: { DamageRollsInput: true, SpellConditionEffectFields: true } } });
    expect(wrapper.text()).not.toContain("Condition Inflicted");
    expect(wrapper.find('input[placeholder*="blinded"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: "SpellConditionEffectFields" }).props()).toMatchObject({
      saveAbility: "WIS", concentration: true, description: "Text.", higherLevels: "",
    });
  });

  // Bug caught: a save ability kept from a spell that no longer uses a saving throw, so the entry still names it.
  it("passes no save ability when the spell is not a saving-throw spell", () => {
    const wrapper = mount(SpellMechanicsSection, { props: { ...props, attackType: "ranged_spell" }, global: { stubs: { DamageRollsInput: true, SpellConditionEffectFields: true } } });
    expect(wrapper.findComponent({ name: "SpellConditionEffectFields" }).props("saveAbility")).toBe("");
  });
});
