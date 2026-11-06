import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import GameSystemPicker from "./GameSystemPicker.vue";

describe("GameSystemPicker", () => {
  it("offers every game system, with none chosen for a new campaign", () => {
    const wrapper = mount(GameSystemPicker, { props: { modelValue: null } });
    const options = wrapper.findAll('[role="radio"]');
    expect(options.map((o) => o.attributes("aria-checked"))).toEqual(["false", "false", "false"]);
    expect(wrapper.find('[role="radiogroup"]').attributes("aria-label")).toBe("Game system");
  });

  // Fails if `only` is ignored: the Rules tab would offer a 5e campaign a switch to Generic.
  it("offers only the systems it is given", () => {
    const wrapper = mount(GameSystemPicker, { props: { modelValue: "dnd5e-2014", only: ["dnd5e-2014", "dnd5e-2024"] } });
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(2);
    expect(wrapper.text()).not.toContain("Generic");
  });

  it("emits the system that was picked, as its key", async () => {
    const wrapper = mount(GameSystemPicker, { props: { modelValue: null } });
    await wrapper.findAll('[role="radio"]')[2].trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([["generic"]]);
  });
});
