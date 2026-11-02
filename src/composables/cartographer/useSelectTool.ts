// The Select tool's pointer rules (#1125), after Illustrator's Direct Selection: a click picks one thing, Shift adds or
// removes, a drag on empty ground draws a marquee, and dragging any picked piece carries everything picked.
//
// The editor owns the canvas and the undo stack and routes pointer events here. Walls are the wall controller's
// (`groundEdit.controller`), a lone prop or light is still the Place and Light tools' own (`selectedDressingId`,
// `lightTool.selectedId`), so their slips keep working. What this adds is the selection that holds more than one piece,
// or pieces of more than one kind: those live in `props` and `lights` here, and walls stay in the controller.
//
// A gesture that moves walls, props and lights together is one undo step: the editor's wall commit files nothing while
// `holdUndo` is set, and the release files a single step covering all three.

import { computed, ref, shallowRef, watch, type Ref } from "vue";
import { dressingCorners, dressingFootprint, hitTestDressing, type CellPoint, type DressingCatalog } from "@/cartographer/dressing";
import * as paintOps from "@/cartographer/paintOps";
import { lightsInRect, normalizedRect, objectAtPoint, objectsInRect, propsInRect, type CellRect } from "@/cartographer/selectionPick";
import { nearestLight } from "@/cartographer/wallPick";
import { cellKey, parseCellKey, type CellKey, type DungeonMapLayers, type ObjectCell } from "@/types/dungeonMap.types";
import type { useDressingTool } from "./useDressingTool";
import type { useGroundRegionEdit } from "./useGroundRegionEdit";
import type { useLightTool } from "./useLightTool";
import type { WallNodeMods } from "./useWallNodeEdit";

type Pt = readonly [number, number];
type Piece = { kind: "prop" | "light" | "object"; id: string } | { kind: "wall" };

export interface SelectToolOptions {
  layers: Ref<DungeonMapLayers>;
  catalog: Ref<DressingCatalog>;
  dressingTool: ReturnType<typeof useDressingTool>;
  lightTool: ReturnType<typeof useLightTool>;
  groundEdit: ReturnType<typeof useGroundRegionEdit>;
  selectedDressingId: Ref<string | null>;
  /** The cell inspector is a selection too: picking anything else puts it down. */
  clearCell: () => void;
  snapshotStr: () => string;
  pushCommand: (before: string, after: string) => void;
  markDirty: () => void;
  /** While set, wall commits join this gesture's undo step instead of filing their own. */
  holdUndo: (before: string | null) => void;
  /** What a pack object is called for the slip: "a brazier, from the Stone set". */
  describeObject: (cell: ObjectCell) => string;
  /** How far the pointer travels (cells) before a press on empty ground is a marquee rather than a click. */
  slop: () => number;
}

interface Group {
  start: Pt;
  before: string;
  props: Map<string, Pt>;
  lights: Map<string, Pt>;
  /** The picked objects' cells and the whole object layer as it was, so a drag always starts from the same cells. */
  objects: CellKey[];
  objectBase: Record<CellKey, ObjectCell>;
  walls: boolean;
  /** What a click that never moved narrows the selection to. */
  narrow: Piece;
  moved: boolean;
}

interface Marquee {
  start: Pt;
  additive: boolean;
  moved: boolean;
}

const GRID_STEP = 0.5;
const NO_MODS: WallNodeMods = { shift: false, alt: false };
const EMPTY: ReadonlySet<string> = new Set();

