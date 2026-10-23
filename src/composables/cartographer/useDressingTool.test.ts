import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { useDressingTool, type DressingPointer } from "./useDressingTool";
import type { DressingCatalog } from "@/cartographer/dressing";
import type { Tool } from "@/cartographer/tools";
import { emptyLayers, type DungeonMapLayers } from "@/types/dungeonMap.types";

const CATALOG: DressingCatalog = new Map([
  ["table", { id: "table", name: "Table", footprint_w: 2, footprint_h: 1, image: null, flat: false, light: null, url: null, sway: null }],
]);

function setup(active = true) {
  const layers = ref<DungeonMapLayers>(emptyLayers());
  const activeTool = ref<Tool>("place");
  const brushId = ref<string | null>("table");
  const brushRotation = ref(0);
  const selectedId = ref<string | null>(null);
  const pushCommand = vi.fn();
  const markDirty = vi.fn();
  const tool = useDressingTool({
    layers, catalog: ref(CATALOG), activeTool, brushId, brushRotation, selectedId,
    isActive: () => active,
    snapshotStr: () => JSON.stringify(layers.value),
    pushCommand, markDirty,
  });
  return { tool, layers, activeTool, brushId, brushRotation, selectedId, pushCommand, markDirty };
}

function pointer(x: number, y: number, over: Partial<DressingPointer> = {}): DressingPointer {
  return { cell: [Math.floor(x), Math.floor(y)], frac: [x, y], button: 0, altKey: false, ...over };
}

describe("useDressingTool", () => {
  it("places the armed prop at the pointer's cell with the brush rotation, selected, as one undo step", () => {
    const { tool, layers, brushRotation, selectedId, pushCommand, markDirty } = setup();
    brushRotation.value = 90;
    expect(tool.onPointerDown(pointer(3.4, 2.6))).toBe(true);
    const [id] = Object.keys(layers.value.dressing);
    expect(layers.value.dressing[id]).toMatchObject({ prop_id: "table", x: 3, y: 2, rotation: 90 });
    expect(selectedId.value).toBe(id);
    // Committed on release, not on the press.
    expect(pushCommand).not.toHaveBeenCalled();
    tool.onPointerUp();
    expect(pushCommand).toHaveBeenCalledTimes(1);
    expect(markDirty).toHaveBeenCalledTimes(1);
  });

  it("a placement cancelled before its release (a late pinch) is taken back and leaves the map clean", () => {
    const { tool, layers, selectedId, pushCommand, markDirty } = setup();
    selectedId.value = "earlier";
    tool.onPointerDown(pointer(1.5, 1.5));
    expect(Object.keys(layers.value.dressing)).toHaveLength(1);
    tool.cancelGesture();
    expect(layers.value.dressing).toEqual({});
    expect(selectedId.value).toBe("earlier");
    expect(tool.isHolding()).toBe(false);
    tool.onPointerUp();
    expect(pushCommand).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
  });

  it("leaves a middle-button press to the editor's pan", () => {
    const { tool, layers } = setup();
    expect(tool.onPointerDown(pointer(1, 1, { button: 1 }))).toBe(false);
    expect(layers.value.dressing).toEqual({});
  });

  it("a right-click that hits nothing is still the tool's, so it never pans", () => {
    const { tool, pushCommand } = setup();
    expect(tool.onPointerDown(pointer(9, 9, { button: 2 }))).toBe(true);
    expect(pushCommand).not.toHaveBeenCalled();
  });

  it("a click that misses every prop deselects", () => {
    const { tool, brushId, selectedId } = setup();
    tool.onPointerDown(pointer(0.5, 0.5));
    tool.onPointerUp();
    brushId.value = null;
    expect(selectedId.value).not.toBeNull();
    tool.onPointerDown(pointer(8, 8));
    expect(selectedId.value).toBeNull();
  });

  it("a drag that goes nowhere pushes no undo step", () => {
    const { tool, brushId, pushCommand } = setup();
    tool.onPointerDown(pointer(0.5, 0.5));
    tool.onPointerUp();
    brushId.value = null;
    pushCommand.mockClear();
    tool.onPointerDown(pointer(0.5, 0.5));
    expect(tool.isHolding()).toBe(true);
    tool.onPointerMove([0, 0]);
    tool.onPointerUp();
    expect(tool.isHolding()).toBe(false);
    expect(pushCommand).not.toHaveBeenCalled();
  });

  it("cancelGesture puts a dragged prop back where it was picked up, and leaves the map clean", () => {
    const { tool, layers, brushId, selectedId, pushCommand, markDirty } = setup();
    tool.onPointerDown(pointer(0.5, 0.5));
    tool.onPointerUp();
    brushId.value = null;
    const id = selectedId.value!;
    tool.onPointerDown(pointer(0.5, 0.5));
    tool.onPointerMove([4, 4]);
    expect(layers.value.dressing[id]).toMatchObject({ x: 4, y: 4 });
    pushCommand.mockClear();
    markDirty.mockClear();
    tool.cancelGesture();
    expect(layers.value.dressing[id]).toMatchObject({ x: 0, y: 0 });
    expect(tool.isHolding()).toBe(false);
    expect(pushCommand).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
  });

  it("turn rotates the brush when nothing is selected, wrapping at 360", () => {
    const { tool, brushRotation } = setup();
    tool.turn(270);
    tool.turn(270);
    expect(brushRotation.value).toBe(180);
  });

  it("eraseTopAt removes the topmost hit with no undo step of its own", () => {
    const { tool, layers, selectedId, pushCommand } = setup();
    tool.onPointerDown(pointer(0.5, 0.5));
    pushCommand.mockClear();
    expect(tool.eraseTopAt([1.5, 0.5])).toBe(true);
    expect(layers.value.dressing).toEqual({});
    expect(selectedId.value).toBeNull();
    expect(pushCommand).not.toHaveBeenCalled();
    expect(tool.eraseTopAt([1.5, 0.5])).toBe(false);
  });

  it("selecting a prop and then leaving the tool clears the selection but keeps the brush", async () => {
    const { tool, activeTool, brushId, selectedId } = setup();
    tool.onPointerDown(pointer(0.5, 0.5));
    activeTool.value = "floor";
    await nextTick();
    expect(selectedId.value).toBeNull();
    expect(brushId.value).toBe("table");
  });

  describe("renderScene", () => {
    it("has a ghost only with a prop armed and the cursor over the canvas", () => {
      const { tool, brushId } = setup();
      expect(tool.renderScene().dressingGhost).toBeNull();
      tool.setHover([2, 3]);
      expect(tool.renderScene().dressingGhost?.placement).toMatchObject({ prop_id: "table", x: 2, y: 3 });
      brushId.value = null;
      expect(tool.renderScene().dressingGhost).toBeNull();
    });

    it("shows neither ghost nor selection where the tool is not live (view mode, Plan layer)", () => {
      const { tool, selectedId } = setup(false);
      tool.setHover([2, 3]);
      selectedId.value = "anything";
      expect(tool.renderScene()).toEqual({ dressingGhost: null, selectedDressingId: null });
    });
  });
});
