// The Plan layer's own data + mutations + undo (epic #884 S7b) — what a Plan
// gesture MEANS, never how a pointer event unfolds into one (that split is
// `usePlanCanvasTools.ts`'s job, the same WHAT/ROUTING split
// `useCartographerStructure.ts`/`useCartographerStructureTools.ts` already
// draw for the Drawing's own Space/Zone tools).
//
// The Plan writes straight through to `location_map_regions`/`location_doors`
// via the same composables the Atlas's own Build mode uses
// (`useLocationMapRegions.ts`, `useLocationDoors.ts`, `useSiteDoors.ts`) —
// never a second query or a bespoke insert. That is also why undo here can't
// be the Drawing's `CommandStack` snapshot diff: there is no local draft to
// snapshot, every action is already a network write by the time it can be
// undone. `usePlanUndoStack` replays each mutation's own inverse instead.
//
// ── Why a CREATE's undo entry carries a mutable `RegionRef`/`DoorRef` ───────
// Undo of a CREATE is a plain, exact DELETE (the id is known). Redo of that
// undo has to recreate the row — which mints a NEW id — and any later entry
// in the same lineage (a paint stroke onto that region, a door's kind
// cycled) closed over the OLD id. A plain string closure would silently
// write to a row that no longer exists (or, worse, one that does but isn't
// this one). `RegionRef`/`DoorRef` are one-field mutable boxes shared by
// every entry for one region/door's lineage; a recreate updates `.id` in
// place, so every entry — however old — reads the *current* id when it
// finally runs. Nothing here ever needs to touch two boxes at once, so
// there's no ordering hazard to worry about.
//
// ── Why `commitCells`/`commitRing`/`commitTemplate` don't read `before` off
// `regions.value` alone (#884 review finding 4) ────────────────────────────
// The query only reflects a commit once its `onSuccess` invalidation AND
// `afterRegionMutation`'s door-reconciliation round trip both land — real
// network round trips, not one microtask. Two of these fired back to back
// (two quick strokes on the same region) would both read the SAME stale
// `before` off `regions.value`, so undoing the second would silently revert
// the first too. `localRegionState` tracks, per region, what THIS palette
// instance itself last wrote — read in preference to the query, and kept in
// step by every one of these functions (including their own undo/redo) — so
// a rapid second edit reads the first edit's result as its `before`, not
// whatever the lagging query still shows.

import { computed, ref, shallowRef, watch, type ComputedRef } from "vue";
import { useToast } from "@/composables/useToast";
import { useLocations } from "@/composables/locations/useLocations";
import {
  dmEdit,
  useCreateLocationMapRegion,
  useDeleteLocationMapRegion,
  useLocationMapRegions,
  useUpdateLocationMapRegion,
} from "@/composables/locations/useLocationMapRegions";
import {
  useCreateLocationDoor,
  useDeleteLocationDoor,
  useUpdateLocationDoor,
} from "@/composables/locations/useLocationDoors";
import { useSiteDoors, type SiteDoorWithSpaces } from "@/composables/locations/useSiteDoors";
import { useTemplateShape } from "@/composables/locations/useRegionPen";
import { usePlanUndoStack } from "@/composables/cartographer/usePlanUndoStack";
import type { DerivedSpace } from "@/cartographer/structure.types";
import { findAgain, materializeFound, zoningList, type ZoningEntry } from "@/lib/locations/foundRooms";
import { foundRegionOf, foundSpaceKey } from "@/lib/locations/zoningRows";
import { emptyZoneInsert } from "@/lib/locations/zones";
import { cellsInsideRing } from "@/lib/locations/polygon";
import { regionLoops, strokeZoneShape } from "@/lib/locations/zoneBrush";
import type { TraceTool } from "@/lib/locations/polygon";
import { wallFaces } from "@/cartographer/roomOutline";
import { addFreeDoor, cutDoorIntoWall, doorWallTypeOf, removeDoorWall, setDoorWallType } from "@/cartographer/doorCut";
import type { CellPoint } from "@/cartographer/wallPick";
import { gridEdgeSegment } from "@/lib/locations/doors";
import type { CellKey, DungeonMapLayers } from "@/types/dungeonMap.types";
import { isGridEdgeKey, type DoorKind, type DoorSegment, type SourceEdgeKey } from "@/types/locationDoor.types";
import {
  ZONE_KINDS,
  ZONE_KIND_LABELS,
  type GridPoint,
  type LocationMapRegion,
  type LocationMapRegionInsert,
  type ZoneKind,
} from "@/types/locationMapRegion.types";

