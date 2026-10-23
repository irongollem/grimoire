// The options slip: the wall tool's kind picker (and its decal list), the Place slip, and the Select summary of a decorated wall. They were the inspector's
// blocks until the editor moved to a slim bar; EntityCombobox reaches for stores and
// queries this test has no use for, so it is stubbed.
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CartographerToolOptions from "./CartographerToolOptions.vue";

const FOREST = { labels: { objectPillar: ["Old tree"], wallDecal: ["Outflow pipe", "Rat hole"] } };

function mountOptions(over: Record<string, unknown> = {}) {
  return mount(CartographerToolOptions, {
    props: {
      title: "Wall", activeTool: "wall", placeItem: null, placeLabel: "", placeImageUrl: null,
      placeFootprint: null, placeRotation: 0, selectedPlaced: null, catalogueOpen: true, runtime: null,
      manifest: FOREST,
      activeWallKind: "wall", activeWallDecal: 0, wallDecalCount: 2,
      selectedCell: null,
      selectedCellFloor: false, selectedCellSolid: false, selectedCellEdges: [],
      selectedCellObjectCategory: null, selectedCellLinkedNames: [], annotationText: "",
      linkedNoteId: "", linkedEncounterId: "", linkedTrapId: "", linkedFeatureId: "",
      noteOptions: [], encounterOptions: [], trapOptions: [], featureOptions: [],
      activeTemplateShape: "circle", templateShapes: [], brushRadius: 1.5, rectWalls: true,
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

describe("rectangle walls option", () => {
  it("shows the Walls toggle on, and emits the new value when it is flipped", async () => {
    const wrapper = mountOptions({ title: "Rectangle", activeTool: "rect" });
    const box = wrapper.find("input[type=checkbox]");
    expect((box.element as HTMLInputElement).checked).toBe(true);
    expect(wrapper.text()).toContain("Walls");
    expect(wrapper.text()).toContain("Shift makes it square");
    await box.setValue(false);
    expect(wrapper.emitted("update:rectWalls")?.[0]).toEqual([false]);
  });
});

describe("Shift captions", () => {
  it.each([
    ["wall", "Shift+click runs a straight wall"],
    ["brush", "Shift+click draws a straight line"],
    ["line", "Shift snaps to 45°"],
    ["terrain", "Shift+click draws a straight line"],
  ])("%s says what Shift does", (activeTool, text) => {
    expect(mountOptions({ activeTool }).text()).toContain(text);
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

describe("place slip", () => {
  const chest = { kind: "object", category: "objectChest", variant: 1 };

  it("names what is in hand, turns it, and says how to put it down", async () => {
    const wrapper = mountOptions({ title: "Place", activeTool: "place", placeItem: chest, placeLabel: "Iron chest" });
    expect(wrapper.text()).toContain("Iron chest");
    expect(wrapper.text()).toContain("Esc puts it down");
    await button(wrapper, "↻ E").trigger("click");
    expect(wrapper.emitted("update:placeRotation")?.[0]).toEqual([90]);
  });

  it("says so when nothing is in hand", () => {
    const wrapper = mountOptions({ title: "Place", activeTool: "place" });
    expect(wrapper.text()).toContain("Nothing in hand");
  });

  it("shows the selected placed prop with a Delete, instead of the item in hand", async () => {
    const wrapper = mountOptions({
      title: "Place", activeTool: "place", placeItem: chest, placeLabel: "Iron chest",
      selectedPlaced: { name: "Long table", rotation: 90 },
    });
    expect(wrapper.text()).toContain("Long table");
    expect(wrapper.text()).not.toContain("Iron chest");
    await button(wrapper, "Delete").trigger("click");
    expect(wrapper.emitted("deleteSelected")).toHaveLength(1);
  });

  it("offers the catalogue again only while its drawer is closed", async () => {
    const closed = mountOptions({ title: "Place", activeTool: "place", catalogueOpen: false });
    await button(closed, "Catalogue").trigger("click");
    expect(closed.emitted("openCatalogue")).toHaveLength(1);
    const open = mountOptions({ title: "Place", activeTool: "place", catalogueOpen: true });
    expect(open.findAll("button").some((b) => b.text() === "Catalogue")).toBe(false);
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
