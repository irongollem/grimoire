// Plan pointer dispatch + render scene (epic #884 S7b) — the ROUTING half of
// the Plan layer, mirroring the WHAT/ROUTING split
// `useCartographerStructure.ts`/`useCartographerStructureTools.ts` already
// draw for the Drawing's own Zone tools. `usePlanPalette.ts` is the
// WHAT (data, mutations, undo); this module is only "how a pointer event on
// THIS canvas becomes one of those calls."
//
// Zone tracing (brush/pen/shape/lasso) is not reinvented here — it
// delegates straight to `useRegionPointer`, the exact gesture state machine
// the Atlas's own `MapRegionsLayer.vue` uses, via the same plain-callback
// contract that module already exposes. Only the geometry callbacks differ:
// the Atlas resolves a pointer event against a static image's calibration;
// this module resolves it against the Cartographer's own pannable/zoomable
// tile canvas, using the same `tilePx`/`viewportOffset` maths
// `useMapCanvasEditor.ts`'s Drawing tools already use — see that module's
// `pointerToWorld`/`viewportToCell`, which the geometry callbacks below wrap.
//
// The Door and Assign tools are NOT trace gestures (no stroke, no ring) and so
// are not routed through `useRegionPointer`. Door is a stretch of whatever is
// under the pointer (#1197, frame 06): a placed door first (click cycles,
// Alt-click removes), else a door-wide stretch of a plain wall of the Drawing
// (a click cuts the door into it), else the nearest grid edge (a click writes
// the way alone, as it always did, reusing the edge-detection primitives
// `detectHoveredEdge` and `canonicaliseEdge` the Drawing's wall/door tools
// share). A short drag across an opening with no wall places a door on its own
// line. Assign is a one-shot click with no analogue
// in the Atlas at all: it reads the Drawing's floor layer via `floodFill`, or the ring of walls round the click
// (`wallFaceAt`) where no floor is painted, and writes straight to the Plan.
//
// Panning stays universal: RMB and the middle button are never claimed here
// (and Space+drag is settled by the editor before this is asked), so
// `useMapCanvasEditor.ts`'s existing pan logic keeps running underneath the
// Plan exactly as it does under the Drawing. `onPointerDown`
// returns whether it claimed the event for exactly this reason — the caller
// falls through to its own pan-trigger check when it didn't.

import { computed, ref, shallowRef, watch, type Ref } from "vue";
import { useRegionPointer, type UseRegionPointerOptions } from "@/composables/locations/useRegionPointer";
import { useToast } from "@/composables/useToast";
import { doorSiteSegment, eraseFromRegions, type DoorSite, type UsePlanPaletteReturn } from "@/composables/cartographer/usePlanPalette";
import type { SiteDoorWithSpaces } from "@/composables/locations/useSiteDoors";
import { canonicaliseEdge } from "@/cartographer/edges";
import { detectHoveredEdge } from "@/cartographer/edgeHover";
import { floodFill } from "@/cartographer/floodFill";
import { wallFaceAt, type FoundFace } from "@/cartographer/roomOutline";
import { distanceToSegment, nearestWallFoot, wallStretch, WALL_PICK_RADIUS, type CellPoint } from "@/cartographer/wallPick";
import { DOOR_EDGE_SNAP_THRESHOLD, doorSegment, gridEdgeSegment, indexSpacesByCell, resolveSegmentEndpoints } from "@/lib/locations/doors";
import { templateRing as buildTemplateRing } from "@/lib/locations/polygon";
import { cellKey, type CellKey, type DungeonMapLayers } from "@/types/dungeonMap.types";
import { isGridEdgeKey, type DoorSegment, type SourceEdgeKey } from "@/types/locationDoor.types";
import type { GridPoint, LocationMapRegion } from "@/types/locationMapRegion.types";
import type { TemplateDragState } from "@/lib/map/gestures/pen";
import type { AssignHover, PlanWayLike } from "@/cartographer/planOverlay";