/** Zoning's four tools (#1125 frame 19). The old Space tool is the Zone tool with the Room kind. */
export type PlanTool = "zone" | "door" | "assign" | "erase";

/** What a zone is. Room is a place in the Atlas (`region_role: 'space'`); every other kind only marks the floor
 *  (`region_role: 'zone'` + `zone_kind`). One list for the chips, the Zone tool and the rows. */
export type ZoningKind = "room" | ZoneKind;
export const ZONING_KINDS: readonly ZoningKind[] = ["room", ...ZONE_KINDS];
export const ZONING_KIND_LABELS: Record<ZoningKind, string> = { room: "Room", ...ZONE_KIND_LABELS };

/** How a Space or Zone is traced. One list, read by the Plan palette's own
 *  switch and by the canvas's active-tool pill (MapWorkbench.vue). */
export const TRACE_TOOL_OPTIONS: readonly { value: TraceTool; label: string }[] = [
  { value: "paint", label: "Brush" },
  { value: "pen", label: "Pen" },
  { value: "template", label: "Shape" },
  { value: "lasso", label: "Lasso" },
];

/** Each tool's key, the letters the Drawing's rail also uses for its own tools (the tab decides which set is live). */
export const PLAN_TOOLS: readonly { id: PlanTool; label: string; shortcut: string }[] = [
  { id: "zone", label: "Zone", shortcut: "z" },
  { id: "door", label: "Door", shortcut: "d" },
  { id: "assign", label: "Assign", shortcut: "f" },
  { id: "erase", label: "Erase", shortcut: "e" },
];

/**
 * What an erase stroke leaves of each region it crosses: every space or zone
 * holding a touched cell, with those cells taken out. Regions the stroke
 * never reached are absent. Pure, so the live preview and the commit agree.
 */
export function eraseFromRegions(
  regions: readonly LocationMapRegion[],
  erased: ReadonlySet<CellKey>,
): Map<string, CellKey[]> {
  const next = new Map<string, CellKey[]>();
  for (const region of regions) {
    if (!region.cells.some((cell) => erased.has(cell))) continue;
    next.set(region.id, region.cells.filter((cell) => !erased.has(cell)));
  }
  return next;
}

export { ZONE_KINDS, ZONE_KIND_LABELS };
export type { TraceTool };

/** Where a Door tool click puts a door (#1197): on a grid edge with the Drawing left alone, in a wall of the Drawing
 *  (a grid wall is switched in place, any other is cut by the door's two points), or on a line of its own with no wall
 *  under it. `from` and `to` are in cell units. */
export type DoorSite =
  | { kind: "edge"; edgeKey: SourceEdgeKey }
  | { kind: "wall"; wallId: string; from: CellPoint; to: CellPoint }
  | { kind: "free"; from: CellPoint; to: CellPoint };

/** The line a door site covers. */
export function doorSiteSegment(site: DoorSite): DoorSegment {
  return site.kind === "edge" ? gridEdgeSegment(site.edgeKey) : [site.from, site.to];
}

/** What the palette needs of the Drawing to cut a door into it as one undo step with the row: edit the layers through
 *  `mutate` (null leaves them alone) and hand back the closures that restore them. Bound by the canvas editor, which
 *  owns the Drawing, once it exists (`bindDrawingEditor`). */
export interface DrawingEditor {
  editDrawing: (mutate: (layers: DungeonMapLayers) => DungeonMapLayers | null) => DrawingHistory | null;
}
export interface DrawingHistory {
  undo: () => void;
  redo: () => void;
}

/** A one-field mutable box — see the module docblock for why a CREATE's undo
 *  lineage needs one instead of a plain string. */
export interface PlanEntityHandle {
  id: string;
}

/**
 * @param derived the rooms the Drawing's walls make right now; they are in the Zoning list from the moment it opens
 *   (#1125 frame 19), written as rows only when the DM acts on one.
 * @param layers the Drawing's layers, read for the rings of walls the list counts (a ring is not a room until assigned).
 */
