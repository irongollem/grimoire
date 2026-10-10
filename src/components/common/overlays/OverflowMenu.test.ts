import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import OverflowMenu from "./OverflowMenu.vue";

const items = [
  { key: "clone", label: "Make a copy" },
  { key: "delete", label: "Delete", danger: true },
] as const;

describe("OverflowMenu", () => {
  it("opens on tap and emits the chosen key, then closes", async () => {
    const wrapper = mount(OverflowMenu, {
      props: { label: "More actions for Chicory", items },
      attachTo: document.body,
    });
    expect(document.body.textContent).not.toContain("Make a copy");
    await wrapper.get("button[aria-label='More actions for Chicory']").trigger("click");
    const entry = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("Delete"));
    expect(entry).toBeTruthy();
    entry?.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("select")).toEqual([["delete"]]);
    expect(document.body.textContent).not.toContain("Make a copy");
    wrapper.unmount();
  });
});