export interface PlanCanvasToolsOptions {
  plan: UsePlanPaletteReturn;
  /** The Drawing's own floor layer — read-only here, the Assign tool's source. */
  layers: Ref<DungeonMapLayers>;
  /** Client (event) coordinates → the cell under them, in the tile grid both
   *  layers share (see `MapWorkbench.vue`'s `buildReferenceImage` docblock
   *  for why that sharing is safe to rely on). Null off the canvas. */
  cellAt: (clientX: number, clientY: number) => CellKey | null;
  /** Same, but as a continuous, unsnapped grid point — pen/template space. */
  gridPointAt: (clientX: number, clientY: number) => GridPoint | null;
  /** Same, but as world pixels — what `detectHoveredEdge` wants. */
  worldPointAt: (clientX: number, clientY: number) => { x: number; y: number } | null;
  tilePixelSize: () => number;
}

/** What the Door tool would act on at the pointer, and the line to light for it. A placed door wins over a wall, and a
 *  wall over a bare grid edge; `free` is the line a drag is drawing. */
export type DoorHover =
  | { target: "way"; segment: DoorSegment; way: SiteDoorWithSpaces }
  | { target: "wall"; segment: DoorSegment; site: DoorSite }
  | { target: "edge"; segment: DoorSegment; site: DoorSite }
  | { target: "free"; segment: DoorSegment };

/** A press this far from its release, in cells, is a drag that draws a door; anything shorter is a click. */
export const DOOR_DRAG_MIN_CELLS = 0.5;
/** A drawn door is never longer than this, in cells: a doorway, not a wall. */
export const DOOR_DRAG_MAX_CELLS = 3;

export interface PlanRenderScene {
  regions: readonly LocationMapRegion[];
  ways: readonly PlanWayLike[];
  activeRegionId: string | null;
  cellsOverride: ReadonlyMap<string, readonly CellKey[]> | undefined;
  /** The line the Door tool lights: what is under the pointer, the line being dragged, or the door waiting for its rooms. */
  hoveredDoor: DoorSegment | null;
  tracingRing: readonly GridPoint[] | null;
  tracingClosed: boolean;
  tracingHoverPoint: GridPoint | null;
  templateDraft: TemplateDragState | null;
  templateRingPreview: readonly GridPoint[];
  /** The area an Assign click would make a room of, lit before the click. */
  assignHover: AssignHover | null;
}

