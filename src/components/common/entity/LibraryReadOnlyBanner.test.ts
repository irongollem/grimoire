import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import LibraryReadOnlyBanner from "./LibraryReadOnlyBanner.vue";

const base = { message: "Read-only.", actionLabel: "Customize", busyLabel: "Copying…" };

describe("LibraryReadOnlyBanner", () => {
  it("shows the message and emits action on click", async () => {
    const wrapper = mount(LibraryReadOnlyBanner, { props: base });
    expect(wrapper.text()).toContain("Read-only.");
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("action")).toHaveLength(1);
  });

  it("swaps to the busy label and disables while busy", () => {
    const wrapper = mount(LibraryReadOnlyBanner, { props: { ...base, busy: true } });
    expect(wrapper.get("button").text()).toContain("Copying…");
    expect(wrapper.get("button").attributes("disabled")).toBeDefined();
  });

  it("disables without a busy label when disabled", () => {
    const wrapper = mount(LibraryReadOnlyBanner, { props: { ...base, disabled: true, disabledReason: "Pick a campaign first" } });
    expect(wrapper.get("button").text()).toContain("Customize");
    expect(wrapper.get("button").attributes("disabled")).toBeDefined();
  });
});
