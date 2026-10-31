// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useCartographerUiStore } from "./cartographer";

describe("the Cartographer grid preference (Map Table frame 18)", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("shows a faint grid by default", () => {
    const store = useCartographerUiStore();
    expect(store.gridShown).toBe(true);
    expect(store.gridAlpha).toBe(0.06);
  });

  it("a hidden grid survives a reload: a fresh store on the same device reads it back as hidden", async () => {
    useCartographerUiStore().gridShown = false;
    await nextTick();
    setActivePinia(createPinia());
    const reloaded = useCartographerUiStore();
    expect(reloaded.gridShown).toBe(false);
    expect(reloaded.gridAlpha).toBeNull();
  });

  it("a chosen strength survives a reload and sets the line's opacity", async () => {
    useCartographerUiStore().gridStrength = "bold";
    await nextTick();
    setActivePinia(createPinia());
    const reloaded = useCartographerUiStore();
    expect(reloaded.gridStrength).toBe("bold");
    expect(reloaded.gridAlpha).toBeGreaterThan(0.06);
  });
});
