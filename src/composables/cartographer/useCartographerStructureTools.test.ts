import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import type { CellKey } from "@/types/dungeonMap.types";
import type { Tool } from "@/cartographer/tools";
import { useCartographerStructureTools } from "./useCartographerStructureTools";

// A narrow stand-in for useCartographerStructure's return value — only the
// members handleStructurePointerDown and renderStructureScene actually
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function setup(overrides: Partial<ReturnType<typeof baseStructure>> = {}) {
  const structure = fakeStructure(overrides);
  const activeTool = ref<Tool>("space");
  const dirty = ref(false);
  const tools = useCartographerStructureTools(structure, { activeTool, dirty });
  return { structure, activeTool, dirty, tools };
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

  it("leaves every other tool unhandled", () => {
    const { tools, activeTool } = setup();
    activeTool.value = "floor";
    expect(tools.handleStructurePointerDown(0, 0, 0)).toBe(false);
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
