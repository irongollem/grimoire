import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SiteReadinessMeter from "./SiteReadinessMeter.vue";
import type { SiteReadiness } from "@/lib/locations/siteReadiness";

const base: SiteReadiness = {
  mapped: true, calibrated: false, traced: true, bound: true, waysOut: true,
  unboundSpaces: 0, untracedSpaces: 0, oneSidedWays: 0, caption: null,
};

// #1125 frame 08 calls it the grid; the meter must say the same word.
describe("SiteReadinessMeter", () => {
  it("names the missing grid as 'Grid', not 'Calibrated'", () => {
    const w = mount(SiteReadinessMeter, { props: { readiness: base } });
    expect(w.text()).toContain("Grid");
    expect(w.text()).not.toContain("Calibrated");
    expect(w.attributes("aria-label")).toBe("Floor plan missing: Grid");
  });

  it("the Mapped pill asks to open the map", async () => {
    const w = mount(SiteReadinessMeter, { props: { readiness: base } });
    await w.find("button").trigger("click");
    expect(w.emitted("open-map")).toHaveLength(1);
  });
});
