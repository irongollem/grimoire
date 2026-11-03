// Reuse the wall-node editor against a virtual boundary graph. The physical graph is passed only when no material
// shape is selected; virtual edges never enter sight, room discovery, or publish as walls.
import { computed, ref, watch, type Ref } from "vue";
import { type DungeonMapLayers, type GroundWallMode } from "@/types/dungeonMap.types";
import { groundLoops, groundRegionAt, putGroundRegion, removeGroundRegion, setGroundWalls } from "@/cartographer/groundRegions";
import { applyWallCommit, useWallNodeEdit, type WallNodeMods, type WallNodePack } from "./useWallNodeEdit";
import { buildGraph, runAt } from "@/cartographer/wallEdit/graph";
import { projectOnSegment } from "@/cartographer/wallEdit/geometry";
import type { Pt } from "@/cartographer/wallEdit/geometry";

const NO_MODS: WallNodeMods = { shift: false, alt: false };

export function useGroundRegionEdit(opts: {
  layers: Ref<DungeonMapLayers>;
  commit: (next: DungeonMapLayers) => void;
  pack: () => WallNodePack;
  hitTolerance: () => number;
}) {
  const selectedId = ref<string | null>(null);
  const selected = computed(() => {
    const id = selectedId.value;
    const region = id ? opts.layers.value.ground[id] : undefined;
    return id && region ? { id, ...region } : null;
  });
  const controller = useWallNodeEdit({
    layers: () => selected.value ? { ...opts.layers.value, walls: selected.value.boundary, floor: {} } : opts.layers.value,
    commit: (change) => {
      const region = selected.value;
      opts.commit(region
        ? putGroundRegion(opts.layers.value, region.id, { ...region, boundary: change.walls, walls: { ...region.walls } })
        : applyWallCommit(opts.layers.value, change));
    },
    pack: opts.pack,
    hitTolerance: opts.hitTolerance,
  });
  const shownLayers = computed(() => {
    const preview = controller.preview.value;
    const region = selected.value;
    if (!preview) return opts.layers.value;
    return region
      ? putGroundRegion(opts.layers.value, region.id, { ...region, boundary: preview, walls: { ...region.walls } })
      : { ...opts.layers.value, walls: preview };
  });
  watch(selected, (region) => {
    if (selectedId.value && !region) { selectedId.value = null; controller.clearSelection(); }
  }, { flush: "sync" });
  /** Whether a physical wall segment lies under `point`. */
  function wallAt(point: Pt): boolean {
    return Boolean(runAt(buildGraph(opts.layers.value.walls), point, opts.hitTolerance()));
  }
  /** Whether `point` is on a corner of the picked region's outline, where its handles are. */
  function onSelectedCorner(point: Pt): boolean {
    const region = selected.value;
    if (!region) return false;
    const tolerance = opts.hitTolerance();
    return groundLoops(region).some((loop) => loop.some(([x, y]) => Math.hypot(x - point[0], y - point[1]) <= tolerance));
  }
  /**
   * Picks what is under `point`. A physical wall comes first, as Illustrator would: one segment, with Alt the whole
   * wall, with Shift added to the walls already picked. A material region is picked whole (its outline, to move nodes
   * of) by its unwalled boundary or from inside. With
   * `interior` false only an outline or a wall counts (a press that may begin a marquee); a click on a region's
   * middle passes true.
   */
  function pick(point: Pt, mods: WallNodeMods = NO_MODS, interior = true): boolean {
    const tolerance = opts.hitTolerance();
    const onBoundary = Object.entries(opts.layers.value.ground).sort(([, a], [, b]) => b.z - a.z).find(([, r]) =>
      groundLoops(r).some((loop) => loop.some((a, i) => projectOnSegment(point, a, loop[(i + 1) % loop.length]).dist <= tolerance)),
    );
    const onWall = wallAt(point);
    // A physical wall under the pointer is picked as the wall even when it lies along a region's edge; the outline is
    // reached by its unwalled stretch, or by clicking inside the region (so a region walled all round still has a way in).
    const nextId = onWall ? null : onBoundary?.[0] ?? (!interior ? null : groundRegionAt(opts.layers.value, point[0], point[1]));
    // Walls add to walls; changing between a region and walls (or regions) starts over.
    const additive = mods.shift && nextId === null && selectedId.value === null;
    if (!additive) controller.clearSelection();
    selectedId.value = nextId;
    const region = selected.value;
    if (!region) return controller.select(point, additive ? mods : { shift: false, alt: mods.alt });
    const whole = { shift: false, alt: true };
    if (!controller.select(point, whole)) {
      // An interior click picks the source as well; handles belong to its boundary, not to the projection cell.
      const p = groundLoops(region)[0]?.[0];
      if (p) controller.select(p, whole);
    }
    return true;
  }
  function clear(): void { controller.clearSelection(); selectedId.value = null; }
  function setWallMode(mode: GroundWallMode): void {
    if (selected.value) opts.commit(setGroundWalls(opts.layers.value, selected.value.id, mode));
  }
  function rename(name: string): void {
    const region = selected.value;
    if (!region || name === region.name || name.trim().length === 0) return;
    opts.commit(putGroundRegion(opts.layers.value, region.id, { ...region, name, walls: { ...region.walls } }));
  }
  function remove(): void {
    if (!selected.value) return;
    opts.commit(removeGroundRegion(opts.layers.value, selected.value.id)); clear();
  }
  const boundaryController = {
    ...controller,
    deleteSelection(): boolean {
      // A material boundary must stay closed. Delete on its outline removes the shape; Delete on a node uses the
      // shared merge operation and keeps the loop closed. A free physical wall still supports deleting one bone.
      if (selected.value && controller.focus.value?.kind === "bone") { remove(); return true; }
      return controller.deleteSelection();
    },
  };
  return { controller: boundaryController, selectedId, selected, shownLayers, pick, wallAt, onSelectedCorner, clear, setWallMode, rename, remove };
}
