import { afterEach, describe, expect, it } from "vitest";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import CartographerMotionButton from "./CartographerMotionButton.vue";

enableAutoUnmount(afterEach);
const button = (props: { available: boolean; playing: boolean; reduced?: boolean }) => mount(CartographerMotionButton, { props });

describe("the Motion button", () => {
  it("is absent when the drawing has nothing that moves", () => {
    expect(button({ available: false, playing: true }).find("button").exists()).toBe(false);
  });

  it("says whether motion is playing, and asks to toggle on click", async () => {
    const w = button({ available: true, playing: true });
    expect(w.find("button").attributes("aria-pressed")).toBe("true");
    await w.find("button").trigger("click");
    expect(w.emitted("toggle")).toHaveLength(1);
    expect(button({ available: true, playing: false }).find("button").attributes("aria-pressed")).toBe("false");
  });

  it("cannot be clicked into playing while the device asks for reduced motion", async () => {
    const w = button({ available: true, playing: false, reduced: true });
    await w.find("button").trigger("click");
    expect(w.emitted("toggle")).toBeUndefined();
  });
});
