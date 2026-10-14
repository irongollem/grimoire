import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RotationControl from "./RotationControl.vue";

function buttons(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll("button");
}

describe("RotationControl", () => {
  it("shows the current angle", () => {
    const wrapper = mount(RotationControl, { props: { modelValue: 45 } });
    expect(wrapper.get("[data-testid=rotation-readout]").text()).toBe("45°");
  });

  it("emits the angle each button reaches, wrapped to 0-359", async () => {
    const wrapper = mount(RotationControl, { props: { modelValue: 0 } });
    const [minusOne, left, right, plusOne] = buttons(wrapper);
    await minusOne.trigger("click");
    await left.trigger("click");
    await right.trigger("click");
    await plusOne.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[359], [270], [90], [1]]);
  });

  it("wraps past a full turn", async () => {
    const wrapper = mount(RotationControl, { props: { modelValue: 300 } });
    await buttons(wrapper)[2].trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[30]]);
  });
});
