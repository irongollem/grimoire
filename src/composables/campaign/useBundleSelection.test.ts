import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useBundleSelection } from "./useBundleSelection";

describe("useBundleSelection", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("counts a preselection the book made", () => {
    const sel = useBundleSelection({ npcs: ["n1", "n2"] });
    expect(sel.totalSelected.value).toBe(2);
    expect([...sel.selectionMap.value.keys()]).toEqual(["npcs"]);
  });

  it("does not count the picks of a category that was unticked, so an empty export stays disabled", () => {
    const sel = useBundleSelection({ npcs: ["n1", "n2"] });
    sel.toggleCategory("npcs");
    sel.toggleCategory("factions");
    expect(sel.selectionMap.value.size).toBe(0);
    expect(sel.totalSelected.value).toBe(0);
  });

  it("restores the picks when the category is ticked again", () => {
    const sel = useBundleSelection({ npcs: ["n1"] });
    sel.toggleCategory("npcs");
    sel.toggleCategory("npcs");
    expect(sel.totalSelected.value).toBe(1);
  });
});
