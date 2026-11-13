// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ColourSwatch from "./ColourSwatch.vue";

const colour = { r: 255, g: 0, b: 0 };

describe("ColourSwatch", () => {
  // Fails on: the swatch losing its colour or its pick, so the colour in a panel cannot be chosen.
  it("shows its colour, names itself, and picks that colour on click", async () => {
    const w = mount(ColourSwatch, { props: { colour, label: "Red", title: "Red #ff0000" } });
    const button = w.get("button");
    expect(button.attributes("style")).toContain("background-color");
    expect(button.attributes("aria-label")).toBe("Red");
    await button.trigger("click");
    expect(w.emitted("pick")?.[0]).toEqual([colour]);
  });

  // Fails on: the colour in use not being ringed, or the large swatch not being larger.
  it("rings the selected swatch and sizes the large one up", () => {
    const small = mount(ColourSwatch, { props: { colour, label: "Red" } }).get("button");
    const chosen = mount(ColourSwatch, { props: { colour, label: "Red", selected: true, large: true } }).get("button");
    expect(small.classes()).not.toContain("ring-2");
    expect(chosen.classes()).toContain("ring-2");
    expect(chosen.classes()).toContain("h-8");
    expect(small.classes()).toContain("h-6");
  });
});
