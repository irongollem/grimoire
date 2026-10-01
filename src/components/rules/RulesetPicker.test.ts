import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RulesetPicker from "./RulesetPicker.vue";

describe("RulesetPicker", () => {
  it("offers both editions as a radio group and marks the chosen one", () => {
    const wrapper = mount(RulesetPicker, { props: { modelValue: "2024" } });
    const options = wrapper.findAll('[role="radio"]');
    expect(options.map((option) => option.attributes("aria-checked"))).toEqual(["false", "true"]);
    expect(wrapper.find('[role="radiogroup"]').attributes("aria-label")).toBe("Rules edition");
  });

  it("has nothing chosen for a new character, and is still reachable by keyboard", () => {
    const wrapper = mount(RulesetPicker, { props: { modelValue: null } });
    const options = wrapper.findAll('[role="radio"]');
    expect(options.map((option) => option.attributes("aria-checked"))).toEqual(["false", "false"]);
    expect(options.map((option) => option.attributes("tabindex"))).toEqual(["0", "-1"]);
  });

  it("emits the edition that was picked", async () => {
    const wrapper = mount(RulesetPicker, { props: { modelValue: null } });
    await wrapper.findAll('[role="radio"]')[1].trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([["2024"]]);
  });

  it("moves the choice with the arrow keys, wrapping at the ends", async () => {
    const wrapper = mount(RulesetPicker, { props: { modelValue: "2024" } });
    await wrapper.find('[role="radiogroup"]').trigger("keydown", { key: "ArrowRight" });
    await wrapper.find('[role="radiogroup"]').trigger("keydown", { key: "ArrowLeft" });
    expect(wrapper.emitted("update:modelValue")).toEqual([["2014"], ["2014"]]);
  });

  it("shows a note under the edition it belongs to", () => {
    const wrapper = mount(RulesetPicker, {
      props: { modelValue: "2014", notes: { "2014": "Your table plays this." } },
    });
    const options = wrapper.findAll('[role="radio"]');
    expect(options[0].text()).toContain("Your table plays this.");
    expect(options[1].text()).not.toContain("Your table plays this.");
  });

  it("picks nothing while disabled", async () => {
    const wrapper = mount(RulesetPicker, { props: { modelValue: "2014", disabled: true } });
    await wrapper.findAll('[role="radio"]')[1].trigger("click");
    await wrapper.find('[role="radiogroup"]').trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});
