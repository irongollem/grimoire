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

// Trace the walls (frame 02): "A run catches wall ends. A point snaps to the end of any wall, and a gilt ring on the
// first point says the next click closes the ring."
describe("a run catches wall ends and closes its ring", () => {
  it("a click near the end of an existing wall lands exactly on it, and the hover says so", () => {
    const { layers, tool } = setup();
    layers.value.walls.old = { pack_id: "p", pack_version: 1, variant: 0, type: "wall", a: [4.2, 4.1], b: [9, 9] };
    tool.track([4.3, 4.2], false);
    expect(tool.hoverSnap.value).toBe("wall-end");
    tool.click([4.3, 4.2], false);
    expect(tool.run.value).toEqual([[4.2, 4.1]]);
  });

  it("a click on the first point of a three-point run closes the ring in one undo step, last b equal to first a", () => {
    const { layers, tool, pushCommand } = setup();
    tool.click([0, 0], false);
    tool.click([3, 0], false);
    tool.click([3, 3], false);
    expect(tool.run.value).toHaveLength(3);
    tool.track([0.1, 0.1], false);
    expect(tool.hoverSnap.value).toBe("start");
    tool.click([0.1, 0.1], false);
    // Three segments: (0,0)-(3,0), (3,0)-(3,3), (3,3)-(0,0); the run is over without Enter.
    const walls = Object.values(layers.value.walls);
    expect(walls).toHaveLength(3);
    expect(walls[2].b).toEqual(walls[0].a);
    expect(tool.run.value).toEqual([]);
    expect(pushCommand).toHaveBeenCalledTimes(1);
  });

  it("two points cannot close on the start: that would lay the wall back over itself", () => {
    const { layers, tool } = setup();
    tool.click([0, 0], false);
    tool.click([3, 0], false);
    tool.click([0.1, 0.1], false);
    // Grid point (0, 0) is a third point of an open run, not a closing click: nothing is written yet.
    expect(tool.run.value).toHaveLength(3);
    expect(layers.value.walls).toEqual({});
  });

  it("Alt on the start does not close the ring", () => {
    const { layers, tool } = setup();
    tool.click([0, 0], false);
    tool.click([3, 0], false);
    tool.click([3, 3], false);
    tool.click([0.1, 0.1], true);
    expect(tool.run.value).toHaveLength(4);
    expect(layers.value.walls).toEqual({});
  });
});
