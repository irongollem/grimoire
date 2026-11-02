import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { emptyLayers, type DungeonMapLayers } from "@/types/dungeonMap.types";
import { paintGroundCells } from "@/cartographer/groundRegions";
import { useGroundRegionEdit } from "./useGroundRegionEdit";

const SAND = { pack_id: "sand", pack_version: 1, variant: 0 };
const WATER = { pack_id: "water", pack_version: 1, variant: 0 };
const mods = { shift: false, alt: false };
function setup() {
  const sand = paintGroundCells(emptyLayers(), new Set(["0,0", "1,0", "2,0", "0,1", "1,1", "2,1"]), SAND);
  const layers = ref(paintGroundCells(sand, new Set(["1,0", "1,1"]), WATER));
  const history: DungeonMapLayers[] = [];
  const edit = useGroundRegionEdit({ layers, commit: (next) => { history.push(layers.value); layers.value = next; }, pack: () => ({ packId: "other", packVersion: 1, variant: 0 }), hitTolerance: () => 0.15 });
  return { layers, history, edit };
}

describe("material boundary node editing", () => {
  it("selects an unwalled region, moves its node and reveals source underpaint through one undo step", () => {
    const { layers, edit, history } = setup();
    const before = JSON.stringify(layers.value);
    expect(edit.pick([1.5, 0.5])).toBe(true);
    const id = edit.selectedId.value!;
    edit.controller.pointerDown([2, 0], mods);
    edit.controller.pointerMove([1.25, 0], { ...mods, alt: true });
    edit.controller.pointerUp();
    edit.controller.pointerMove([9, 9], mods);
    expect(edit.controller.focus.value).toEqual({ kind: "node", id: "1.25,0" });
    expect(history).toHaveLength(1);
    expect(layers.value.ground[id].material).toEqual(WATER);
    expect(Object.keys(layers.value.walls)).toHaveLength(0);
    expect(layers.value.floor["1,0"]?.floor).toEqual(SAND);
    layers.value = history[0];
    expect(JSON.stringify(layers.value)).toEqual(before);
  });

  it("reuses split, smooth/corner and node delete without adding a physical wall", () => {
    const { layers, edit } = setup();
    edit.pick([1.5, 0.5]);
    expect(edit.controller.doubleClick([1.5, 0])).toBe(true);
    expect(edit.controller.selection.value.nodes.some((n) => n.id === "1.5,0")).toBe(true);
    expect(edit.controller.doubleClick([1.5, 0])).toBe(true);
    expect(edit.controller.selection.value.nodes.find((n) => n.id === "1.5,0")?.smooth).toBe(true);
    expect(edit.controller.deleteSelection()).toBe(true);
    expect(Object.keys(layers.value.walls)).toHaveLength(0);
  });

  it("deletes a selected outline as a closed shape and clears stale selection across undo/removal", () => {
    const { edit, layers, history } = setup();
    edit.pick([1.5, 0.5]);
    const id = edit.selectedId.value!;
    expect(edit.controller.focus.value?.kind).toBe("bone");
    expect(edit.controller.deleteSelection()).toBe(true);
    expect(layers.value.ground[id]).toBeUndefined();
    expect(edit.selectedId.value).toBeNull();
    expect(edit.controller.selection.value.bones).toBe(0);
    expect(layers.value.floor["1,0"]?.floor).toEqual(SAND);
    layers.value = history[0];
    edit.pick([1.5, 0.5]);
    const empty = emptyLayers();
    layers.value = empty;
    expect(edit.selectedId.value).toBeNull();
    expect(edit.controller.selection.value.bones).toBe(0);
  });

  it("keeps a region selected while changing its name and optional wall visibility", () => {
    const { edit, layers } = setup();
    edit.pick([1.5, 0.5]);
    const id = edit.selectedId.value;
    edit.rename("Oasis");
    edit.setWallMode("hidden");
    expect(edit.selected.value?.name).toBe("Oasis");
    expect(edit.selectedId.value).toBe(id);
    expect(Object.values(layers.value.walls).every((wall) => wall.visible === false)).toBe(true);
    edit.setWallMode("none");
    expect(Object.keys(layers.value.walls)).toHaveLength(0);
  });
});
