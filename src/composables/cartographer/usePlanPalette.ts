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

import { computed, ref, type ComputedRef } from "vue";
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
  type RegionRole,
  type ZoneKind,
} from "@/types/locationMapRegion.types";

export type PlanTool = "space" | "zone" | "door" | "claim";

export const PLAN_TOOLS: readonly { id: PlanTool; label: string }[] = [
  { id: "space", label: "Space" },
  { id: "zone", label: "Zone" },
  { id: "door", label: "Door" },
  { id: "claim", label: "Claim" },
];

export { TEMPLATE_SHAPES, TEMPLATE_SHAPE_LABELS, ZONE_KINDS, ZONE_KIND_LABELS };
export type { TraceTool };

/** A one-field mutable box — see the module docblock for why a CREATE's undo
 *  lineage needs one instead of a plain string. */
export interface EntityRef {
  id: string;
}

export function usePlanPalette(siteId: ComputedRef<string | null>) {
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
  const planTool = ref<PlanTool>("space");
  const traceTool = ref<TraceTool>("paint");
  // Shared singleton with the Atlas's own template picker (`useRegionPen.ts`)
  // — deliberate: "only one tracing session can be live at a time" already
  // covers a DM being in the Cartographer instead of the Atlas, not just
  // between the Atlas's own siblings.
  const templateShape = useTemplateShape();
  const zoneKind = ref<ZoneKind>("terrain");
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
  async function createRegionTracked(insert: LocationMapRegionInsert): Promise<{ region: LocationMapRegion; handle: EntityRef } | null> {
    if (!siteId.value) return null;
    try {
      const created = await createRegion.mutateAsync(insert);
      const handle: EntityRef = { id: created.id };
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

  /** Starts a fresh, empty region of the given role and makes it active —
   *  the Plan's equivalent of `SiteMapRegionList`'s "+ New space" button.
   *  Deliberately the ONLY way to start one: nothing here auto-creates on
   *  tool selection or on a bare click with nothing active (either would
   *  create a DB row the instant a DM opens Build with the Plan's default
   *  tool already "Space", or would make a plain click ambiguous between
   *  "start a shape" and "select the existing unbound one under the
   *  cursor" — see `usePlanCanvasTools.ts`'s `onPointerDown`, whose bare
   *  click always means the latter). The palette's own "New" button is
   *  `startNewSpace`/`startNewZone`'s only caller. */
  async function startNew(role: RegionRole): Promise<LocationMapRegion | null> {
    if (!siteId.value) return null;
    const insert: LocationMapRegionInsert =
      role === "zone"
        ? { site_location_id: siteId.value, region_role: "zone", zone_kind: zoneKind.value, label: zoneLabel.value.trim() || null }
        : { site_location_id: siteId.value, region_role: "space" };
    const result = await createRegionTracked(insert);
    if (!result) return null;
    activeRegionId.value = result.handle.id;
    return result.region;
  }

  const startNewSpace = () => startNew("space");
  const startNewZone = () => startNew("zone");

  /** Fire-and-forget cell-set commit for the brush/paint trace tool —
   *  `useRegionPointer`'s `commitCells` contract. Captures the region's
   *  pre-stroke cells for the undo entry before the mutation lands. */
  function commitCells(regionId: string, cells: CellKey[]): void {
    const prior = regionStateNow(regionId);
    localRegionState.set(regionId, { vertices: prior.vertices, cells });
    const handle: EntityRef = { id: regionId };
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

  /** Pen-ring commit — `useRegionPointer`'s `commitRing` contract. Must
   *  reject on failure (the draft-close gesture puts its ring back). */
  async function commitRing(regionId: string, ring: GridPoint[]): Promise<void> {
    const before = regionStateNow(regionId);
    const after = { vertices: ring, cells: cellsInsideRing(ring) };
    const handle: EntityRef = { id: regionId };
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
    const handle: EntityRef = { id: regionId };
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
    const ok = await confirm("Painting converts this pen-traced shape to cells — the diagonal edges are lost. Continue?", { danger: true });
    if (!ok) return false;
    const before = { vertices: region.vertices, cells: region.cells };
    const after = { vertices: null, cells: region.cells };
    const handle: EntityRef = { id: region.id };
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

  /** An existing space region that already covers some of `cells` — claiming
   *  the same floor twice (or floor already traced as a Space by hand) must
   *  select it rather than insert a second, overlapping row (#884 review
   *  finding 5). Any overlap counts as "already covered": a repeat claim's
   *  flood fill returns the identical connected component, and a hand-traced
   *  space over the same floor need not match cell-for-cell to be the same
   *  room. */
  function findCoveringSpace(cells: readonly CellKey[]): LocationMapRegion | null {
    const claimed = new Set(cells);
    return regions.value.find((r) => r.region_role === "space" && r.cells.some((c) => claimed.has(c))) ?? null;
  }

  /** The Claim tool (#884): a floodfilled floor region off the Drawing,
   *  written straight to a brand-new unbound space region — "the DM stops
   *  re-tracing by hand what they just drew." `derived_from: 'floodfill'` is
   *  the provenance this exact shape exists for — not DM ink, algorithmically
   *  read off the painted floor, same as Publish's own detection. */
  async function claimFloorRegion(cells: CellKey[]): Promise<void> {
    if (!siteId.value || cells.length === 0) return;
    const covering = findCoveringSpace(cells);
    if (covering) {
      activeRegionId.value = covering.id;
      return;
    }
    const insert: LocationMapRegionInsert = {
      site_location_id: siteId.value,
      region_role: "space",
      cells,
      derived_from: "floodfill",
    };
    await createRegionTracked(insert);
  }

  // ── Door mutations ────────────────────────────────────────────────────

  function existingDoorAtEdge(edgeKey: SourceEdgeKey): SiteDoorWithSpaces | null {
    return ways.value.find((w) => w.edge_key === edgeKey) ?? null;
  }

  /** Places a new door on `edgeKey` with the given (already-resolved)
   *  endpoints. */
  function placeDoorAt(edgeKey: SourceEdgeKey, fromLocationId: string, toLocationId: string | null): void {
    const insert = {
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      door_kind: "door" as DoorKind,
      edge_key: edgeKey,
      derived_from: "dm" as const,
    };
    createDoor.mutate(insert, {
      onSuccess: (created) => {
        const handle: EntityRef = { id: created.id };
        undo.push({
          label: "place door",
          undo: async () => { await deleteDoor.mutateAsync(handle.id); },
          redo: async () => { const recreated = await createDoor.mutateAsync(insert); handle.id = recreated.id; },
        });
      },
      onError: (err) => toastError(fromError(err)),
    });
  }

  /** A click on a placed door cycles the only two kinds a 2D plan edge
   *  distinguishes — `door` ↔ `arch`, mirroring the Atlas's own door tool. */
  function cycleDoorKind(door: SiteDoorWithSpaces): void {
    const before = door.door_kind;
    const after: DoorKind = before === "arch" ? "door" : "arch";
    const handle: EntityRef = { id: door.id };
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
    };
    const handle: EntityRef = { id: door.id };
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
    startNewSpace,
    startNewZone,
    commitCells,
    commitRing,
    commitTemplate,
    confirmConvert,
    claimFloorRegion,
    existingDoorAtEdge,
    placeDoorAt,
    cycleDoorKind,
    removeDoor,
  };
}

export type UsePlanPaletteReturn = ReturnType<typeof usePlanPalette>;