export function useSelectTool(opts: SelectToolOptions) {
  const { layers, catalog, dressingTool, lightTool, groundEdit, selectedDressingId, snapshotStr, pushCommand, markDirty, holdUndo } = opts;
  const wallNodes = groundEdit.controller;

  /** Props and lights picked together with something else (or with each other). A lone one stays in its own tool. */
  const multiProps = shallowRef<ReadonlySet<string>>(EMPTY);
  const multiLights = shallowRef<ReadonlySet<string>>(EMPTY);
  /** Pack objects (a brazier, a barrel) picked, by cell key. They have no tool of their own, so even one is held here. */
  const multiObjects = shallowRef<ReadonlySet<string>>(EMPTY);
  const marquee = ref<CellRect | null>(null);
  let group: Group | null = null;
  let pending: Marquee | null = null;

  const currentProps = (): ReadonlySet<string> => multiProps.value.size > 0 ? multiProps.value : selectedDressingId.value ? new Set([selectedDressingId.value]) : EMPTY;
  const currentLights = (): ReadonlySet<string> => multiLights.value.size > 0 ? multiLights.value : lightTool.selectedId.value ? new Set([lightTool.selectedId.value]) : EMPTY;

  /** The wall pieces picked, counted the way the slip counts them: segments, and nodes standing alone. */
  const wallPieces = computed(() => {
    const { runs, nodes } = wallNodes.selection.value;
    const inRuns = new Set(runs.flatMap((r) => [r.a, r.b]));
    return runs.length + nodes.filter((n) => !inRuns.has(n.id)).length;
  });
  /** How many things are picked, all kinds together. */
  const pieceCount = computed(() => wallPieces.value + currentProps().size + currentLights().size + multiObjects.value.size);
  /** More than one kind, or more than one prop or light: this tool carries it, the single-piece tools cannot. */
  const isMixed = computed(() => {
    const walls = wallNodes.hasSelection.value ? 1 : 0;
    const props = currentProps().size;
    const lights = currentLights().size;
    const objects = multiObjects.value.size;
    // A lone object counts: it has no single-piece tool to hand it to.
    if (objects > 0) return true;
    return props + lights + walls > 1 && !(walls > 0 && props + lights === 0);
  });
  /** "3 items" for the slip when what is picked is not one wall or one thing, else null. */
  const summary = computed(() => (isMixed.value ? `${pieceCount.value} items` : null));
  /** The one object picked on its own, for the slip: what it is, and how it is turned. */
  const lonelyObject = computed(() => {
    if (multiObjects.value.size !== 1 || pieceCount.value !== 1) return null;
    const [key] = multiObjects.value;
    const cell = layers.value.object[key as CellKey];
    return cell ? { label: opts.describeObject(cell), rotation: cell.rotation ?? 0 } : null;
  });

  /** After any change: a lone prop or light goes back to its own tool, everything else is held here. */
  function normalize(): void {
    const props = [...currentProps()];
    const lights = [...currentLights()];
    const walls = wallNodes.hasSelection.value;
    if (props.length + lights.length + (walls ? 1 : 0) <= 1 && multiObjects.value.size === 0) {
      multiProps.value = EMPTY;
      multiLights.value = EMPTY;
      selectedDressingId.value = props[0] ?? null;
      lightTool.selectedId.value = lights[0] ?? null;
      return;
    }
    multiProps.value = new Set(props);
    multiLights.value = new Set(lights);
    selectedDressingId.value = null;
    lightTool.selectedId.value = null;
  }

  /** Puts down everything picked, keeping `except`. */
  function clearPicks(except: Piece | null = null): void {
    const keepProp = except?.kind === "prop" ? except.id : null;
    const keepLight = except?.kind === "light" ? except.id : null;
    multiProps.value = EMPTY;
    multiLights.value = EMPTY;
    multiObjects.value = except?.kind === "object" ? new Set([except.id]) : EMPTY;
    selectedDressingId.value = keepProp;
    lightTool.selectedId.value = keepLight;
    if (except?.kind !== "wall") groundEdit.clear();
    opts.clearCell();
  }

  /** Esc, a change of tool, a new layer. */
  function clear(): void {
    cancelGesture();
    pending = null;
    marquee.value = null;
    clearPicks();
  }

  // Undo, redo or an erase can take away what is picked.
  watch(() => [layers.value.dressing, layers.value.lights, layers.value.object], () => {
    const props = new Set([...multiProps.value].filter((id) => layers.value.dressing[id]));
    const lights = new Set([...multiLights.value].filter((id) => layers.value.lights[id]));
    const objects = new Set([...multiObjects.value].filter((key) => layers.value.object[key as CellKey]));
    if (props.size === multiProps.value.size && lights.size === multiLights.value.size && objects.size === multiObjects.value.size) return;
    multiProps.value = props;
    multiLights.value = lights;
    multiObjects.value = objects;
    normalize();
  });

  // ── A press on a prop or a light ───────────────────────────────────────

  function startGroup(start: Pt, narrow: Piece): void {
    const before = snapshotStr();
    holdUndo(before);
    const props = new Map<string, Pt>();
    for (const id of currentProps()) {
      const p = layers.value.dressing[id];
      if (p) props.set(id, [p.x, p.y]);
    }
    const lights = new Map<string, Pt>();
    for (const id of currentLights()) {
      const l = layers.value.lights[id];
      if (l) lights.set(id, [l.x, l.y]);
    }
    const walls = wallNodes.beginGroup();
    group = { start, before, props, lights, objects: [...multiObjects.value] as CellKey[], objectBase: { ...layers.value.object }, walls, narrow, moved: false };
  }

  function pressPiece(piece: Extract<Piece, { id: string }>, fr: Pt, cell: [number, number], mods: WallNodeMods): void {
    const props = currentProps();
    const lights = currentLights();
    const objects = multiObjects.value;
    if (mods.shift) {
      // Shift never drags: it adds the piece, or takes it out if it was already picked.
      const set = new Set(piece.kind === "prop" ? props : piece.kind === "light" ? lights : objects);
      if (set.has(piece.id)) set.delete(piece.id);
      else set.add(piece.id);
      multiProps.value = piece.kind === "prop" ? set : props;
      multiLights.value = piece.kind === "light" ? set : lights;
      multiObjects.value = piece.kind === "object" ? set : objects;
      selectedDressingId.value = null;
      lightTool.selectedId.value = null;
      opts.clearCell();
      normalize();
      return;
    }
    const picked = piece.kind === "prop" ? props.has(piece.id) : piece.kind === "light" ? lights.has(piece.id) : objects.has(piece.id);
    if (picked && isMixed.value) {
      startGroup(fr, piece);
      return;
    }
    clearPicks(piece);
    if (piece.kind === "object") {
      // An object has no tool to hand the drag to: this one carries it, alone or not.
      opts.clearCell();
      startGroup(fr, piece);
      return;
    }
    if (piece.kind === "prop") dressingTool.grabAt(cell, [fr[0], fr[1]]);
    else lightTool.grabAt([fr[0], fr[1]]);
  }

  /**
   * A left press with Select. Returns nothing: every press is captured by the editor, because it is either a drag of
   * something or the start of a marquee.
   */
  function press(fr: Pt, cell: [number, number], mods: WallNodeMods): void {
    const propId = hitTestDressing(layers.value.dressing, catalog.value, fr[0], fr[1]);
    if (propId) {
      pressPiece({ kind: "prop", id: propId }, fr, cell, mods);
      return;
    }
    const lightId = nearestLight(layers.value.lights, [fr[0], fr[1]]);
    if (lightId) {
      pressPiece({ kind: "light", id: lightId }, fr, cell, mods);
      return;
    }
    // A pack object, unless a wall runs along its edge under the pointer: the wall is the thinner, harder target.
    const objectKey = objectAtPoint(layers.value.object, fr[0], fr[1]);
    if (objectKey && !groundEdit.wallAt(fr)) {
      pressPiece({ kind: "object", id: objectKey }, fr, cell, mods);
      return;
    }
    // A picked wall piece in a selection that spans kinds drags the whole selection.
    if (isMixed.value && wallNodes.pickedPieceAt(fr)) {
      if (mods.shift) {
        wallNodes.pointerDown(fr, mods);
        normalize();
        return;
      }
      startGroup(fr, { kind: "wall" });
      return;
    }
    // A wall lying on a picked material region's edge is picked as the wall, not as the region's outline (#1125, 2 Nov
    // 2026), unless the press is on one of the outline's own corner handles.
    const wallOverRegion = groundEdit.selectedId.value !== null && groundEdit.wallAt(fr) && !groundEdit.onSelectedCorner(fr);
    if (!wallOverRegion && wallNodes.hasSelection.value && wallNodes.pointerDown(fr, mods)) {
      if (!mods.shift) clearPicks({ kind: "wall" });
      else promoteForWalls();
      return;
    }
    if (mods.shift) promoteForWalls();
    if (groundEdit.pick(fr, mods, false)) {
      if (mods.shift) {
        promoteForWalls();
        return;
      }
      wallNodes.pointerDown(fr, NO_MODS, true);
      clearPicks({ kind: "wall" });
      return;
    }
    // Empty ground: a marquee, or a click if the pointer never leaves the slop.
    if (!mods.shift) clearPicks();
    pending = { start: fr, additive: mods.shift, moved: false };
    marquee.value = null;
  }

  /** Wall picks join the props and lights held with them: a lone prop moves out of its own tool first. */
  function promoteForWalls(): void {
    multiProps.value = currentProps();
    multiLights.value = currentLights();
    selectedDressingId.value = null;
    lightTool.selectedId.value = null;
    opts.clearCell();
    normalize();
  }

  // ── Moving ─────────────────────────────────────────────────────────────

  function moveGroup(fr: Pt, mods: WallNodeMods): void {
    const g = group;
    if (!g) return;
    let dx = fr[0] - g.start[0];
    let dy = fr[1] - g.start[1];
    // Props stand on whole cells; without any, half cells like nodes and lights, and Alt skips the grid.
    if (g.props.size > 0 || g.objects.length > 0) {
      dx = Math.round(dx);
      dy = Math.round(dy);
    } else if (!mods.alt) {
      dx = Math.round(dx / GRID_STEP) * GRID_STEP;
      dy = Math.round(dy / GRID_STEP) * GRID_STEP;
    }
    for (const [id, [x, y]] of g.props) paintOps.moveDressing(layers.value, id, x + dx, y + dy);
    for (const [id, [x, y]] of g.lights) {
      const light = layers.value.lights[id];
      if (light) layers.value.lights[id] = { ...light, x: x + dx, y: y + dy };
    }
    if (g.objects.length > 0) {
      layers.value.object = paintOps.shiftedObjects(g.objectBase, g.objects, dx, dy);
      multiObjects.value = new Set(g.objects.map((key) => { const [x, y] = parseCellKey(key); return cellKey(x + dx, y + dy); }));
    }
    if (g.walls) wallNodes.moveGroupBy([dx, dy]);
    if (dx !== 0 || dy !== 0) g.moved = true;
  }

  /** Pointer moved with Select active. Hover and a lone wall drag are the wall controller's. */
  function move(fr: Pt, mods: WallNodeMods): void {
    if (group) {
      moveGroup(fr, mods);
      return;
    }
    if (pending) {
      if (!pending.moved && Math.hypot(fr[0] - pending.start[0], fr[1] - pending.start[1]) > opts.slop()) pending.moved = true;
      if (pending.moved) marquee.value = { x0: pending.start[0], y0: pending.start[1], x1: fr[0], y1: fr[1] };
      return;
    }
    wallNodes.pointerMove(fr, mods);
  }

  // ── Letting go ─────────────────────────────────────────────────────────

  function endMarquee(m: Marquee, rect: CellRect): void {
    // A material region's outline is not part of a marquee; it would swap the wall controller onto its boundary.
    if (groundEdit.selectedId.value) groundEdit.clear();
    const box = normalizedRect(rect);
    const nodes = wallNodes.nodesInRect(box);
    const props = propsInRect(layers.value.dressing, catalog.value, box);
    const lights = lightsInRect(layers.value.lights, box);
    const objects = objectsInRect(layers.value.object, box);
    const keepProps = m.additive ? currentProps() : EMPTY;
    const keepLights = m.additive ? currentLights() : EMPTY;
    wallNodes.pickNodes(nodes, m.additive);
    multiProps.value = new Set([...keepProps, ...props]);
    multiLights.value = new Set([...keepLights, ...lights]);
    multiObjects.value = new Set([...(m.additive ? multiObjects.value : EMPTY), ...objects]);
    selectedDressingId.value = null;
    lightTool.selectedId.value = null;
    normalize();
  }

  /**
   * The release. Returns "cell" when it was a click on bare ground that picked nothing, so the editor can show the
   * cell; otherwise null. Everything else (a wall drag, a prop drag) is released by the tools that hold it.
   */
  function release(fr: Pt, mods: WallNodeMods): "cell" | null {
    if (group) {
      const g = group;
      group = null;
      if (g.walls) wallNodes.pointerUp();
      holdUndo(null);
      if (!g.moved) {
        // A click on a piece of a multi-selection narrows to it.
        if (g.narrow.kind !== "wall") clearPicks(g.narrow);
        return null;
      }
      markDirty();
      const after = snapshotStr();
      if (after !== g.before) pushCommand(g.before, after);
      return null;
    }
    const m = pending;
    if (!m) return null;
    pending = null;
    const rect = marquee.value;
    marquee.value = null;
    if (m.moved && rect) {
      endMarquee(m, rect);
      return null;
    }
    // A click on bare ground: a region's middle, or the cell.
    if (groundEdit.pick(fr, mods, true)) {
      opts.clearCell();
      normalize();
      return null;
    }
    return mods.shift ? null : "cell";
  }

  /** A second finger landed, or Esc: put a half-done gesture back. */
  function cancelGesture(): void {
    if (group) {
      const g = group;
      group = null;
      for (const [id, [x, y]] of g.props) paintOps.moveDressing(layers.value, id, x, y);
      for (const [id, [x, y]] of g.lights) {
        const light = layers.value.lights[id];
        if (light) layers.value.lights[id] = { ...light, x, y };
      }
      if (g.objects.length > 0) {
        layers.value.object = g.objectBase;
        multiObjects.value = new Set(g.objects);
      }
      if (g.walls) wallNodes.cancel();
      holdUndo(null);
    }
    pending = null;
    marquee.value = null;
  }

  function isHolding(): boolean {
    return group !== null || pending !== null;
  }

  // ── Delete ─────────────────────────────────────────────────────────────

  /** Del on a selection that spans pieces: all of it goes in one undo step. False when this is a single piece's Del. */
  function deleteAll(): boolean {
    if (!isMixed.value) return false;
    const before = snapshotStr();
    holdUndo(before);
    if (wallNodes.hasSelection.value) wallNodes.deleteSelection();
    for (const id of currentProps()) paintOps.removeDressing(layers.value, id);
    const lights = { ...layers.value.lights };
    for (const id of currentLights()) delete lights[id];
    layers.value.lights = lights;
    paintOps.removeObjects(layers.value, multiObjects.value as ReadonlySet<CellKey>);
    holdUndo(null);
    clearPicks();
    markDirty();
    pushCommand(before, snapshotStr());
    return true;
  }

  // ── What the canvas draws ─────────────────────────────────────────────

  /** Outlines of the props held here, in cells; a lone prop keeps the renderer's own outline. */
  function propOutlines(): CellPoint[][] {
    const out: CellPoint[][] = [];
    for (const id of multiProps.value) {
      const placement = layers.value.dressing[id];
      if (!placement) continue;
      const { w, h } = dressingFootprint(placement, catalog.value);
      out.push(dressingCorners(placement, w, h));
    }
    for (const key of multiObjects.value) {
      const [x, y] = parseCellKey(key as CellKey);
      out.push([{ x, y }, { x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 }]);
    }
    return out;
  }

  /** Turns the picked objects to `degrees` (one undo step). */
  function rotateObjects(degrees: number): void {
    if (multiObjects.value.size === 0) return;
    const before = snapshotStr();
    const next = { ...layers.value.object };
    for (const key of multiObjects.value) {
      const cell = next[key as CellKey];
      if (!cell) continue;
      const turned: ObjectCell = { ...cell, rotation: degrees };
      if (!degrees) delete turned.rotation;
      next[key as CellKey] = turned;
    }
    layers.value.object = next;
    markDirty();
    pushCommand(before, snapshotStr());
  }

  return {
    press,
    move,
    release,
    cancelGesture,
    clear,
    isHolding,
    deleteAll,
    normalize,
    propOutlines,
    summary,
    pieceCount,
    isMixed,
    marquee,
    multiLights,
    multiProps,
    multiObjects,
    lonelyObject,
    rotateObjects,
  };
}
