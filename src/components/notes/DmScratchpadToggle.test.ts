import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
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
});
