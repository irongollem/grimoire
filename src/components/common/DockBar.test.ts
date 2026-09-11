import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DockBar from "./DockBar.vue";

describe("DockBar", () => {
  it("renders its slot and hides from xl by default", () => {
    const wrapper = mount(DockBar, { slots: { default: "<button>Next</button>" } });
    expect(wrapper.text()).toContain("Next");
    expect(wrapper.get("div").classes()).toContain("xl:hidden");
    expect(wrapper.get("div").classes()).toContain("sticky");
  });

  it("hides from the breakpoint the caller names", () => {
    const wrapper = mount(DockBar, { props: { hideFrom: "lg" }, slots: { default: "x" } });
    expect(wrapper.get("div").classes()).toContain("lg:hidden");
    expect(wrapper.get("div").classes()).not.toContain("xl:hidden");
  });
});