export function usePlanPalette(
  siteId: ComputedRef<string | null>,
  derived: () => readonly DerivedSpace[] = () => [],
  layers: () => DungeonMapLayers | null = () => null,
) {
  const { error: toastError, fromError } = useToast();

  // ── Data ───────────────────────────────────────────────────────────────
  const { data: regionsData } = useLocationMapRegions(computed(() => siteId.value ?? ""));
  const regions = computed<LocationMapRegion[]>(() => regionsData.value ?? []);

  // A site's doors are read from its own point of view (`useSiteDoors`),
  // keyed by its direct children — the same "bindable spaces" set
  // `reconcileSiteDoorEndpoints` fetches, via the same `useLocations` every
  // other site-scoped panel already reads rooms through.
  const { data: childLocations } = useLocations(computed(() => siteId.value));
  const spaceIds = computed(() => (childLocations.value ?? []).map((l) => l.id));
  const { data: waysData } = useSiteDoors(spaceIds);
  const ways = computed<SiteDoorWithSpaces[]>(() => waysData.value ?? []);

  // ── Tool state ─────────────────────────────────────────────────────────
  const planTool = ref<PlanTool>("zone");
  const traceTool = ref<TraceTool>("paint");
  /** Zoning's round Brush, in cells (the Drawing's brush runs 0.5 to 6 too). A zone is a smooth shape, so a small
   *  default: a stroke at 0.75 is a line a little over a square wide. */
  const brushRadius = ref(0.75);
  /** A listed door waiting for its edge (see `armDoorPlacement`). */
  const placingDoorId = ref<string | null>(null);
  /** Where the Door tool clicked with no room in reach on either side (#1195). The options slip asks which rooms the
   *  door joins instead of refusing it; see `askDoorEnds`. The Drawing is cut only when the DM answers. */
  const pendingDoor = ref<DoorSite | null>(null);
  /** What the next door is: the slip's Door / Arch chips. An arch cuts the wall as an open doorway. */
  const newDoorKind = ref<"door" | "arch">("door");
  /** How wide the next door is in cells (5 ft or 10 ft). A grid wall is one 5 ft edge whatever this says. */
  const doorWidth = ref<1 | 2>(1);
  const drawingEditor = shallowRef<DrawingEditor | null>(null);
  function bindDrawingEditor(editor: DrawingEditor | null): void {
    drawingEditor.value = editor;
  }
  // Shared singleton with the Atlas's own template picker (`useRegionPen.ts`)
  // — deliberate: "only one tracing session can be live at a time" already
  // covers a DM being in the Cartographer instead of the Atlas, not just
  // between the Atlas's own siblings.
  const templateShape = useTemplateShape();
  const zoneKind = ref<ZoningKind>("room");
  const zoneLabel = ref("");

  const activeRegionId = ref<string | null>(null);
  const activeRegion = computed(() => regions.value.find((r) => r.id === activeRegionId.value) ?? null);

  // ── Mutations + undo ───────────────────────────────────────────────────
  const createRegion = useCreateLocationMapRegion();
  const updateRegion = useUpdateLocationMapRegion();
  const deleteRegion = useDeleteLocationMapRegion();
  const createDoor = useCreateLocationDoor();
  const updateDoor = useUpdateLocationDoor();
  const deleteDoor = useDeleteLocationDoor();
  const undo = usePlanUndoStack();

  const isBusy = computed(
    () =>
      createRegion.isPending.value ||
      updateRegion.isPending.value ||
      deleteRegion.isPending.value ||
      createDoor.isPending.value ||
      updateDoor.isPending.value ||
      deleteDoor.isPending.value ||
      undo.busy.value,
  );

  // See the module docblock (#884 review finding 4) for why this exists.
  const localRegionState = new Map<string, { vertices: GridPoint[] | null; cells: CellKey[] }>();

  function regionStateNow(regionId: string): { vertices: GridPoint[] | null; cells: CellKey[] } {
    const cached = localRegionState.get(regionId);
    if (cached) return cached;
    const region = regions.value.find((r) => r.id === regionId);
    return { vertices: region?.vertices ?? null, cells: region?.cells ?? [] };
  }

  /** Creates a region and pushes its CREATE undo entry. Returns the ref box
   *  future entries in this lineage should close over instead of the id. */
  async function createRegionTracked(insert: LocationMapRegionInsert): Promise<{ region: LocationMapRegion; handle: PlanEntityHandle } | null> {
    if (!siteId.value) return null;
    try {
      const created = await createRegion.mutateAsync(insert);
      const handle: PlanEntityHandle = { id: created.id };
      undo.push({
        label: `create ${insert.region_role ?? "space"}`,
        undo: async () => {
          await deleteRegion.mutateAsync(handle.id);
          if (activeRegionId.value === handle.id) activeRegionId.value = null;
        },
        redo: async () => {
          const recreated = await createRegion.mutateAsync(insert);
          handle.id = recreated.id;
          activeRegionId.value = handle.id;
        },
      });
      return { region: created, handle };
    } catch (err) {
      toastError(fromError(err));
      return null;
    }
  }

  /** Starts a fresh, empty zone of the chosen kind and makes it active. Deliberately the ONLY way to start one:
   *  nothing here auto-creates on tool selection or on a bare click with nothing active (either would create a
   *  DB row the instant a DM opens Zoning, or make a plain click ambiguous between "start a shape" and "select
   *  the existing unbound one under the cursor": see `usePlanCanvasTools.ts`'s `onPointerDown`, whose bare click
   *  always means the latter). The slip's "New zone" button is its only caller. */
  async function startNew(): Promise<LocationMapRegion | null> {
    if (!siteId.value) return null;
    const result = await createRegionTracked(newInsert(siteId.value, []));
    if (!result) return null;
    activeRegionId.value = result.handle.id;
    return result.region;
  }

  /** The row the chosen kind makes: a Room is a space (named later, bound later); anything else is a zone. */
  function newInsert(site: string, cells: CellKey[]): LocationMapRegionInsert {
    const label = zoneLabel.value.trim() || null;
    const kind = zoneKind.value;
    const base: LocationMapRegionInsert =
      kind === "room"
        ? { site_location_id: site, region_role: "space", label }
        : { ...emptyZoneInsert(site, kind), label };
    return cells.length > 0 ? { ...base, cells } : base;
  }

  /** Fire-and-forget square-set commit with no ring: `useRegionPointer`'s `commitCells` contract (a brush or lasso
   *  that leaves nothing) and the Erase tool on a region with no ring. A region written this way has no vertices, so
   *  an emptied ring-shaped region never keeps a ring that describes squares it no longer has. Captures the
   *  region's prior shape for the undo entry before the mutation lands. */
  function commitCells(regionId: string, cells: CellKey[]): void {
    const prior = regionStateNow(regionId);
    const mine = { vertices: null, cells };
    localRegionState.set(regionId, mine);
    const handle: PlanEntityHandle = { id: regionId };
    updateRegion.mutate(
      { id: regionId, update: dmEdit({ vertices: null, cells }) },
      {
        onSuccess: () => {
          undo.push({
            label: "paint stroke",
            undo: async () => {
              localRegionState.set(handle.id, prior);
              await updateRegion.mutateAsync({ id: handle.id, update: dmEdit(prior) });
            },
            redo: async () => {
              localRegionState.set(handle.id, { vertices: null, cells });
              await updateRegion.mutateAsync({ id: handle.id, update: dmEdit({ vertices: null, cells }) });
            },
          });
        },
        onError: (err) => {
          // Nothing was saved, so the shape is what it was: the next stroke must not build on squares that only
          // this palette believes in. A stroke made since owns the entry now and is left alone.
          if (localRegionState.get(regionId) === mine) localRegionState.set(regionId, prior);
          toastError(fromError(err));
        },
      },
    );
  }

  /** The Erase tool's commit: every region the stroke crossed loses the
   *  touched cells. Any region, bound or not, active or not: the trace
   *  brush's own erase only reaches the shape being traced, which left a
   *  bound room's area with no way to shrink it from the canvas. A room
   *  whose area empties keeps its Atlas page, like an orphan on publish.
   *
   *  A region with a ring (a lasso, a brush or a pen shape) is carved out of its ring, not just stripped of squares:
   *  taking the squares alone would leave `vertices` describing the old shape, and the canvas would keep drawing it.
   *  What is left in one piece is written as a ring with its squares derived; cut into several pieces, as its
   *  squares (a region holds one ring). */
  function eraseCells(erased: ReadonlySet<CellKey>): void {
    const current = regions.value.map((region) => {
      const now = regionStateNow(region.id);
      return { ...region, cells: now.cells, vertices: now.vertices };
    });
    for (const [regionId, cells] of eraseFromRegions(current, erased)) {
      const vertices = current.find((r) => r.id === regionId)?.vertices ?? null;
      if (vertices === null) {
        commitCells(regionId, cells);
        continue;
      }
      const shape = strokeZoneShape(regionLoops(vertices, []), [], true, erased);
      if (shape === null) continue;
      if ("cells" in shape) commitCells(regionId, shape.cells);
      else void commitRing(regionId, shape.ring).catch(() => {});
    }
  }

  /** Pen-ring commit — `useRegionPointer`'s `commitRing` contract. Must
   *  reject on failure (the draft-close gesture puts its ring back). */
  async function commitRing(regionId: string, ring: GridPoint[]): Promise<void> {
    const before = regionStateNow(regionId);
    const after = { vertices: ring, cells: cellsInsideRing(ring) };
    const handle: PlanEntityHandle = { id: regionId };
    localRegionState.set(regionId, after);
    try {
      await updateRegion.mutateAsync({ id: regionId, update: dmEdit(after) });
      undo.push({
        label: "pen ring",
        undo: async () => {
          localRegionState.set(handle.id, before);
          await updateRegion.mutateAsync({ id: handle.id, update: dmEdit(before) });
        },
        redo: async () => {
          localRegionState.set(handle.id, after);
          await updateRegion.mutateAsync({ id: handle.id, update: dmEdit(after) });
        },
      });
    } catch (err) {
      localRegionState.set(regionId, before);
      toastError(fromError(err));
      throw err;
    }
  }

  /** Template-drop commit — `useRegionPointer`'s `commitTemplate` contract;
   *  `cells` arrives pre-computed (the template's own algorithm, not the
   *  generic ring fill `commitRing` uses). */
  function commitTemplate(regionId: string, ring: GridPoint[], cells: CellKey[]): void {
    const before = regionStateNow(regionId);
    const after = { vertices: ring, cells };
    const handle: PlanEntityHandle = { id: regionId };
    localRegionState.set(regionId, after);
    updateRegion.mutate(
      { id: regionId, update: dmEdit(after) },
      {
        onSuccess: () => {
          undo.push({
            label: "template drop",
            undo: async () => {
              localRegionState.set(handle.id, before);
              await updateRegion.mutateAsync({ id: handle.id, update: dmEdit(before) });
            },
            redo: async () => {
              localRegionState.set(handle.id, after);
              await updateRegion.mutateAsync({ id: handle.id, update: dmEdit(after) });
            },
          });
        },
        onError: (err) => toastError(fromError(err)),
      },
    );
  }

  /** An existing space region that already covers some of `cells`: filling the same floor twice (or floor already
   *  traced as a room by hand) must select it rather than insert a second, overlapping row (#884 review finding 5).
   *  Any overlap counts as "already covered": a repeat fill returns the identical connected component, and a
   *  hand-traced room over the same floor need not match cell-for-cell to be the same room. */
  function findCoveringSpace(cells: readonly CellKey[]): LocationMapRegion | null {
    const claimed = new Set(cells);
    return regions.value.find((r) => r.region_role === "space" && r.cells.some((c) => claimed.has(c))) ?? null;
  }

  /** The Assign tool: makes the chosen kind of an area the DM clicked, up to its walls, "so the DM stops re-tracing
   *  by hand what they just drew." The area is a painted floor region, or (with an `outline`) the ring of walls round the
   *  click, which needs no floor at all. A Room from floor is the walls' own room (`derived_from: 'floodfill'`, the
   *  provenance this exact shape exists for); any other kind is the DM's ink. Zones may overlap a room, so only a
   *  Room is held to the no-duplicates rule, on both paths. */
  async function assignArea(cells: CellKey[], outline?: GridPoint[]): Promise<void> {
    if (!siteId.value || cells.length === 0) return;
    // The assigned zone gets the walls' own outline, so a round chapel is assigned along its curve.
    const vertices = outline ?? outlineOfCells(cells);
    const insert = { ...newInsert(siteId.value, cells), ...(vertices ? { vertices } : {}) };
    if (zoneKind.value === "room") {
      const covering = findCoveringSpace(cells);
      if (covering) {
        activeRegionId.value = covering.id;
        return;
      }
      // "floodfill" says the row mirrors a room found from painted floor, which Find again may redraw. A ring of
      // walls with no floor is in no found-room list, so Find again would read such a row as a room whose walls are
      // gone: a row made from a ring is the DM's own ("dm") whatever its kind.
      await createRegionTracked({ ...insert, derived_from: outline ? "dm" : "floodfill" });
      return;
    }
    await createRegionTracked({ ...insert, derived_from: "dm" });
  }

  /** The outline of the found room that holds exactly these squares, if the walls make one. */
  function outlineOfCells(cells: readonly CellKey[]): GridPoint[] | null {
    const want = new Set(cells);
    const room = derived().find((s) => s.cells.length === want.size && s.cells.every((c) => want.has(c)));
    return room ? room.outline : null;
  }

  // ── Found rooms: the walls' rooms, in the list before they are rows (#1125 frame 19) ──────────────────

  const spaceNames = computed(() => new Map((childLocations.value ?? []).map((l) => [l.id, l.name])));
  /** Every line of the Zoning list: rooms (found, then bound), then the other zones. */
  const zoning = computed<ZoningEntry[]>(() => zoningList(derived(), regions.value, spaceNames.value));
  /** Found rooms with no row, dressed as rooms so the canvas draws them and a click can pick one. */
  const foundRegions = computed<LocationMapRegion[]>(() => {
    const site = siteId.value;
    if (!site) return [];
    return zoning.value.flatMap((e) => (e.kind === "found" ? [foundRegionOf(e.space, site)] : []));
  });
  const foundCount = computed(() => derived().length);

  /** The closed rings the walls alone make (with at least one square in them), and how many of those Assign would
   *  still make a room of. The rule is Assign's own (`findCoveringSpace`): a ring a room already reaches into is that
   *  room's, since a click there selects it and makes no second one. Counting it as waiting would ask the DM for a
   *  click that does nothing. */
  const wallRings = computed<{ rings: number; unassigned: number }>(() => {
    const l = layers();
    if (!l) return { rings: 0, unassigned: 0 };
    const inRooms = new Set(regions.value.filter((r) => r.region_role === "space").flatMap((r) => r.cells));
    const faces = wallFaces(l).filter((f) => f.cells.length > 0);
    return { rings: faces.length, unassigned: faces.filter((f) => !f.cells.some((c) => inRooms.has(c))).length };
  });

  type RowEdit = Pick<LocationMapRegionInsert, "label" | "space_location_id" | "cells" | "vertices">;

  /** The DM changes a room: a found one with no row becomes one stamped `dm`; an existing row gets `derived_from:
   *  'dm'` in the SAME update (`dmEdit`), because without it Find again would redraw a room they touched. */
  async function editEntry(entry: ZoningEntry, edit: RowEdit): Promise<LocationMapRegion | null> {
    if (!siteId.value) return null;
    try {
      if (entry.kind === "found") return await createRegion.mutateAsync(materializeFound(entry.space, siteId.value, edit));
      return await updateRegion.mutateAsync({ id: entry.region.id, update: dmEdit(edit) });
    } catch (err) {
      toastError(fromError(err));
      return null;
    }
  }

  const renameEntry = (entry: ZoningEntry, label: string | null) => editEntry(entry, { label });
  const bindEntry = (entry: ZoningEntry, spaceId: string | null) => editEntry(entry, { space_location_id: spaceId });

  /** Writes a found room as a row the walls still own (untouched, so Find again may redraw it), to trace into. */
  async function materializeEntry(entry: ZoningEntry & { kind: "found" }): Promise<LocationMapRegion | null> {
    if (!siteId.value) return null;
    try {
      return await createRegion.mutateAsync(materializeFound(entry.space, siteId.value));
    } catch (err) {
      toastError(fromError(err));
      return null;
    }
  }

  /** Makes a region the one being traced. A found room's canvas id has no row yet: write it first, then select. */
  async function selectRegion(id: string | null): Promise<void> {
    const key = id === null ? null : foundSpaceKey(id);
    if (key === null) {
      activeRegionId.value = id;
      return;
    }
    const entry = zoning.value.find((e) => e.kind === "found" && e.space.key === key);
    if (!entry || entry.kind !== "found") return;
    const created = await materializeEntry(entry);
    if (created) activeRegionId.value = created.id;
  }

  /** Find again: redraw only the rooms the DM never touched, from the walls as they are now. */
  async function findAgainNow(): Promise<number> {
    const updates = findAgain(derived(), regions.value, spaceNames.value);
    try {
      await Promise.all(updates.map((u) => updateRegion.mutateAsync(u)));
    } catch (err) {
      toastError(fromError(err));
    }
    return updates.length;
  }

  // ── Door mutations ────────────────────────────────────────────────────

  /** What putting a door on `site` writes: the key the row carries, its line (null for a grid key, as the database
   *  holds them together), and the Drawing's own undo for the cut that made it (null when nothing was cut). */
  interface DoorWritten {
    key: string;
    segment: DoorSegment | null;
    history: DrawingHistory | null;
  }

  /** The Drawing half of a door: a grid edge writes nothing, a wall or a free line is cut into the Drawing through the
   *  editor so it autosaves and undoes with the row. Null (and a toast) when the Drawing cannot take it. */
  function writeDoorIntoDrawing(site: DoorSite, kind: "door" | "arch"): DoorWritten | null {
    if (site.kind === "edge") return { key: site.edgeKey, segment: null, history: null };
    const editor = drawingEditor.value;
    if (!editor) {
      toastError("The drawing is not ready yet. Try the door again in a moment.");
      return null;
    }
    const type = doorWallTypeOf(kind);
    const newKey = (): string => crypto.randomUUID();
    const result: { doorId: string | null; line: DoorSegment | null } = { doorId: null, line: null };
    const history = editor.editDrawing((l) => {
      const cut =
        site.kind === "wall"
          ? cutDoorIntoWall(l.walls, site.wallId, site.from, site.to, newKey, type)
          : addFreeDoor(l.walls, site.from, site.to, newKey, type);
      if (!cut) return null;
      result.doorId = cut.doorId;
      const door = cut.walls[cut.doorId]!;
      result.line = [[door.a[0], door.a[1]], [door.b[0], door.b[1]]];
      return { ...l, walls: cut.walls };
    });
    if (!history || result.doorId === null) {
      toastError("That wall is no longer there, so no door was cut.");
      return null;
    }
    // The row holds a line only for a wall-uuid key: the key is the grid edge itself when a grid wall was switched.
    return { key: result.doorId, segment: isGridEdgeKey(result.doorId) ? null : result.line, history };
  }

  /** Places a new door on `site` with the given (already-resolved) endpoints: the Drawing's cut and the way out in one
   *  undo step. */
  function placeDoorAt(site: DoorSite, fromLocationId: string, toLocationId: string | null): void {
    const written = writeDoorIntoDrawing(site, newDoorKind.value);
    if (!written) return;
    const { key, segment, history } = written;
    const insert = {
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      door_kind: newDoorKind.value,
      edge_key: key,
      ...(segment ? { segment } : {}),
      derived_from: "dm" as const,
    };
    createDoor.mutate(insert, {
      onSuccess: (created) => {
        const handle: PlanEntityHandle = { id: created.id };
        // A row whose wall is missing is the bad state, a door wall without its row is not (publish makes the row),
        // so the row goes first on the way out and comes last on the way in.
        undo.push({
          label: "place door",
          undo: async () => { await deleteDoor.mutateAsync(handle.id); history?.undo(); },
          redo: async () => { history?.redo(); const recreated = await createDoor.mutateAsync(insert); handle.id = recreated.id; },
        });
      },
      onError: (err) => {
        history?.undo();
        toastError(fromError(err));
      },
    });
  }

  /** "Place it" from the ready check (#1125 frame 08): the next edge clicked with the door tool takes this listed door
   *  (it keeps its two ends) instead of making a new one. Leaving the door tool lets go of it. */
  function armDoorPlacement(doorId: string): void {
    placingDoorId.value = doorId;
    planTool.value = "door";
  }
  watch(planTool, (tool) => {
    if (tool === "door") return;
    placingDoorId.value = null;
    pendingDoor.value = null;
  });

  /** Puts the armed listed door on `site` and says whether there was one. It keeps the two ends it was listed
   *  with, so the Door tool asks this before it looks for rooms beside the door: a listed door is never refused
   *  for landing where no zone is traced (#1195). */
  function placeArmedDoorOn(site: DoorSite): boolean {
    const arrivingId = placingDoorId.value;
    if (!arrivingId) return false;
    placingDoorId.value = null;
    putListedDoorOnSite(arrivingId, site);
    return true;
  }

  // ── A door where the plan cannot tell its rooms (#1195) ─────────────────
  // On a picture-only map the zones may sit well clear of the doorway. The Door tool then holds the edge here and
  // the options slip asks "connects which rooms?". The answer is authored: `resolveDoorEndpoints` reads an edge
  // with no room in reach as "leave this door alone", so the chosen ends stay until a zone grows up to the door.

  /** The site's rooms by name: what the pending door's two ends are picked from. */
  const spaceOptions = computed(() =>
    (childLocations.value ?? []).map((l) => ({ id: l.id, name: l.name })).sort((a, b) => a.name.localeCompare(b.name)),
  );

  function askDoorEnds(site: DoorSite): void {
    pendingDoor.value = site;
  }

  /** The DM's answer: only now is the Drawing cut, so cancelling leaves it untouched. */
  function placePendingDoor(fromLocationId: string, toLocationId: string | null): void {
    const site = pendingDoor.value;
    if (!site) return;
    pendingDoor.value = null;
    placeDoorAt(site, fromLocationId, toLocationId);
  }

  function cancelPendingDoor(): void {
    pendingDoor.value = null;
  }

  function putListedDoorOnSite(doorId: string, site: DoorSite): void {
    // The row keeps its kind (only its place is written), so the Drawing's wall takes the row's kind, not the chip's.
    const listed = ways.value.find((w) => w.id === doorId);
    if (!listed) return;
    // A stair, shaft or portal has no wall type of its own, so for those the chip still decides how the wall is cut.
    const kind = listed.door_kind === "door" || listed.door_kind === "arch" ? listed.door_kind : newDoorKind.value;
    const written = writeDoorIntoDrawing(site, kind);
    if (!written) return;
    const { key, segment, history } = written;
    const handle: PlanEntityHandle = { id: doorId };
    const placed = { edge_key: key, segment };
    const unplaced = { edge_key: null, segment: null };
    updateDoor.mutate(
      { id: doorId, update: placed },
      {
        onSuccess: () => {
          undo.push({
            label: "place door",
            undo: async () => { await updateDoor.mutateAsync({ id: handle.id, update: unplaced }); history?.undo(); },
            redo: async () => { history?.redo(); await updateDoor.mutateAsync({ id: handle.id, update: placed }); },
          });
        },
        onError: (err) => {
          history?.undo();
          toastError(fromError(err));
        },
      },
    );
  }

  /** Runs `change` on the Drawing's walls for the door whose key is `key`, as one undoable edit; null when the Drawing
   *  has no such door (a way that is only a row) or no editor is bound. */
  function editDoorWall(key: string | null, change: (walls: DungeonMapLayers["walls"], key: string) => DungeonMapLayers["walls"] | null): DrawingHistory | null {
    const editor = drawingEditor.value;
    if (!editor || key === null) return null;
    return editor.editDrawing((l) => {
      const walls = change(l.walls, key);
      return walls ? { ...l, walls } : null;
    });
  }

  /** A click on a placed door cycles the only two kinds a 2D plan door
   *  distinguishes — `door` ↔ `arch`, mirroring the Atlas's own door tool. */
  function cycleDoorKind(door: SiteDoorWithSpaces): void {
    const before = door.door_kind;
    const after: DoorKind = before === "arch" ? "door" : "arch";
    const handle: PlanEntityHandle = { id: door.id };
    updateDoor.mutate(
      { id: door.id, update: { door_kind: after } },
      {
        onSuccess: () => {
          // A door the Drawing also holds changes with its row, in the same step.
          const history = editDoorWall(door.edge_key, (walls, key) => setDoorWallType(walls, key, doorWallTypeOf(after)));
          undo.push({
            label: "cycle door kind",
            undo: async () => { await updateDoor.mutateAsync({ id: handle.id, update: { door_kind: before } }); history?.undo(); },
            redo: async () => { history?.redo(); await updateDoor.mutateAsync({ id: handle.id, update: { door_kind: after } }); },
          });
        },
        onError: (err) => toastError(fromError(err)),
      },
    );
  }

  /** Alt-click removes a door. Its undo is a faithful recreate — a door has
   *  no geometry beyond its own row, so nothing is lost the way a pen ring's
   *  diagonal would be. */
  function removeDoor(door: SiteDoorWithSpaces): void {
    const insert = {
      from_location_id: door.from_location_id,
      to_location_id: door.to_location_id,
      label: door.label,
      is_one_way: door.is_one_way,
      starts_locked: door.starts_locked,
      lock_note: door.lock_note,
      is_secret: door.is_secret,
      sort_order: door.sort_order,
      door_kind: door.door_kind,
      edge_key: door.edge_key,
      // A wall-uuid door must come back with its line or the database refuses it (CHECK on edge_key/segment).
      segment: door.segment,
      derived_from: door.derived_from,
      dungeon_feature_id: door.dungeon_feature_id,
      library_dungeon_feature_id: door.library_dungeon_feature_id,
    };
    const handle: PlanEntityHandle = { id: door.id };
    deleteDoor.mutate(door.id, {
      onSuccess: () => {
        // The Drawing's door goes with its way: a cut one is a plain wall again, a free-standing one is gone.
        const history = editDoorWall(door.edge_key, removeDoorWall);
        undo.push({
          label: "remove door",
          undo: async () => { history?.undo(); const recreated = await createDoor.mutateAsync(insert); handle.id = recreated.id; },
          redo: async () => { await deleteDoor.mutateAsync(handle.id); history?.redo(); },
        });
      },
      onError: (err) => toastError(fromError(err)),
    });
  }

  return {
    regions,
    ways,
    planTool,
    traceTool,
    brushRadius,
    templateShape,
    zoneKind,
    zoneLabel,
    activeRegionId,
    activeRegion,
    undo,
    isBusy,
    startNew,
    zoning,
    foundRegions,
    foundCount,
    wallRings,
    spaceNames,
    renameEntry,
    bindEntry,
    selectRegion,
    findAgainNow,
    commitCells,
    regionStateNow,
    eraseCells,
    commitRing,
    commitTemplate,
    assignArea,
    placingDoorId,
    armDoorPlacement,
    placeArmedDoorOn,
    placeDoorAt,
    pendingDoor,
    newDoorKind,
    doorWidth,
    bindDrawingEditor,
    spaceOptions,
    askDoorEnds,
    placePendingDoor,
    cancelPendingDoor,
    cycleDoorKind,
    removeDoor,
  };
}

export type UsePlanPaletteReturn = ReturnType<typeof usePlanPalette>;
