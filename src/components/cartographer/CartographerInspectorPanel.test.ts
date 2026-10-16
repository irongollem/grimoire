// The Inspector blocks added with tile packs v4: the wall tool's kind picker
// (and its decal list), the stamp picker's pack-given names, and the Select
// summary of a decorated wall. CampaignScopeField and the Dressing panel
// reach for stores and queries this test has no use for, so they are stubbed.
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CartographerInspectorPanel from "./CartographerInspectorPanel.vue";
import { STAMP_CATEGORIES } from "@/cartographer/stampCategories";

const FOREST = { labels: { objectPillar: ["Old tree"], wallDecal: ["Outflow pipe", "Rat hole"] } };

function mountPanel(over: Record<string, unknown> = {}) {
  return mount(CartographerInspectorPanel, {
    props: {
      name: "Map", campaignId: null, currentPackId: "p", darkness: "daylight", bundledPacks: [], loadedPackIds: new Set<string>(),
      packValidationMissing: 0, activeTool: "wall", activeObjectCategory: "objectChest",
      objectCategories: STAMP_CATEGORIES, stampRotation: 0, manifest: FOREST,
      activeWallKind: "wall", activeWallDecal: 0, wallDecalCount: 2,
      dressingBrushId: null, dressingRotation: 0, selectedDressing: null, selectedCell: null,
      selectedCellFloor: false, selectedCellSolid: false, selectedCellEdges: [],
      selectedCellObjectCategory: null, selectedCellLinkedNames: [], annotationText: "",
      linkedNoteId: "", linkedEncounterId: "", linkedTrapId: "", linkedFeatureId: "",
      noteOptions: [], encounterOptions: [], trapOptions: [], featureOptions: [],
      activeTemplateShape: "circle", templateShapes: [], caveRadius: 3,
      ...over,
    },
    global: { stubs: { CampaignScopeField: true, CartographerDressingPanel: true, EntityCombobox: true } },
  });
}

function button(wrapper: ReturnType<typeof mountPanel>, label: string) {
  const found = wrapper.findAll("button").find((b) => b.text() === label);
  if (!found) throw new Error(`no button "${label}"`);
  return found;
}

describe("wall kind block", () => {
  it("offers Wall, Grate, Sluice and Decal, and emits the kind picked", async () => {
    const wrapper = mountPanel();
    for (const label of ["Wall", "Grate", "Sluice", "Decal"]) expect(button(wrapper, label).exists()).toBe(true);
    await button(wrapper, "Sluice").trigger("click");
    expect(wrapper.emitted("update:activeWallKind")?.[0]).toEqual(["sluice"]);
  });

  it("shows no decal list for the painted kinds", () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).not.toContain("Outflow pipe");
  });

  it("names decals from the manifest and emits the variant picked", async () => {
    const wrapper = mountPanel({ activeWallKind: "decal" });
    expect(wrapper.text()).toContain("Outflow pipe");
    await button(wrapper, "Rat hole").trigger("click");
    expect(wrapper.emitted("update:activeWallDecal")?.[0]).toEqual([1]);
  });

  it("falls back to 'Decal n' when the pack names none, and says so when it has none", () => {
    const unnamed = mountPanel({ activeWallKind: "decal", manifest: { labels: undefined } });
    expect(unnamed.text()).toContain("Decal 1");
    expect(unnamed.text()).toContain("Decal 2");
    const none = mountPanel({ activeWallKind: "decal", wallDecalCount: 0 });
    expect(none.text()).toContain("no wall decals");
  });
});

describe("stamp picker", () => {
  it("names a stamp from the pack's labels, else from the schema", () => {
    const wrapper = mountPanel({ activeTool: "stamp" });
    const labels = wrapper.findAll("button").map((b) => b.text());
    expect(labels).toContain("Old tree"); // objectPillar, renamed by the pack
    expect(labels).toContain("Chest");
    expect(labels).toContain("Stairs up");
    expect(labels).toContain("Stairs down");
    expect(labels).toContain("Rubble");
    expect(labels).toContain("Debris");
  });

  it("emits the category of a stairs stamp", async () => {
    const wrapper = mountPanel({ activeTool: "stamp" });
    await button(wrapper, "Stairs down").trigger("click");
    expect(wrapper.emitted("update:activeObjectCategory")?.[0]).toEqual(["stairsDown"]);
  });
});

describe("select summary", () => {
  it("marks a decorated wall edge", () => {
    const wrapper = mountPanel({
      activeTool: "select", selectedCell: [0, 0], selectedCellFloor: true,
      selectedCellEdges: [{ side: "N", kind: "wall", decal: 1 }, { side: "W", kind: "wall" }],
    });
    expect(wrapper.text()).toContain("Wall (decal)");
    expect(wrapper.text()).toContain("Wall");
  });
});
