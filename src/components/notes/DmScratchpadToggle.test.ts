import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/auth";
import { useScratchpadStore } from "@/stores/scratchpad";
import DmScratchpadToggle from "./DmScratchpadToggle.vue";

function setup(dm: boolean) {
  setActivePinia(createPinia());
  Object.defineProperty(useAuthStore(), "isDM", { value: dm });
  return useScratchpadStore();
}

describe("DmScratchpadToggle", () => {
  it("toggles the scratchpad for a DM", async () => {
    const store = setup(true);
    const w = mount(DmScratchpadToggle);
    await w.find("[data-test=scratchpad-toggle]").trigger("click");
    expect(store.open).toBe(true);
  });

  it("is absent for anyone but the DM", () => {
    setup(false);
    expect(mount(DmScratchpadToggle).find("[data-test=scratchpad-toggle]").exists()).toBe(false);
  });

  it("hands the panel its own rect to fly out of", async () => {
    const store = setup(true);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 10, left: 20, width: 30, height: 40 } as DOMRect);
    const w = mount(DmScratchpadToggle);
    await w.find("[data-test=scratchpad-toggle]").trigger("click");
    expect(store.launchRect).toEqual({ top: 10, left: 20, width: 30, height: 40 });
    vi.restoreAllMocks();
  });
});
