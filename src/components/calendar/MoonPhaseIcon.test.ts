import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MoonPhaseIcon from "./MoonPhaseIcon.vue";

const litD = (age: number) =>
  mount(MoonPhaseIcon, { props: { age } }).get("[data-lit]").attributes("d");

describe("MoonPhaseIcon", () => {
  it("is decorative without a label", () => {
    const w = mount(MoonPhaseIcon, { props: { age: 0.2 } });
    expect(w.attributes("aria-hidden")).toBe("true");
    expect(w.attributes("role")).toBeUndefined();
  });

  it("names itself as an image when given a label", () => {
    const w = mount(MoonPhaseIcon, { props: { age: 0.5, label: "Full moon" } });
    expect(w.attributes("role")).toBe("img");
    expect(w.find("title").text()).toBe("Full moon");
  });

  it("draws a full disc at 0.5: limb down the left, terminator back up the right", () => {
    expect(litD(0.5)).toBe("M 10 1 A 9 9 0 0 0 10 19 A 9.000 9 0 0 0 10 1 Z");
  });

  it("collapses to nothing lit at 0 (terminator retraces the limb)", () => {
    expect(litD(0)).toBe("M 10 1 A 9 9 0 0 1 10 19 A 9.000 9 0 0 0 10 1 Z");
  });

  it("lights a half disc at the quarters", () => {
    expect(litD(0.25)).toContain("A 0.000 9");
    expect(litD(0.75)).toContain("A 0.000 9");
  });

  it("lights the left when waning", () => {
    expect(litD(0.6)).toContain("A 9 9 0 0 0 10 19");
  });
});
