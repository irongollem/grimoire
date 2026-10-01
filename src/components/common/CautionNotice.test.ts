import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CautionNotice from "./CautionNotice.vue";

describe("CautionNotice", () => {
  it("renders its slot in a status box with the caution recipe", () => {
    const wrapper = mount(CautionNotice, { slots: { default: "Careful" } });
    expect(wrapper.text()).toBe("Careful");
    expect(wrapper.attributes("role")).toBe("status");
    expect(wrapper.classes()).toEqual(expect.arrayContaining(["border-tone-caution/40", "bg-tone-caution/10", "text-ink-caution"]));
  });

  it("lets a caller's class add layout and replace a default", () => {
    const wrapper = mount(CautionNotice, {
      attrs: { class: "flex gap-2 text-foreground", "data-testid": "x" },
      slots: { default: "Careful" },
    });
    expect(wrapper.classes()).toEqual(expect.arrayContaining(["flex", "gap-2", "text-foreground"]));
    expect(wrapper.classes()).not.toContain("text-ink-caution");
    expect(wrapper.attributes("data-testid")).toBe("x");
  });
});
