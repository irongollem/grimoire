import { afterEach, describe, expect, it } from "vitest";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import CartographerWallRunSlip from "./CartographerWallRunSlip.vue";

enableAutoUnmount(afterEach);
const slip = (run: { bones: number; nodes: number; doors: number; items?: number }, refusalReason: "overlap" | null = null) =>
  mount(CartographerWallRunSlip, { props: { run, refusalReason } });

describe("the wall run slip", () => {
  it("counts segments and doors, singular for one (a click picks one segment, Alt+click the wall)", () => {
    expect(slip({ bones: 12, nodes: 13, doors: 3 }).text()).toContain("Wall · 12 segments · 3 doors");
    expect(slip({ bones: 1, nodes: 2, doors: 0 }).text()).toContain("Wall · 1 segment");
  });

  it("counts nodes when a box caught corners but no whole segment", () => {
    expect(slip({ bones: 0, nodes: 2, doors: 0 }).text()).toContain("Wall · 2 nodes");
  });

  it("counts items when props or lights are picked with the walls", () => {
    expect(slip({ bones: 0, nodes: 0, doors: 0, items: 3 }).text()).toContain("3 items");
  });

  it("leaves the doors out of a run without any", () => {
    expect(slip({ bones: 3, nodes: 3, doors: 0 }).text()).not.toContain("door");
  });

  it("says why a drag was refused instead of the usual help", () => {
    const w = slip({ bones: 4, nodes: 4, doors: 0 }, "overlap");
    expect(w.text()).toContain("A wall already lies there.");
    expect(w.text()).not.toContain("Double-click");
  });
});
