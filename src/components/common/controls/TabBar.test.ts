// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TabBar from "./TabBar.vue";

const tabs = ["a", "b", "c"].map((id) => ({ id, label: id.toUpperCase() }));

function sized(scrollWidth: number, clientWidth: number) {
  const w = mount(TabBar, { props: { tabs, modelValue: "a" }, attachTo: document.body });
  const el = w.get("[role=\"tablist\"]").element as HTMLElement;
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: clientWidth });
  return { w, el };
}

describe("TabBar", () => {
  // Bug caught: a tab row wider than a small laptop cut off by Vellum's visible overflow, its last tabs unreachable
  // (the admin page, 23 Nov 2026). The class is what lets the theme scroll it instead.
  it("marks a row whose tabs are wider than it as overflowing, and a row that fits as not", async () => {
    const wide = sized(900, 400);
    await wide.el.dispatchEvent(new Event("scroll"));
    await flushPromises();
    expect(wide.el.classList.contains("tab-bar--overflowing")).toBe(true);
    wide.w.unmount();

    const fits = sized(400, 400);
    await fits.el.dispatchEvent(new Event("scroll"));
    await flushPromises();
    expect(fits.el.classList.contains("tab-bar--overflowing")).toBe(false);
    fits.w.unmount();
  });

  // Bug caught: a mouse with no sideways scroll unable to move an overflowing row.
  it("turns a vertical wheel into a sideways scroll on an overflowing row", async () => {
    const { w, el } = sized(900, 400);
    el.dispatchEvent(new Event("scroll"));
    await flushPromises();
    el.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, cancelable: true }));
    expect(el.scrollLeft).toBe(120);
    w.unmount();
  });
});
