import { afterEach, describe, expect, it } from "vitest";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import CartographerWallRunSlip from "./CartographerWallRunSlip.vue";

enableAutoUnmount(afterEach);
const slip = (run: { bones: number; nodes: number; doors: number }, refusalReason: "overlap" | null = null) =>
  mount(CartographerWallRunSlip, { props: { run, refusalReason } });

describe("the wall run slip", () => {
  it("counts bones, nodes and doors as the frame does, singular for one", () => {
    expect(slip({ bones: 4, nodes: 4, doors: 1 }).text()).toContain("Wall run · 4 bones · 4 nodes · 1 door");
    expect(slip({ bones: 1, nodes: 2, doors: 2 }).text()).toContain("Wall run · 1 bone · 2 nodes · 2 doors");
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
