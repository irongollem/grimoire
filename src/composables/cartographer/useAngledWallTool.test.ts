import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { useAngledWallTool } from "./useAngledWallTool";
import { emptyLayers, type DungeonMapLayers } from "@/types/dungeonMap.types";
import type { WallKind } from "@/cartographer/wallKinds";

function setup(kind: WallKind = "wall") {
  const layers = ref<DungeonMapLayers>(emptyLayers());
  const wallKind = ref<WallKind>(kind);
  const pushCommand = vi.fn();
  const tool = useAngledWallTool({
    layers,
    wallKind,
    pack: () => ({ packId: "p", packVersion: 1 }),
    snapshotStr: () => JSON.stringify(layers.value),
    pushCommand,
    markDirty: vi.fn(),
  });
  return { layers, tool, pushCommand };
}

// #1125 decision 5: a run of clicks ends on Enter or double-click, Escape throws it away, one undo step.
describe("angled wall run", () => {
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