export function usePlanCanvasTools(opts: PlanCanvasToolsOptions) {
  const { plan, layers, cellAt, gridPointAt, worldPointAt, tilePixelSize } = opts;
  const { error: toastError } = useToast();

  const planHoveredDoor = ref<DoorHover | null>(null);
  /** A Door press that may become a drag: where it began (cells) and what a plain click there would have acted on. */
  const doorDrag = ref<{ from: CellPoint; to: CellPoint; edge: DoorHover | null } | null>(null);
  // Shallow: the cells of a large floor are replaced as a whole, never edited, and must not be walked by a deep watch.
  const assignHover = shallowRef<AssignHover | null>(null);
  /** What the hover was last worked out from, so a pointer that stays inside the same floor region or the same ring
   *  of walls costs nothing, and an edit to the floor or the rooms makes it be worked out again. (A ring is told by
   *  its face, which is a new object once the walls change.) */
  let hoverBasis: { floor: object; regions: object; kind: string; cells: ReadonlySet<CellKey> | null; face: FoundFace | null } | null = null;

  // ── Zone tracing — delegated to useRegionPointer ─────────────────
  function isTraceTool(): boolean {
    return plan.planTool.value === "zone";
  }

  /** Every room the DM can click: the written rows, then the found rooms still waiting in the list. */
  const rooms = (): LocationMapRegion[] => [
    ...plan.regions.value.filter((r) => r.region_role === "space"),
    ...plan.foundRegions.value,
  ];

  const pointerOptions: UseRegionPointerOptions = {
    cellAt,
    isPaintable: () => true, // the Cartographer's canvas has no image bound to stay on
    gridPointAt,
    // The shape as this palette last wrote it, not the query row: a second stroke begun before the first one's
    // refetch lands must build on the first, or committing it would throw the first away.
    activeRegion: () => {
      const region = isTraceTool() ? plan.activeRegion.value : null;
      return region ? { ...region, ...plan.regionStateNow(region.id) } : null;
    },
    hasActiveRegionId: () => isTraceTool() && plan.activeRegionId.value !== null,
    tool: () => plan.traceTool.value,
    brushRadius: () => plan.brushRadius.value,
    mode: () => "browse",
    // Found rooms with no row yet answer a click like any unbound room; `selectRegion` writes the row then.
    regionAt: (cell) => rooms().find((r) => r.cells.includes(cell)) ?? null,
    hoverRegionAt: (cell) => {
      const zone = plan.regions.value.find((r) => r.region_role === "zone" && r.cells.includes(cell));
      return zone ?? rooms().find((r) => r.cells.includes(cell)) ?? null;
    },
    commitCells: plan.commitCells,
    commitRing: plan.commitRing,
    commitTemplate: plan.commitTemplate,
    // Clicking an already-traced-but-unbound shape resumes tracing it — the
    // Cartographer has no region list to pick from, so this IS how a DM gets
    // back to a shape they started earlier without abandoning it.
    onSelect: (regionId) => { void plan.selectRegion(regionId); },
    // Binding/navigation are panel actions (#884 S7b spec, item 4) — this
    // embedded tool never names or opens a location, so a click on an
    // already-bound space does nothing here rather than routing anywhere.
    onNavigate: () => {},
    onDescend: () => {},
    onMoveParty: () => {},
    isNestedSite: () => false,
    onHover: () => {},
  };

  const regionPointer = useRegionPointer(pointerOptions);

  // ── Erase tool ───────────────────────────────────────────────────────────
  // A plain drag: every cell it crosses comes out of whatever space or zone
  // holds it, committed once on release. Listeners live on the window, like
  // `useRegionPointer`'s own strokes, so a release off the canvas still ends it.
  const eraseTouched = ref<Set<CellKey> | null>(null) as Ref<Set<CellKey> | null>;

  function touchErase(clientX: number, clientY: number): void {
    const cell = cellAt(clientX, clientY);
    if (!cell || !eraseTouched.value || eraseTouched.value.has(cell)) return;
    eraseTouched.value = new Set([...eraseTouched.value, cell]);
  }

  function onEraseWindowMove(ev: PointerEvent): void {
    touchErase(ev.clientX, ev.clientY);
  }

  function onEraseWindowUp(): void {
    const touched = eraseTouched.value;
    endErase();
    if (touched && touched.size > 0) plan.eraseCells(touched);
  }

  function endErase(): void {
    eraseTouched.value = null;
    window.removeEventListener("pointermove", onEraseWindowMove);
    window.removeEventListener("pointerup", onEraseWindowUp);
  }

  // ── Door tool ────────────────────────────────────────────────────────────

  function edgeAt(clientX: number, clientY: number): SourceEdgeKey | null {
    const world = worldPointAt(clientX, clientY);
    const tilePx = tilePixelSize();
    if (!world || tilePx <= 0) return null;
    const edge = detectHoveredEdge(world.x, world.y, tilePx, DOOR_EDGE_SNAP_THRESHOLD);
    if (!edge) return null;
    const canon = canonicaliseEdge(edge.x, edge.y, edge.side);
    return `${canon.x},${canon.y}:${canon.side}` as SourceEdgeKey;
  }

  /** The door-wide stretch of a wall under the pointer, centred on its foot point and kept inside the wall (a wall
   *  shorter than the door gives the whole wall). A wall on a grid line is a single 5 ft edge, so it is always that
   *  whole edge whatever the width: it cannot hold half a door. */
  function doorStretch(point: CellPoint): { segment: DoorSegment; wallId: string } | null {
    const hit = nearestWallFoot(layers.value.walls, point, WALL_PICK_RADIUS);
    if (!hit || layers.value.walls[hit.wallId]?.type !== "wall") return null;
    if (isGridEdgeKey(hit.wallId)) return { segment: gridEdgeSegment(hit.wallId), wallId: hit.wallId };
    return { segment: wallStretch(layers.value.walls, hit, plan.doorWidth.value), wallId: hit.wallId };
  }

  /** What the Door tool would act on at the pointer: a placed door, else a plain wall, else the nearest grid edge. */
  function doorHoverAt(clientX: number, clientY: number): DoorHover | null {
    const point = gridPointAt(clientX, clientY);
    if (point) {
      let nearest: { way: SiteDoorWithSpaces; segment: DoorSegment } | null = null;
      let nearestDistance = WALL_PICK_RADIUS;
      for (const way of plan.ways.value) {
        const segment = doorSegment(way);
        if (!segment) continue;
        const d = distanceToSegment(point, segment[0], segment[1]);
        if (d <= nearestDistance) {
          nearest = { way, segment };
          nearestDistance = d;
        }
      }
      if (nearest) return { target: "way", segment: nearest.segment, way: nearest.way };
      const stretch = doorStretch(point);
      if (stretch) {
        return { target: "wall", segment: stretch.segment, site: { kind: "wall", wallId: stretch.wallId, from: stretch.segment[0], to: stretch.segment[1] } };
      }
    }
    const edgeKey = edgeAt(clientX, clientY);
    return edgeKey ? { target: "edge", segment: gridEdgeSegment(edgeKey), site: { kind: "edge", edgeKey } } : null;
  }

  /** The door line a drag from `from` to `to` draws: press to release, at most `DOOR_DRAG_MAX_CELLS` long. */
  function draggedLine(from: CellPoint, to: CellPoint): DoorSegment {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (length <= DOOR_DRAG_MAX_CELLS) return [from, to];
    const k = DOOR_DRAG_MAX_CELLS / length;
    return [from, [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k]];
  }

  // Indexed once per change of the rooms, not per pointer move: the tip below asks on every move of the Door tool.
  const spacesByCell = computed(() => indexSpacesByCell(plan.regions.value));
  const roomsBeside = (segment: DoorSegment) => resolveSegmentEndpoints(segment, spacesByCell.value);

  /** The line under the pointer says which rooms it would join, before the click (frame 06): the options slip shows it. */
  const doorTip = computed<string | null>(() => {
    const hover = planHoveredDoor.value;
    if (!hover || hover.target === "free") return null;
    const name = (id: string | null): string | null => (id === null ? null : (plan.spaceNames.value.get(id) ?? "an unnamed room"));
    if (hover.target === "way") {
      const from = name(hover.way.from_location_id);
      const to = name(hover.way.to_location_id);
      const joins = to === null ? `${from}, leading nowhere yet` : `${from} to ${to}`;
      return `${joins}. Click to switch door and arch, Alt-click to remove.`;
    }
    const rooms = roomsBeside(hover.segment);
    if (!rooms) return "No room beside this wall yet. You will be asked which rooms it joins.";
    const from = name(rooms.fromLocationId);
    const to = name(rooms.toLocationId);
    return to === null ? `Door here: ${from}, leading nowhere yet` : `Door here: ${from} and ${to}`;
  });

  /** Puts a door on `site`: a listed door being placed keeps its own two ends, else the rooms either side of the line
   *  are the door's, else the options slip asks. */
  function placeDoorOn(site: DoorSite): void {
    // A listed door being placed keeps its own two ends, so it needs no room beside the line.
    if (plan.placeArmedDoorOn(site)) return;
    const resolved = roomsBeside(doorSiteSegment(site));
    if (resolved) {
      plan.placeDoorAt(site, resolved.fromLocationId, resolved.toLocationId);
      return;
    }
    // No room within a cell of either side (#1195): the plan cannot tell what this door joins, so the options
    // slip asks, and the Drawing is cut only on the answer. Only a site with no rooms at all has nothing to ask about.
    if (plan.spaceOptions.value.length === 0) {
      toastError("This map has no rooms yet. Add a room zone first, then place its doors.");
      return;
    }
    plan.askDoorEnds(site);
  }

  /** A click: a placed door cycles (Alt removes it), a wall or edge gets a door, anything else does nothing. */
  function handleDoorClick(hover: DoorHover | null, altKey: boolean): void {
    if (hover?.target === "way") {
      if (altKey) plan.removeDoor(hover.way);
      else plan.cycleDoorKind(hover.way);
      return;
    }
    if (altKey || !hover || hover.target === "free") return;
    placeDoorOn(hover.site);
  }

  function endDoorDrag(): void {
    doorDrag.value = null;
    window.removeEventListener("pointermove", onDoorWindowMove);
    window.removeEventListener("pointerup", onDoorWindowUp);
  }

  function onDoorWindowMove(ev: PointerEvent): void {
    const drag = doorDrag.value;
    const point = gridPointAt(ev.clientX, ev.clientY);
    if (drag && point) doorDrag.value = { ...drag, to: point };
  }

  function onDoorWindowUp(ev: PointerEvent): void {
    const drag = doorDrag.value;
    onDoorWindowMove(ev);
    const end = doorDrag.value;
    endDoorDrag();
    if (!drag || !end) return;
    if (Math.hypot(end.to[0] - end.from[0], end.to[1] - end.from[1]) < DOOR_DRAG_MIN_CELLS) {
      handleDoorClick(drag.edge, false);
      return;
    }
    const [from, to] = draggedLine(end.from, end.to);
    placeDoorOn({ kind: "free", from, to });
  }

  /** A press with the Door tool. A placed door or a wall under it acts at once; anything else waits for the release,
   *  which makes a door of the drag, or of a click on the nearest grid edge when it did not move. */
  function pressDoor(ev: PointerEvent): void {
    const hover = doorHoverAt(ev.clientX, ev.clientY);
    if (ev.altKey || hover?.target === "way" || hover?.target === "wall") {
      handleDoorClick(hover, ev.altKey);
      return;
    }
    const point = gridPointAt(ev.clientX, ev.clientY);
    if (!point) return;
    endDoorDrag();
    doorDrag.value = { from: point, to: point, edge: hover };
    window.addEventListener("pointermove", onDoorWindowMove);
    window.addEventListener("pointerup", onDoorWindowUp);
  }

  // ── Assign tool ─────────────────────────────────────────────────────────

  /** A click on painted floor assigns that floor's region. A click anywhere else assigns the ring of walls round it,
   *  so a map that is a picture with only walls drawn over it still gets rooms: the DM picks which rings count. */
  function assignAt(clientX: number, clientY: number): void {
    const cell = cellAt(clientX, clientY);
    if (!cell) return;
    if (layers.value.floor[cell]?.floor) {
      const [xs, ys] = cell.split(",");
      const region = floodFill(Number(xs), Number(ys), (x, y) => !!layers.value.floor[cellKey(x, y)]?.floor);
      void plan.assignArea([...region]);
      return;
    }
    const point = gridPointAt(clientX, clientY);
    const face = point ? wallFaceAt(layers.value, point) : null;
    if (!face) {
      toastError("Click inside a closed ring of walls, or on a painted floor.");
      return;
    }
    if (face.cells.length === 0) {
      toastError("That ring of walls is smaller than a square, so there is nothing to assign.");
      return;
    }
    void plan.assignArea(face.cells, face.outline);
  }

  /** Lights what a click would assign: painted floor's connected region, else the ring of walls round the pointer.
   *  With the Room kind, an area that is already a room lights nothing, since a click there only selects it. Any
   *  other kind makes a zone over the room, so it lights. */
  function updateAssignHover(clientX: number, clientY: number): void {
    const cell = cellAt(clientX, clientY);
    if (!cell) return clearAssignHover();
    const l = layers.value;
    const regions = plan.regions.value;
    const kind = plan.zoneKind.value;
    const fresh = hoverBasis && hoverBasis.floor === l.floor && hoverBasis.regions === regions && hoverBasis.kind === kind;
    const alreadyARoom = (cells: readonly CellKey[]): boolean => {
      if (kind !== "room") return false;
      const claimed = new Set(cells);
      return regions.some((r) => r.region_role === "space" && r.cells.some((c) => claimed.has(c)));
    };

    if (l.floor[cell]?.floor) {
      if (fresh && hoverBasis!.cells?.has(cell)) return;
      const [xs, ys] = cell.split(",");
      const region = floodFill(Number(xs), Number(ys), (x, y) => !!l.floor[cellKey(x, y)]?.floor);
      hoverBasis = { floor: l.floor, regions, kind, cells: region, face: null };
      const cells = [...region];
      showAssignHover(alreadyARoom(cells) ? null : { cells, outline: null });
      return;
    }

    const point = gridPointAt(clientX, clientY);
    const face = point ? wallFaceAt(l, point) : null;
    if (fresh && hoverBasis!.face === face && hoverBasis!.cells === null) return;
    hoverBasis = { floor: l.floor, regions, kind, cells: null, face };
    showAssignHover(face && face.cells.length > 0 && !alreadyARoom(face.cells) ? { cells: face.cells, outline: face.outline } : null);
  }

  /** Sets the hover, leaving the basis alone: an area that lights nothing is still the area the pointer is in. */
  function showAssignHover(next: AssignHover | null): void {
    if (assignHover.value !== null || next !== null) assignHover.value = next;
  }

  function clearAssignHover(): void {
    hoverBasis = null;
    showAssignHover(null);
  }

  // Switching tool drops the hover at once, so Zone's own preview is never drawn under a stale amber area.
  watch(plan.planTool, clearAssignHover, { flush: "sync" });
  // Likewise a Door drag in flight is dropped, not finished, when the tool changes.
  watch(plan.planTool, endDoorDrag, { flush: "sync" });

  // ── Dispatch ─────────────────────────────────────────────────────────────
  // Pan (RMB / middle) is never claimed — the caller's own pan logic
  // runs when this returns false, exactly the boundary
  // `useMapCanvasEditor.ts`'s Drawing tools already draw around their own
  // pan-trigger check.

  function isPanGesture(ev: PointerEvent): boolean {
    return ev.button === 1 || ev.button === 2;
  }

  function onPointerDown(ev: PointerEvent): boolean {
    const tool = plan.planTool.value;

    if (tool === "door") {
      // alt+click still deletes even when the press was a right or middle
      // one, which would otherwise read as a pan — alt is the door tool's
      // own modifier.
      if (isPanGesture(ev) && !ev.altKey) return false;
      // Still claimed even with nothing to target: the Door tool being active
      // must never leak a click through to the Drawing's own tool dispatch
      // underneath (see `useMapCanvasEditor.ts`'s `activeLayer` branch) —
      // only a genuine pan gesture is allowed to fall through.
      ev.preventDefault();
      pressDoor(ev);
      return true;
    }

    if (tool === "assign") {
      if (isPanGesture(ev)) return false;
      assignAt(ev.clientX, ev.clientY);
      // The click made it a room (or selected the one it was), so there is nothing left to offer here.
      clearAssignHover();
      return true;
    }

    if (tool === "erase") {
      if (isPanGesture(ev)) return false;
      ev.preventDefault();
      eraseTouched.value = new Set();
      touchErase(ev.clientX, ev.clientY);
      window.addEventListener("pointermove", onEraseWindowMove);
      window.addEventListener("pointerup", onEraseWindowUp);
      return true;
    }

    // zone: delegated to useRegionPointer whether or not a region
    // is active yet: with one active, this paints into it; with none, it
    // still registers the window listeners the click-to-select-an-existing-
    // unbound-shape gesture needs on release (`onSelect` below). Starting a
    // FRESH shape is deliberately never automatic — same as the Atlas's own
    // "+ New space" button, the palette's "New" action
    // (`usePlanPalette.ts`'s `startNewSpace`/`startNewZone`) is the only way
    // to get one, so a bare click can unambiguously mean "select" instead.
    if (isPanGesture(ev)) return false;
    regionPointer.onPointerDown(ev);
    return true;
  }

  function onPointerMove(ev: PointerEvent): void {
    const tool = plan.planTool.value;
    if (tool === "door") {
      planHoveredDoor.value = doorHoverAt(ev.clientX, ev.clientY);
      return;
    }
    planHoveredDoor.value = null;
    if (tool === "assign") {
      updateAssignHover(ev.clientX, ev.clientY);
      return;
    }
    if (tool === "erase") return;
    regionPointer.onPointerMove(ev);
  }

  function onPointerLeave(): void {
    planHoveredDoor.value = null;
    clearAssignHover();
    regionPointer.onPointerLeave();
  }

  function onDoubleClick(ev: MouseEvent): void {
    if (!isTraceTool()) return;
    regionPointer.onDoubleClick(ev);
  }

  function dispose(): void {
    endErase();
    endDoorDrag();
    regionPointer.dispose();
  }

  /** Abandons whatever Zone, Erase or Door-drag gesture is in flight without
   *  committing it. The Assign tool has none (it is a single click). See `useRegionPointer.abandonGesture`'s own
   *  docblock (#884 review finding 2). */
  function abandonGesture(): void {
    endErase();
    endDoorDrag();
    regionPointer.abandonGesture();
  }

  /** The line lit for the Door tool: the one waiting for its rooms while the slip asks about it, else the line being
   *  dragged once it is long enough to be a door, else what is under the pointer. */
  function doorLine(): DoorSegment | null {
    if (plan.pendingDoor.value) return doorSiteSegment(plan.pendingDoor.value);
    const drag = doorDrag.value;
    if (drag && Math.hypot(drag.to[0] - drag.from[0], drag.to[1] - drag.from[1]) >= DOOR_DRAG_MIN_CELLS) {
      return draggedLine(drag.from, drag.to);
    }
    return planHoveredDoor.value?.segment ?? null;
  }

  function renderScene(): PlanRenderScene {
    const overrides = eraseTouched.value ? eraseFromRegions(plan.regions.value, eraseTouched.value) : undefined;

    let tracingRing: readonly GridPoint[] | null = null;
    let tracingClosed = false;
    let tracingHoverPoint: GridPoint | null = null;
    let templateRingPreview: readonly GridPoint[] = [];

    if (isTraceTool() && plan.traceTool.value === "pen" && plan.activeRegion.value) {
      const region = plan.activeRegion.value;
      const persisted = region.vertices !== null;
      const drag = regionPointer.liveDrag.value;
      const dragging = drag && drag.regionId === region.id ? drag.ring : null;
      tracingRing = dragging ?? (persisted ? region.vertices! : regionPointer.draftRing.value);
      tracingClosed = persisted;
      tracingHoverPoint = regionPointer.penHoverPoint.value;
    }

    // A lasso in flight is an open ring; a brush stroke in flight is the closed shape so far.
    const stroke = regionPointer.strokePreview.value;
    if (isTraceTool() && stroke && stroke.regionId === plan.activeRegionId.value) {
      tracingRing = stroke.ring;
      tracingClosed = stroke.closed;
    }

    const templateDraft = regionPointer.templateDraft.value;
    if (isTraceTool() && plan.traceTool.value === "template" && templateDraft && templateDraft.radius > 0) {
      templateRingPreview = buildTemplateRing(templateDraft.shape, templateDraft.center, templateDraft.radius);
    }

    return {
      regions: [...plan.regions.value, ...plan.foundRegions.value],
      ways: plan.ways.value,
      activeRegionId: plan.activeRegionId.value,
      cellsOverride: overrides,
      hoveredDoor: plan.planTool.value === "door" ? doorLine() : null,
      tracingRing,
      tracingClosed,
      tracingHoverPoint,
      templateDraft,
      templateRingPreview,
      assignHover: assignHover.value,
    };
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerLeave,
    onDoubleClick,
    dispose,
    abandonGesture,
    renderScene,
    doorTip,
    // Exposed only so the caller's render-triggering `watch` array can see
    // them (`useMapCanvasEditor.ts`'s `scheduleRender` deps) — every actual
    // read of these lives inside `renderScene()` above.
    renderDeps: {
      hoveredDoor: planHoveredDoor,
      doorDrag,
      assignHover,
      pendingDoor: plan.pendingDoor,
      strokePreview: regionPointer.strokePreview,
      eraseTouched,
      draftRing: regionPointer.draftRing,
      templateDraft: regionPointer.templateDraft,
      liveDrag: regionPointer.liveDrag,
      penHoverPoint: regionPointer.penHoverPoint,
    },
  };
}
