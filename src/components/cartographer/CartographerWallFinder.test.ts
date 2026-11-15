// The wall finder's slip (#1197, frame 07): its wordings come from what was proposed and what is kept.
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CartographerWallFinder from "./CartographerWallFinder.vue";

function mountSlip(proposed: number, kept: number, over: Record<string, unknown> = {}) {
  return mount(CartographerWallFinder, { props: { proposed, kept, tolerance: 0.2, inset: 0.15, snapToGrid: true, ...over } });
}
const labels = (w: ReturnType<typeof mountSlip>): string[] => w.findAll("button").map((b) => b.text());

describe("what it says", () => {
  it("says one ring in the singular and that nothing is a wall yet", () => {
    expect(mountSlip(1, 1).text()).toContain("1 ring proposed. Nothing is a wall until you keep it.");
  });

  it("counts several rings", () => {
    expect(mountSlip(6, 6).text()).toContain("6 rings proposed.");
  });

  it("offers Keep all with every ring kept, and Drop all beside it", () => {
    expect(labels(mountSlip(6, 6))).toEqual(["Keep all 6", "Drop all", "Cancel"]);
  });

  it("offers Keep with the count when only some are kept", () => {
    expect(labels(mountSlip(6, 4))).toEqual(["Keep 4", "Drop all", "Cancel"]);
  });

  it("says Keep it for the one ring a map usually has, not Keep all 1", () => {
    expect(labels(mountSlip(1, 1))[0]).toBe("Keep it");
  });

  it("offers Keep all again, and a disabled Keep, when none is kept", () => {
    const w = mountSlip(6, 0);
    expect(labels(w)).toEqual(["Keep 0", "Keep all", "Cancel"]);
    expect(w.findAll("button")[0].attributes("disabled")).toBeDefined();
  });

  it("with no outline says why and offers only Cancel, while the sensitivity stays to raise", () => {
    const w = mountSlip(0, 0);
    expect(w.text()).toContain("No outline found. The picture may fill its page edge to edge.");
    expect(labels(w)).toEqual(["Cancel"]);
    expect(w.find("#wall-finder-sensitivity").exists()).toBe(true);
  });

  it("reads the pull-in in feet at five feet a square", () => {
    // 0.15 cells x 5 ft = 0.75 ft; 0.5 cells x 5 = 2.5 ft.
    expect(mountSlip(1, 1, { inset: 0.15 }).text()).toContain("0.75 ft");
    expect(mountSlip(1, 1, { inset: 0.5 }).text()).toContain("2.5 ft");
  });
});

describe("what it asks for", () => {
  it("Keep, the all/none toggle and Cancel each say their own thing", async () => {
    const some = mountSlip(6, 4);
    await some.findAll("button")[0].trigger("click");
    await some.findAll("button")[1].trigger("click");
    await some.findAll("button")[2].trigger("click");
    expect(Object.keys(some.emitted()).filter((k) => ["apply", "drop-all", "cancel", "keep-all"].includes(k)).sort()).toEqual(["apply", "cancel", "drop-all"]);
    const none = mountSlip(6, 0);
    await none.findAll("button")[1].trigger("click");
    expect(none.emitted("keep-all")).toHaveLength(1);
    expect(none.emitted("drop-all")).toBeUndefined();
  });

  it("writes the sensitivity, the pull-in and the snap back as the DM moves them", async () => {
    const w = mountSlip(1, 1);
    await w.get("#wall-finder-sensitivity").setValue("0.4");
    await w.get("#wall-finder-inset").setValue("0.3");
    await w.get("input[type=checkbox]").setValue(false);
    expect(w.emitted("update:tolerance")?.at(-1)).toEqual([0.4]);
    expect(w.emitted("update:inset")?.at(-1)).toEqual([0.3]);
    expect(w.emitted("update:snapToGrid")?.at(-1)).toEqual([false]);
  });
});
