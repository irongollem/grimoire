import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { useAngledWallTool } from "./useAngledWallTool";
import { emptyLayers, type DungeonMapLayers } from "@/types/dungeonMap.types";
import type { WallKind } from "@/cartographer/wallKinds";
import { collectOcclusion } from "@/cartographer/mapOcclusion";

function setup(kind: WallKind = "wall", visible = true) {
  const layers = ref<DungeonMapLayers>(emptyLayers());
  const wallKind = ref<WallKind>(kind);
  const wallVisible = ref(visible);
  const pushCommand = vi.fn();
  const tool = useAngledWallTool({
    layers,
    wallKind,
    pack: () => ({ packId: "p", packVersion: 1 }),
    visible: () => wallVisible.value,
    snapshotStr: () => JSON.stringify(layers.value),
    pushCommand,
    markDirty: vi.fn(),
  });
  return { layers, tool, pushCommand, wallVisible };
}

// #1125 decision 5: a run of clicks ends on Enter or double-click, Escape throws it away, one undo step.
describe("angled wall run", () => {
  it("creates a hidden run that remains selected and blocks sight, recorded in the undo snapshot", () => {
    const { layers, tool, pushCommand } = setup("wall", false);
    tool.click([0, 0], false);
    tool.click([3, 0], false);
    tool.click([3, 2], false);
    expect(tool.finish()).toBe(true);
    expect(Object.values(layers.value.walls).every((wall) => wall.visible === false)).toBe(true);
    expect(collectOcclusion(layers.value, 0, 0).walls).toHaveLength(2);
    expect(tool.selectedId.value).toBe(Object.keys(layers.value.walls).at(-1));
    const restored: DungeonMapLayers = JSON.parse(pushCommand.mock.calls[0][1]);
    expect(Object.values(restored.walls).every((wall) => wall.visible === false)).toBe(true);
  });

  it("keeps visible creation as the default and reads the current setting for the next run", () => {
    const { layers, tool, wallVisible } = setup();
    tool.click([0, 0], false);
    tool.click([2, 0], false);
    tool.finish();
    expect(Object.values(layers.value.walls)[0].visible).toBeUndefined();
    wallVisible.value = false;
    tool.click([0, 2], false);
    tool.click([2, 2], false);
    tool.finish();
    expect(Object.values(layers.value.walls).map((wall) => wall.visible)).toEqual([undefined, false]);
  });
  it("finishing a three-point run makes two walls and exactly one undo step", () => {
    const { layers, tool, pushCommand } = setup();
    tool.click([1, 1], false);
    tool.click([3, 1], false);
    tool.click([3, 4], false);
    expect(tool.finish()).toBe(true);
    expect(Object.keys(layers.value.walls)).toHaveLength(2);
    expect(pushCommand).toHaveBeenCalledTimes(1);
    const [before, after] = pushCommand.mock.calls[0];
    expect(Object.keys(JSON.parse(before).walls)).toHaveLength(0); // undo returns to before the run
    expect(Object.keys(JSON.parse(after).walls)).toHaveLength(2);
    expect(tool.run.value).toEqual([]);
  });

  it("the second click of a double-click lands on the same point and does not add a zero-length wall", () => {
    const { layers, tool } = setup();
    tool.click([1, 1], false);
    tool.click([3, 1], false);
    tool.click([3.1, 1.1], false); // snaps to [3, 1] again: the double-click's second click
    tool.finish();
    expect(Object.keys(layers.value.walls)).toHaveLength(1);
  });

  it("a run of one point makes no wall and no undo step", () => {
    const { layers, tool, pushCommand } = setup();
    tool.click([1, 1], false);
    expect(tool.finish()).toBe(false);
    expect(layers.value.walls).toEqual({});
    expect(pushCommand).not.toHaveBeenCalled();
    expect(tool.run.value).toEqual([]);
  });

  it("Escape (abandon) throws the unfinished run away without drawing", () => {
    const { layers, tool, pushCommand } = setup();
    tool.click([1, 1], false);
    tool.click([3, 1], false);
    tool.abandon();
    expect(tool.finish()).toBe(false);
    expect(layers.value.walls).toEqual({});
    expect(pushCommand).not.toHaveBeenCalled();
  });

  it("clicks snap to half cells, but Alt places exactly where the pointer is", () => {
    const { layers, tool } = setup();
    tool.click([1.2, 1.3], false);
    tool.click([3.37, 1.3], true);
    tool.finish();
    const [wall] = Object.values(layers.value.walls);
    expect(wall.a).toEqual([1, 1.5]);
    expect(wall.b).toEqual([3.37, 1.3]);
  });

  it("a decal wall kind draws a plain wall, since a decal only dresses a lattice wall", () => {
    const { layers, tool } = setup("decal");
    tool.click([0, 0], false);
    tool.click([2, 2], false);
    tool.finish();
    expect(Object.values(layers.value.walls)[0].type).toBe("wall");
  });

  it("the drawn run is selected, so Delete takes the last segment", () => {
    const { layers, tool } = setup();
    tool.click([0, 0], false);
    tool.click([2, 2], false);
    tool.finish();
    expect(tool.selectedId.value).toBe(Object.keys(layers.value.walls)[0]);
  });
});
