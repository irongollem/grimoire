import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { useLightTool } from "./useLightTool";
import { emptyLayers, type DungeonMapLayers } from "@/types/dungeonMap.types";
import type { TileLight } from "@/cartographer/packSchema";

function setup() {
  const layers = ref<DungeonMapLayers>(emptyLayers());
  const draft = ref<TileLight>({ color: "#ffb347", bright: 20, dim: 20 });
  const pushCommand = vi.fn();
  const tool = useLightTool({
    layers, draft, snapshotStr: () => JSON.stringify(layers.value), pushCommand, markDirty: vi.fn(),
  });
  return { layers, tool, pushCommand };
}

describe("a second finger lands mid-press (cancelGesture)", () => {
  it("takes back a light the press had just placed, and leaves no undo step", () => {
    const { layers, tool, pushCommand } = setup();
    tool.onPointerDown([2.5, 2.5], false);
    expect(Object.keys(layers.value.lights)).toHaveLength(1);
    tool.cancelGesture();
    expect(layers.value.lights).toEqual({});
    expect(tool.selectedId.value).toBeNull();
    tool.onPointerUp();
    expect(pushCommand).not.toHaveBeenCalled();
  });

  it("puts a light that was being dragged back where it was picked up", () => {
    const { layers, tool, pushCommand } = setup();
    layers.value.lights.torch = { x: 2.5, y: 2.5, light: { color: "#ffb347", bright: 20, dim: 20 } };
    tool.onPointerDown([2.5, 2.5], false);
    tool.onPointerMove([6, 4], false);
    expect(layers.value.lights.torch).toMatchObject({ x: 6, y: 4 });
    tool.cancelGesture();
    expect(layers.value.lights.torch).toMatchObject({ x: 2.5, y: 2.5 });
    tool.onPointerUp();
    expect(pushCommand).not.toHaveBeenCalled();
  });

  it("does nothing when no press is open", () => {
    const { layers, tool } = setup();
    layers.value.lights.torch = { x: 2.5, y: 2.5, light: { color: "#ffb347", bright: 20, dim: 20 } };
    tool.cancelGesture();
    expect(Object.keys(layers.value.lights)).toEqual(["torch"]);
  });
});

describe("dropStaleSelection", () => {
  it("lets go of a light that undo took away, and keeps one that is still there", () => {
    const { layers, tool } = setup();
    layers.value.lights.torch = { x: 1, y: 1, light: { color: "#ffb347", bright: 20, dim: 20 } };
    tool.selectedId.value = "torch";
    tool.dropStaleSelection();
    expect(tool.selectedId.value).toBe("torch");
    layers.value.lights = {};
    tool.dropStaleSelection();
    expect(tool.selectedId.value).toBeNull();
  });
});
