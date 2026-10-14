import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import LibraryBadge from "./LibraryBadge.vue";

describe("LibraryBadge", () => {
  it("defaults to the word Library", () => {
    expect(mount(LibraryBadge).text()).toBe("Library");
  });

  it("shows a custom label and title", () => {
    const wrapper = mount(LibraryBadge, { props: { label: "Kobold Press", title: "Kobold Press" } });
    expect(wrapper.text()).toBe("Kobold Press");
    expect(wrapper.attributes("title")).toBe("Kobold Press");
  });

  it("uses the card surface in the overlay tone", () => {
    const wrapper = mount(LibraryBadge, { props: { tone: "overlay" } });
    expect(wrapper.classes()).toContain("bg-card/90");
  });
});
