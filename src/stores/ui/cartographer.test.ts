// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useCartographerUiStore } from "./cartographer";

function reducedMotion(on: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: on && query.includes("reduce"), media: query,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
  }));
}

describe("the Cartographer motion preference", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("plays by default and remembers a pause on this device", async () => {
    reducedMotion(false);
    const store = useCartographerUiStore();
    expect(store.motionRunning).toBe(true);
    store.motionPlaying = false;
    expect(store.motionRunning).toBe(false);
    await nextTick();
    expect(localStorage.getItem("grimoire:cartographer-motion-playing")).toBe("false");
  });

  it("keeps still under reduced motion even when the stored choice is playing", () => {
    reducedMotion(true);
    const store = useCartographerUiStore();
    expect(store.motionPlaying).toBe(true);
    expect(store.motionRunning).toBe(false);
  });
});
