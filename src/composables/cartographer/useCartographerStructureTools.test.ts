import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { emptyLayers, type CellKey, type DungeonMapLayers } from "@/types/dungeonMap.types";
import type { Tool } from "@/cartographer/tools";
import { useCartographerStructureTools } from "./useCartographerStructureTools";

// A narrow stand-in for useCartographerStructure's return value — only the
// members handleStructurePointerDown/Move and renderStructureScene actually
// touch. Keeping this local (rather than mounting the real composable, which
// pulls in useEncounters/useTraps/useDungeonFeatures/useNotes and their own
// TanStack Query setup) is what makes these tests pure.
function fakeStructure(overrides: Partial<ReturnType<typeof baseStructure>> = {}) {
  return { ...baseStructure(), ...overrides };
}
function baseStructure() {
  return {
    structure: ref({ spaces: [] as { key: string; cells: CellKey[]; nameSource: "annotation" | null }[] }),
    selectedSpaceKey: ref<string | null>(null),
    spaceRows: ref([] as { displayName: string }[]),
    selectSpaceAt: vi.fn(),
    renameSpace: vi.fn(() => true),
    paintZoneAt: vi.fn(() => true),
    eraseZoneAt: vi.fn(() => true),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function setup(overrides: Partial<ReturnType<typeof baseStructure>> = {}, initialLayers: DungeonMapLayers = emptyLayers()) {
  const structure = fakeStructure(overrides);
  const activeTool = ref<Tool>("space");
  const dirty = ref(false);
  const layers = ref<DungeonMapLayers>(initialLayers);
  const snapshotStr = vi.fn(() => "snap");
  const pushCommand = vi.fn();
  const tools = useCartographerStructureTools(structure, { activeTool, dirty, layers, snapshotStr, pushCommand });
  return { structure, activeTool, dirty, layers, snapshotStr, pushCommand, tools };
}

describe("handleStructurePointerDown", () => {
  it("selects the space under the cursor on LMB and reports handled", () => {
    const { structure, tools } = setup();
    expect(tools.handleStructurePointerDown(1, 2, 0)).toBe(true);
    expect(structure.selectSpaceAt).toHaveBeenCalledWith(1, 2);
  });

  it("leaves RMB on the Space tool unhandled — falls through to pan", () => {
    const { structure, tools } = setup();
    expect(tools.handleStructurePointerDown(1, 2, 2)).toBe(false);
    expect(structure.selectSpaceAt).not.toHaveBeenCalled();
  });

  it("erases the zone at the cursor on RMB with the Zone tool and pushes one undo command", () => {
    const { structure, tools, activeTool, snapshotStr, pushCommand } = setup();
    activeTool.value = "zone";
    snapshotStr.mockReturnValueOnce("before").mockReturnValueOnce("after");
    expect(tools.handleStructurePointerDown(3, 4, 2)).toBe(true);
    expect(structure.eraseZoneAt).toHaveBeenCalledWith(3, 4);
    expect(pushCommand).toHaveBeenCalledWith("before", "after");
  });

  it("does not push a command when the RMB erase changed nothing", () => {
    const { tools, activeTool, snapshotStr, pushCommand } = setup();
    activeTool.value = "zone";
    snapshotStr.mockReturnValue("same");
    tools.handleStructurePointerDown(3, 4, 2);
    expect(pushCommand).not.toHaveBeenCalled();
  });

  it("leaves the Zone tool's LMB paint unhandled — that goes through handleStructurePointerMove", () => {
    const { structure, tools, activeTool } = setup();
    activeTool.value = "zone";
    expect(tools.handleStructurePointerDown(1, 1, 0)).toBe(false);
    expect(structure.paintZoneAt).not.toHaveBeenCalled();
  });

  it("leaves every other tool unhandled", () => {
    const { tools, activeTool } = setup();
    activeTool.value = "floor";
    expect(tools.handleStructurePointerDown(0, 0, 0)).toBe(false);
  });
});

describe("handleStructurePointerMove", () => {
  it("paints the zone cell while the Zone tool is active and marks dirty", () => {
    const { structure, tools, activeTool, dirty } = setup();
    activeTool.value = "zone";
    expect(tools.handleStructurePointerMove(5, 5)).toBe(true);
    expect(structure.paintZoneAt).toHaveBeenCalledWith(5, 5);
    expect(dirty.value).toBe(true);
  });

  it("does not mark dirty when painting the zone cell was a no-op", () => {
    const { tools, activeTool, dirty } = setup({ paintZoneAt: vi.fn(() => false) });
    activeTool.value = "zone";
    tools.handleStructurePointerMove(5, 5);
    expect(dirty.value).toBe(false);
  });

  it("erases a zone under the Eraser tool when one is present, ahead of solid/floor", () => {
    const layers = emptyLayers();
    layers.zone![("2,2") as CellKey] = { zone_id: "z1", kind: "hazard", label: null };
    const { structure, tools, activeTool, dirty } = setup({}, layers);
    activeTool.value = "eraser";
    expect(tools.handleStructurePointerMove(2, 2)).toBe(true);
    expect(structure.eraseZoneAt).toHaveBeenCalledWith(2, 2);
    expect(dirty.value).toBe(true);
  });

  it("leaves the Eraser tool unhandled when there is no zone at the cell — falls through to solid/floor", () => {
    const { tools, activeTool } = setup();
    activeTool.value = "eraser";
    expect(tools.handleStructurePointerMove(9, 9)).toBe(false);
  });

  it("leaves every non-Zone, non-Eraser tool unhandled", () => {
    const { tools, activeTool } = setup();
    activeTool.value = "floor";
    expect(tools.handleStructurePointerMove(0, 0)).toBe(false);
  });
});

describe("renderStructureScene", () => {
  it("returns no derivedSpaces when the Space tool is not active", () => {
    const { tools, activeTool } = setup();
    activeTool.value = "floor";
    expect(tools.renderStructureScene().derivedSpaces).toBeUndefined();
  });

  it("maps every derived space to its display name and nameSource while the Space tool is active", () => {
    const structure = fakeStructure({
      structure: ref({
        spaces: [
          { key: "s:0,0", cells: ["0,0" as CellKey], nameSource: "annotation" as const },
          { key: "s:1,1", cells: ["1,1" as CellKey], nameSource: null },
        ],
      }),
      spaceRows: ref([{ displayName: "Nave" }, { displayName: "Region 2" }]),
      selectedSpaceKey: ref("s:0,0"),
    });
    const { tools, activeTool } = setup(structure);
    activeTool.value = "space";
    const scene = tools.renderStructureScene();
    expect(scene.selectedSpaceKey).toBe("s:0,0");
    expect(scene.derivedSpaces).toEqual([
      { key: "s:0,0", cells: ["0,0"], displayName: "Nave", nameSource: "annotation" },
      { key: "s:1,1", cells: ["1,1"], displayName: "Region 2", nameSource: null },
    ]);
  });
});

describe("onRenameSpace", () => {
  it("marks dirty when the rename actually changed something", () => {
    const { tools, dirty } = setup({ renameSpace: vi.fn(() => true) });
    tools.onRenameSpace("Cistern");
    expect(dirty.value).toBe(true);
  });

  it("leaves dirty untouched when the rename was a no-op", () => {
    const { tools, dirty } = setup({ renameSpace: vi.fn(() => false) });
    tools.onRenameSpace("Cistern");
    expect(dirty.value).toBe(false);
  });
});
