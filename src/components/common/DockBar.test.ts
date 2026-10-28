import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

const phone = vi.hoisted(() => ({ value: false }));
vi.mock("@/composables/useBreakpoint", () => ({ useIsMobile: () => phone }));
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

  it("sits at the very bottom on a phone, and above the bar nav where that nav is on screen otherwise", () => {
    phone.value = true;
    const onPhone = mount(DockBar, { slots: { default: "x" } }).get("div").classes();
    expect(onPhone).toContain("bottom-0");
    expect(onPhone.some((c) => c.startsWith("barnav:"))).toBe(false);

    phone.value = false;
    const elsewhere = mount(DockBar, { slots: { default: "x" } }).get("div").classes();
    expect(elsewhere).not.toContain("bottom-0");
    expect(elsewhere.some((c) => c.startsWith("barnav:bottom-"))).toBe(true);
  });
});
