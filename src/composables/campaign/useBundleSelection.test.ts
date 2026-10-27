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

  it("ticking Characters pulls in and locks what a character needs, and the locked categories cannot be unticked", () => {
    const sel = useBundleSelection();
    sel.toggleCategory("party_members");
    expect(sel.orderedCategories.value).toEqual(["party_members", "custom_classes", "custom_subclasses", "spells", "species"]);
    expect(sel.isLocked("species")).toBe(true);
    sel.toggleCategory("species");
    expect(sel.selectedCategories.value.has("species")).toBe(true);
    expect(sel.isLocked("npcs")).toBe(false);
  });

  it("species and spells are ordinary categories until Characters is ticked", () => {
    const sel = useBundleSelection();
    expect(sel.isLocked("species")).toBe(false);
    sel.toggleCategory("species");
    expect(sel.selectedCategories.value.has("species")).toBe(true);
    sel.toggleCategory("species");
    expect(sel.selectedCategories.value.has("species")).toBe(false);
  });

  it("a preselected character brings its dependencies along from the start", () => {
    const sel = useBundleSelection({ party_members: ["pc1"] });
    expect(sel.selectedCategories.value.has("species")).toBe(true);
    expect(sel.selectedCategories.value.has("spells")).toBe(true);
  });

  describe("walking the wizard", () => {
    function atFirstPick() {
      const sel = useBundleSelection({ npcs: ["n1"], factions: ["f1"] });
      sel.goToFirstPick();
      return sel;
    }

    it("goes through each picked category in the bundle's own order, then to the details", () => {
      const sel = atFirstPick();
      expect(sel.phase.value).toBe("pick");
      expect(sel.currentPickKey.value).toBe("npcs");
      expect(sel.isLastPick.value).toBe(false);
      sel.goNext();
      expect(sel.currentPickKey.value).toBe("factions");
      expect(sel.isLastPick.value).toBe(true);
      sel.goNext();
      expect(sel.phase.value).toBe("details");
      expect(sel.currentPickKey.value).toBeNull();
    });

    it("back from the details lands on the last pick, back from the first pick on the categories", () => {
      const sel = atFirstPick();
      sel.goNext();
      sel.goNext();
      sel.goBack();
      expect(sel.phase.value).toBe("pick");
      expect(sel.currentPickKey.value).toBe("factions");
      sel.goBack();
      expect(sel.currentPickKey.value).toBe("npcs");
      sel.goBack();
      expect(sel.phase.value).toBe("categories");
    });

    it("toggling, selecting all and none act on the category being picked, and nowhere in the categories step", () => {
      const sel = atFirstPick();
      sel.toggleEntity("n2");
      expect([...sel.currentSelection.value].sort()).toEqual(["n1", "n2"]);
      sel.toggleEntity("n1");
      expect([...sel.currentSelection.value]).toEqual(["n2"]);
      sel.selectAll(["a", "b", "c"]);
      expect(sel.currentSelection.value.size).toBe(3);
      sel.selectNone();
      expect(sel.currentSelection.value.size).toBe(0);
      expect([...(sel.entitySelections.value.factions ?? [])]).toEqual(["f1"]);
      // Nothing picked in a category means nothing exported from it.
      expect([...sel.selectionMap.value.keys()]).toEqual(["factions"]);

      const idle = useBundleSelection({ npcs: ["n1"] });
      idle.toggleEntity("x");
      idle.selectAll(["x"]);
      idle.selectNone();
      expect(Object.keys(idle.entitySelections.value)).toEqual(["npcs"]);
    });
  });

  it("pruneTo drops preselected ids the picker does not offer, and leaves a selection it has nothing to prune from alone", () => {
    const sel = useBundleSelection({ monsters: ["campaign-monster", "library-monster"] });
    sel.pruneTo("monsters", ["campaign-monster"]);
    expect([...(sel.entitySelections.value.monsters ?? [])]).toEqual(["campaign-monster"]);
    expect(sel.totalSelected.value).toBe(1);
    sel.pruneTo("npcs", []);
    expect(sel.entitySelections.value.npcs).toBeUndefined();
  });
});
