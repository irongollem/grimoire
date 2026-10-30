import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h } from "vue";
import { IconClock } from "@/lib/icons";
import QuestFoldRow from "./QuestFoldRow.vue";

describe("QuestFoldRow", () => {
  it("shows the title and caption, and toggles the body open on click", async () => {
    const wrapper = mount(QuestFoldRow, {
      props: { title: "Session", caption: "Previous · Jump · End", open: false, "onUpdate:open": (v: boolean) => wrapper.setProps({ open: v }) },
      slots: { default: () => h("p", "Body content") },
      // isVisible() reads getComputedStyle, which jsdom only resolves correctly
      // for a node attached to the document — required to assert the drawer's
      // v-show state rather than just its style attribute.
      attachTo: document.body,
    });
    expect(wrapper.text()).toContain("Session");
    expect(wrapper.text()).toContain("Previous · Jump · End");
    expect(wrapper.get("[aria-expanded]").attributes("aria-expanded")).toBe("false");
    expect(wrapper.get("p").isVisible()).toBe(false);

    await wrapper.get("[aria-expanded]").trigger("click");
    expect(wrapper.get("[aria-expanded]").attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("p").isVisible()).toBe(true);
  });

  it("renders the icon slot only when an icon prop is given", () => {
    const withIcon = mount(QuestFoldRow, { props: { title: "Held payoff", open: false }, slots: { default: () => h("p") } });
    expect(withIcon.findComponent(IconClock as never).exists()).toBe(false);

    const wrapper = mount(QuestFoldRow, { props: { title: "Held payoff", icon: IconClock, open: false }, slots: { default: () => h("p") } });
    expect(wrapper.findComponent(IconClock as never).exists()).toBe(true);
  });

  it("a second click folds the body away again", async () => {
    const wrapper = mount(QuestFoldRow, {
      props: { title: "Session", open: false, "onUpdate:open": (v: boolean) => wrapper.setProps({ open: v }) },
      slots: { default: () => h("p", "Body content") },
      attachTo: document.body,
    });
    await wrapper.get("[aria-expanded]").trigger("click");
    await wrapper.get("[aria-expanded]").trigger("click");
    expect(wrapper.get("[aria-expanded]").attributes("aria-expanded")).toBe("false");
    expect(wrapper.emitted("update:open")).toEqual([[true], [false]]);
  });
});
