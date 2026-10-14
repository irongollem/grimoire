import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { sourceLabel } from "@/lib/library/sourceLabel";
import LibraryReadOnlyBanner from "./LibraryReadOnlyBanner.vue";

vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({
    labelFor: (source: string | null | undefined, title?: string | null) =>
      sourceLabel(source, title, new Map([["grimoire-dungeon-craft", "Grimoire Dungeon Craft"]])),
  }),
}));

const base = {
  source: "grimoire-dungeon-craft",
  message: "Customize it to make your own editable copy.",
  actionLabel: "Customize",
  busyLabel: "Copying…",
};

describe("LibraryReadOnlyBanner", () => {
  it("names the book, says how to copy it, and emits action on click", async () => {
    const wrapper = mount(LibraryReadOnlyBanner, { props: base });
    expect(wrapper.text()).toContain("From Grimoire Dungeon Craft, read only.");
    expect(wrapper.text()).toContain("Customize it to make your own editable copy.");
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("action")).toHaveLength(1);
  });

  it("says read only without a book when the row names none", () => {
    const wrapper = mount(LibraryReadOnlyBanner, { props: { ...base, source: null } });
    expect(wrapper.text()).toContain("Read only.");
    expect(wrapper.text()).not.toContain("From");
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
