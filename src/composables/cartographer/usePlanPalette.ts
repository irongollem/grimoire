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

import { computed, ref, watch, type ComputedRef } from "vue";
import { useConfirm } from "@/composables/useConfirm";
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
import { TEMPLATE_SHAPES, TEMPLATE_SHAPE_LABELS, useTemplateShape } from "@/composables/locations/useRegionPen";
import { usePlanUndoStack } from "@/composables/cartographer/usePlanUndoStack";
import type { DerivedSpace } from "@/cartographer/structure.types";
import { findAgain, materializeFound, zoningList, type ZoningEntry } from "@/lib/locations/foundRooms";
import { foundRegionOf, foundSpaceKey } from "@/lib/locations/zoningRows";
import { emptyZoneInsert } from "@/lib/locations/zones";
import { cellsInsideRing } from "@/lib/locations/polygon";
import type { TraceTool } from "@/lib/locations/polygon";
import type { CellKey } from "@/types/dungeonMap.types";
import type { DoorKind, SourceEdgeKey } from "@/types/locationDoor.types";
import {
  ZONE_KINDS,
  ZONE_KIND_LABELS,
  type GridPoint,
  type LocationMapRegion,
  type LocationMapRegionInsert,
  type ZoneKind,
} from "@/types/locationMapRegion.types";

/** Zoning's four tools (#1125 frame 19). The old Space tool is the Zone tool with the Room kind. */
export type PlanTool = "zone" | "door" | "fill" | "erase";

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
];

