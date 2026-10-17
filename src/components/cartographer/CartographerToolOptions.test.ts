// The options slip: the wall tool's kind picker (and its decal list), the stamp picker's
// pack-given names, and the Select summary of a decorated wall. They were the inspector's
// blocks until the editor moved to a slim bar; EntityCombobox reaches for stores and
// queries this test has no use for, so it is stubbed.
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CartographerToolOptions from "./CartographerToolOptions.vue";
import { STAMP_CATEGORIES } from "@/cartographer/stampCategories";

const FOREST = { labels: { objectPillar: ["Old tree"], wallDecal: ["Outflow pipe", "Rat hole"] } };

function mountOptions(over: Record<string, unknown> = {}) {
  return mount(CartographerToolOptions, {
    props: {
      title: "Wall", activeTool: "wall", activeObjectCategory: "objectChest",
      objectCategories: STAMP_CATEGORIES, stampRotation: 0, manifest: FOREST,
      activeWallKind: "wall", activeWallDecal: 0, wallDecalCount: 2,
      dressingBrushId: null, selectedCell: null,
      selectedCellFloor: false, selectedCellSolid: false, selectedCellEdges: [],
      selectedCellObjectCategory: null, selectedCellLinkedNames: [], annotationText: "",
      linkedNoteId: "", linkedEncounterId: "", linkedTrapId: "", linkedFeatureId: "",
      noteOptions: [], encounterOptions: [], trapOptions: [], featureOptions: [],
      activeTemplateShape: "circle", templateShapes: [], brushRadius: 1.5,
      ...over,
    },
    global: { stubs: { EntityCombobox: true } },
  });
}

function button(wrapper: ReturnType<typeof mountOptions>, label: string) {
  const found = wrapper.findAll("button").find((b) => b.text() === label);
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

describe("slip chrome", () => {
  it("is a torn slip titled with the tool", () => {
    const wrapper = mountOptions({ title: "Wall · erase" });
    expect(wrapper.element.hasAttribute("data-slip")).toBe(true);
    expect(wrapper.text()).toContain("Wall · erase");
  });

  it("says in a line what a tool with nothing to set does", () => {
    const wrapper = mountOptions({ title: "Tiles", activeTool: "floor" });
    expect(wrapper.text()).toContain("Drag to paint floor");
  });
});

describe("wall kind block", () => {
  it("offers Wall, Grate, Sluice and Decal, and emits the kind picked", async () => {
    const wrapper = mountOptions();
    for (const label of ["Wall", "Grate", "Sluice", "Decal"]) expect(button(wrapper, label).exists()).toBe(true);
    await button(wrapper, "Sluice").trigger("click");
    expect(wrapper.emitted("update:activeWallKind")?.[0]).toEqual(["sluice"]);
  });

  it("shows no decal list for the painted kinds", () => {
    const wrapper = mountOptions();
    expect(wrapper.text()).not.toContain("Outflow pipe");
  });

  it("names decals from the manifest and emits the variant picked", async () => {
    const wrapper = mountOptions({ activeWallKind: "decal" });
    expect(wrapper.text()).toContain("Outflow pipe");
    await button(wrapper, "Rat hole").trigger("click");
    expect(wrapper.emitted("update:activeWallDecal")?.[0]).toEqual([1]);
  });

  it("falls back to 'Decal n' when the pack names none, and says so when it has none", () => {
    const unnamed = mountOptions({ activeWallKind: "decal", manifest: { labels: undefined } });
    expect(unnamed.text()).toContain("Decal 1");
    expect(unnamed.text()).toContain("Decal 2");
    const none = mountOptions({ activeWallKind: "decal", wallDecalCount: 0 });
    expect(none.text()).toContain("no wall decals");
  });
});

describe("stamp picker", () => {
  it("names a stamp from the pack's labels, else from the schema", () => {
    const wrapper = mountOptions({ title: "Object stamp", activeTool: "stamp" });
    const labels = wrapper.findAll("button").map((b) => b.text());
    expect(labels).toContain("Old tree"); // objectPillar, renamed by the pack
    expect(labels).toContain("Chest");
    expect(labels).toContain("Stairs up");
    expect(labels).toContain("Stairs down");
    expect(labels).toContain("Rubble");
    expect(labels).toContain("Debris");
  });

  it("emits the category of a stairs stamp", async () => {
    const wrapper = mountOptions({ title: "Object stamp", activeTool: "stamp" });
    await button(wrapper, "Stairs down").trigger("click");
    expect(wrapper.emitted("update:activeObjectCategory")?.[0]).toEqual(["stairsDown"]);
  });
});

describe("select summary", () => {
  const selected = {
    activeTool: "select", title: "Select", selectedCell: [0, 0], selectedCellFloor: true,
    selectedCellEdges: [{ side: "N", kind: "wall", decal: 1 }, { side: "W", kind: "wall" }],
  };

  it("is one line until opened", () => {
    const wrapper = mountOptions(selected);
    expect(wrapper.text()).toContain("Cell 0, 0: floor, 2 edges");
    expect(wrapper.text()).not.toContain("Wall (decal)");
  });

  it("marks a decorated wall edge once opened", async () => {
    const wrapper = mountOptions(selected);
    await button(wrapper, "Details").trigger("click");
    expect(wrapper.text()).toContain("Wall (decal)");
    expect(wrapper.text()).toContain("Wall");
  });
});

describe("label field", () => {
  it("waits for a cell, then edits its text", async () => {
    const empty = mountOptions({ activeTool: "annotate", title: "Label" });
    expect(empty.text()).toContain("Click a cell to add a label");
    const wrapper = mountOptions({ activeTool: "annotate", title: "Label", selectedCell: [2, 3], annotationText: "Cellar" });
    const input = wrapper.find("input");
    expect((input.element as HTMLInputElement).value).toBe("Cellar");
    await input.setValue("Crypt");
    expect(wrapper.emitted("update:annotationText")?.[0]).toEqual(["Crypt"]);
  });
});
