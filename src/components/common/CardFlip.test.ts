import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CardFlip from "./CardFlip.vue";

const slots = { front: "<p>front face</p>", back: "<p>back face</p>" };

describe("CardFlip", () => {
  it("shows the front when not flipped", () => {
    const w = mount(CardFlip, { props: { flipped: false }, slots });
    expect(w.text()).toContain("front face");
    expect(w.text()).not.toContain("back face");
  });

  it("shows the back when flipped", () => {
    const w = mount(CardFlip, { props: { flipped: true }, slots });
    expect(w.text()).toContain("back face");
    expect(w.text()).not.toContain("front face");
  });
});