/** Each tool's key, the letters the Drawing's rail also uses for its own tools (the tab decides which set is live). */
export const PLAN_TOOLS: readonly { id: PlanTool; label: string; shortcut: string }[] = [
  { id: "zone", label: "Zone", shortcut: "z" },
  { id: "door", label: "Door", shortcut: "d" },
  { id: "fill", label: "Fill", shortcut: "f" },
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

export { TEMPLATE_SHAPES, TEMPLATE_SHAPE_LABELS, ZONE_KINDS, ZONE_KIND_LABELS };
export type { TraceTool };

/** A one-field mutable box — see the module docblock for why a CREATE's undo
 *  lineage needs one instead of a plain string. */
export interface PlanEntityHandle {
  id: string;
}

/**
 * @param derived the rooms the Drawing's walls make right now; they are in the Zoning list from the moment it opens
 *   (#1125 frame 19), written as rows only when the DM acts on one.
 */
export function usePlanPalette(siteId: ComputedRef<string | null>, derived: () => readonly DerivedSpace[] = () => []) {
  const { error: toastError, fromError } = useToast();
  const { confirm } = useConfirm();

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
  /** A listed door waiting for its edge (see `armDoorPlacement`). */
  const placingDoorId = ref<string | null>(null);
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

  /** Fire-and-forget cell-set commit for the brush/paint trace tool —
   *  `useRegionPointer`'s `commitCells` contract. Captures the region's
   *  pre-stroke cells for the undo entry before the mutation lands. */
  function commitCells(regionId: string, cells: CellKey[]): void {
    const prior = regionStateNow(regionId);
    localRegionState.set(regionId, { vertices: prior.vertices, cells });
    const handle: PlanEntityHandle = { id: regionId };
    updateRegion.mutate(
      { id: regionId, update: dmEdit({ cells }) },
      {
        onSuccess: () => {
          undo.push({
            label: "paint stroke",
            undo: async () => {
              localRegionState.set(handle.id, { vertices: prior.vertices, cells: prior.cells });
              await updateRegion.mutateAsync({ id: handle.id, update: dmEdit({ cells: prior.cells }) });
            },
            redo: async () => {
              localRegionState.set(handle.id, { vertices: prior.vertices, cells });
              await updateRegion.mutateAsync({ id: handle.id, update: dmEdit({ cells }) });
            },
          });
        },
        onError: (err) => toastError(fromError(err)),
      },
    );
  }

  /** The Erase tool's commit: every region the stroke crossed loses the
   *  touched cells. Any region, bound or not, active or not: the trace
   *  brush's own erase only reaches the shape being traced, which left a
   *  bound room's area with no way to shrink it from the canvas. A room
   *  whose area empties keeps its Atlas page, like an orphan on publish. */
  function eraseCells(erased: ReadonlySet<CellKey>): void {
    const current = regions.value.map((region) => ({ ...region, cells: regionStateNow(region.id).cells }));
    for (const [regionId, cells] of eraseFromRegions(current, erased)) commitCells(regionId, cells);
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

  /** The one-way vertices→cells conversion `useRegionPointer` needs before a
   *  paint stroke can start on a pen-traced region — confirmed once, same
   *  wording the Atlas uses. */
  async function confirmConvert(region: LocationMapRegion): Promise<boolean> {
    const ok = await confirm("Painting converts this pen-traced shape to cells. The diagonal edges are lost. Continue?", { danger: true });
    if (!ok) return false;
    const before = { vertices: region.vertices, cells: region.cells };
    const after = { vertices: null, cells: region.cells };
    const handle: PlanEntityHandle = { id: region.id };
    localRegionState.set(region.id, after);
    try {
      await updateRegion.mutateAsync({ id: region.id, update: dmEdit(after) });
      undo.push({
        label: "convert to cells",
        undo: async () => {
          localRegionState.set(handle.id, before);
          await updateRegion.mutateAsync({ id: handle.id, update: dmEdit(before) });
        },
        redo: async () => {
          localRegionState.set(handle.id, after);
          await updateRegion.mutateAsync({ id: handle.id, update: dmEdit(after) });
        },
      });
      return true;
    } catch (err) {
      localRegionState.set(region.id, before);
      toastError(fromError(err));
      return false;
    }
  }

  /** An existing space region that already covers some of `cells`: filling the same floor twice (or floor already
   *  traced as a room by hand) must select it rather than insert a second, overlapping row (#884 review finding 5).
   *  Any overlap counts as "already covered": a repeat fill returns the identical connected component, and a
   *  hand-traced room over the same floor need not match cell-for-cell to be the same room. */
  function findCoveringSpace(cells: readonly CellKey[]): LocationMapRegion | null {
    const claimed = new Set(cells);
    return regions.value.find((r) => r.region_role === "space" && r.cells.some((c) => claimed.has(c))) ?? null;
  }

  /** The Fill tool: pours the chosen kind over a floored region of the Drawing, up to its walls, "so the DM stops
   *  re-tracing by hand what they just drew." A Room is the walls' own room (`derived_from: 'floodfill'`, the
   *  provenance this exact shape exists for); any other kind is the DM's ink. Zones may overlap a room, so only a
   *  Room is held to the no-duplicates rule. */
  async function fillFloorRegion(cells: CellKey[]): Promise<void> {
    if (!siteId.value || cells.length === 0) return;
    if (zoneKind.value === "room") {
      const covering = findCoveringSpace(cells);
      if (covering) {
        activeRegionId.value = covering.id;
        return;
      }
      await createRegionTracked({ ...newInsert(siteId.value, cells), derived_from: "floodfill" });
      return;
    }
    await createRegionTracked({ ...newInsert(siteId.value, cells), derived_from: "dm" });
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

  function existingDoorAtEdge(edgeKey: SourceEdgeKey): SiteDoorWithSpaces | null {
    return ways.value.find((w) => w.edge_key === edgeKey) ?? null;
  }

  /** Places a new door on `edgeKey` with the given (already-resolved)
   *  endpoints. */
  function placeDoorAt(edgeKey: SourceEdgeKey, fromLocationId: string, toLocationId: string | null): void {
    const arrivingId = placingDoorId.value;
    if (arrivingId) {
      placingDoorId.value = null;
      putListedDoorOnEdge(arrivingId, edgeKey);
      return;
    }
    const insert = {
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      door_kind: "door" as DoorKind,
      edge_key: edgeKey,
      derived_from: "dm" as const,
    };
    createDoor.mutate(insert, {
      onSuccess: (created) => {
        const handle: PlanEntityHandle = { id: created.id };
        undo.push({
          label: "place door",
          undo: async () => { await deleteDoor.mutateAsync(handle.id); },
          redo: async () => { const recreated = await createDoor.mutateAsync(insert); handle.id = recreated.id; },
        });
      },
      onError: (err) => toastError(fromError(err)),
    });
  }

  /** "Place it" from the ready check (#1125 frame 08): the next edge clicked with the door tool takes this listed door
   *  (it keeps its two ends) instead of making a new one. Leaving the door tool lets go of it. */
  function armDoorPlacement(doorId: string): void {
    placingDoorId.value = doorId;
    planTool.value = "door";
  }
  watch(planTool, (tool) => {
    if (tool !== "door") placingDoorId.value = null;
  });

  function putListedDoorOnEdge(doorId: string, edgeKey: SourceEdgeKey): void {
    const handle: PlanEntityHandle = { id: doorId };
    updateDoor.mutate(
      { id: doorId, update: { edge_key: edgeKey } },
      {
        onSuccess: () => {
          undo.push({
            label: "place door",
            undo: async () => { await updateDoor.mutateAsync({ id: handle.id, update: { edge_key: null } }); },
            redo: async () => { await updateDoor.mutateAsync({ id: handle.id, update: { edge_key: edgeKey } }); },
          });
        },
        onError: (err) => toastError(fromError(err)),
      },
    );
  }

  /** A click on a placed door cycles the only two kinds a 2D plan edge
   *  distinguishes — `door` ↔ `arch`, mirroring the Atlas's own door tool. */
  function cycleDoorKind(door: SiteDoorWithSpaces): void {
    const before = door.door_kind;
    const after: DoorKind = before === "arch" ? "door" : "arch";
    const handle: PlanEntityHandle = { id: door.id };
    updateDoor.mutate(
      { id: door.id, update: { door_kind: after } },
      {
        onSuccess: () => {
          undo.push({
            label: "cycle door kind",
            undo: async () => { await updateDoor.mutateAsync({ id: handle.id, update: { door_kind: before } }); },
            redo: async () => { await updateDoor.mutateAsync({ id: handle.id, update: { door_kind: after } }); },
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
      derived_from: door.derived_from,
      dungeon_feature_id: door.dungeon_feature_id,
      library_dungeon_feature_id: door.library_dungeon_feature_id,
    };
    const handle: PlanEntityHandle = { id: door.id };
    deleteDoor.mutate(door.id, {
      onSuccess: () => {
        undo.push({
          label: "remove door",
          undo: async () => { const recreated = await createDoor.mutateAsync(insert); handle.id = recreated.id; },
          redo: async () => { await deleteDoor.mutateAsync(handle.id); },
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
    spaceNames,
    renameEntry,
    bindEntry,
    selectRegion,
    findAgainNow,
    commitCells,
    eraseCells,
    commitRing,
    commitTemplate,
    confirmConvert,
    fillFloorRegion,
    existingDoorAtEdge,
    placingDoorId,
    armDoorPlacement,
    placeDoorAt,
    cycleDoorKind,
    removeDoor,
  };
}

export type UsePlanPaletteReturn = ReturnType<typeof usePlanPalette>;
