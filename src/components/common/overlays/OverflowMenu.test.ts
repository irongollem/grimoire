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

  it("does not emit for an entry that is disabled", async () => {
    const wrapper = mount(OverflowMenu, {
      props: { label: "More", items: [{ key: "clone", label: "Make a copy", disabled: true, reason: "Read-only" }] },
      attachTo: document.body,
    });
    await wrapper.get("button[aria-label='More']").trigger("click");
    const entry = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("Make a copy"))!;
    expect(entry.hasAttribute("disabled")).toBe(true);
    entry.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("select")).toBeUndefined();
    wrapper.unmount();
  });

  it("a disabled menu cannot be opened, and the trigger toggles it closed again", async () => {
    const locked = mount(OverflowMenu, { props: { label: "More", items, disabled: true }, attachTo: document.body });
    await locked.get("button[aria-label='More']").trigger("click");
    expect(document.body.textContent).not.toContain("Make a copy");
    locked.unmount();

    const wrapper = mount(OverflowMenu, { props: { label: "More", items }, attachTo: document.body });
    const trigger = wrapper.get("button[aria-label='More']");
    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("true");
    await trigger.trigger("click");
    expect(document.body.textContent).not.toContain("Make a copy");
    wrapper.unmount();
  });
});
