// Publish to Atlas — the write path (#868, epic #868, S10, frame 05).
//
// "It is a diff, not an import" (frame 05): `planPublish` (lib/locations/publish.ts)
// already computed the reconciliation; this composable owns the reactive
// inputs that feed it, the review modal's open/close and site-picker state,
// and `publish()`, which applies the plan in the order frame 05's footer
// describes and never deletes anything.
//
// The modal only exists once the map has been saved at least once — `map()`
// mirrors `useMapExport`'s `buildMap` convention (a getter merging the
// editor's in-progress layers/metadata into the loaded row) precisely
// because a re-publish must bake whatever is on the canvas right now, not
// only what was last saved. A brand-new, never-saved map has no id to set
// `source_map_id` to, so `map()` returning null there is what keeps the
// button meaningfully disabled rather than a special case.

import { computed, ref, watch } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { useRoute, useRouter } from "vue-router";
import { bakeMap, computeBakedDimensions } from "@/cartographer/bake";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { PackCategory } from "@/cartographer/packSchema";
import { uploadToBucket } from "@/lib/storage";
import { getCurrentUser } from "@/lib/supabase";
import { bindableSpaces, isSiteType } from "@/lib/locations/tiers";
import {
  planPublish,
  isCreatedRef,
  createdRefKey,
  type PublishInputs,
  type PublishPlan,
  type SpaceRef,
} from "@/lib/locations/publish";
import type { DerivedStructure } from "@/cartographer/structure.types";
import type { CellKey, DungeonMap } from "@/types/dungeonMap.types";
import type { Location } from "@/types/location.types";
import {
  useAllLocations,
  useLocations,
  useLocation,
  useCreateLocation,
  useUpdateLocation,
  useUpdateLocationMapUrl,
  useUpdateLocationGridCalibration,
} from "@/composables/locations/useLocations";
import {
  useLocationMapRegions,
  useCreateLocationMapRegion,
  useUpdateLocationMapRegion,
} from "@/composables/locations/useLocationMapRegions";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useCreateLocationDoor, useUpdateLocationDoor } from "@/composables/locations/useLocationDoors";
import { useSitePlacements } from "@/composables/locations/useSitePlacements";
import { useCreateLocationPlacement, useUpdateEntityPlacement } from "@/composables/locations/useLocationPlacements";
import { usePublishedSites } from "@/composables/cartographer/usePublishedSites";
import type { LocationPlacement } from "@/types/locationPlacement.types";

/** "Who am I publishing to" — the modal's header chip + site picker. */
export interface PublishSiteContext {
  options: { id: string; name: string }[];
  target: Location | null;
  spaceNameById: Map<string, string>;
  stairTargetOptions: { id: string; name: string }[];
}

/** "What will happen" — the modal's plan + write-in-progress state. */
export interface PublishReview {
  plan: PublishPlan | null;
  bakedDims: { cols: number; rows: number; originCellX: number; originCellY: number } | null;
  mapRev: number;
  publishing: boolean;
  error: string | null;
}

// A placement with no cell yet (added from the room sheet) that a re-publish
// can finally anchor — publish.ts's "reanchor, of the cell not the room"
// branch. It doesn't carry the resolved cell forward on the change object
// (the plan only decides *that* a write is due, not the value), so the write
// step re-derives it here with the identical matching rule: same entity,
// landing in the same room the placement is already in.
function findReanchorCellKey(
  placement: LocationPlacement,
  derived: DerivedStructure,
  spaceKeyToLocationId: ReadonlyMap<string, string>,
  siteId: string,
): CellKey | null {
  const entityId = placement.trap_id ?? placement.dungeon_feature_id ?? null;
  if (!entityId) return null;
  const roomOf = (spaceKey: string | null): string =>
    spaceKey === null ? siteId : (spaceKeyToLocationId.get(spaceKey) ?? siteId);
  const link = derived.links.find((l) => {
    if (l.metadata.trap_id !== entityId && l.metadata.feature_id !== entityId) return false;
    return roomOf(l.spaceKey) === placement.location_id;
  });
  return link?.cellKey ?? null;
}

/**
 * Every mutation here rethrows Supabase's raw `{ code, message, details,
 * hint }` response body (`if (error) throw error;`, not `.throwOnError()`),
 * which is never actually an `Error` instance even though the client's own
 * `PostgrestError` class extends one — so `e instanceof Error` misses it and
 * a real, actionable failure (a quota trigger's "Upgrade to Pro DM to create
 * more locations", an RLS denial, a check-constraint violation) reads to the
 * DM as a bare "Something went wrong". `useToast`'s `fromError` has the same
 * gap; this is scoped to this file rather than widened there.
 */
function publishErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Something went wrong";
}

export function useMapPublish(opts: {
  /** The current map, merged with in-progress layers/metadata edits, or null while unloaded — same contract as useMapExport's buildMap. */
  map: () => DungeonMap | null;
  runtimes: () => Map<string, TilePackRuntime>;
  glyphs: () => Record<CellKey, PackCategory>;
  structure: () => DerivedStructure;
}) {
  const route = useRoute();
  const router = useRouter();
  const queryClient = useQueryClient();

  const open = ref(false);
  const targetSiteId = ref("");
  /** DM-resolved far ends for stairs the drawing left unresolved — cellKey → target space id.
   *  Scoped to whichever site `targetSiteId` currently names: a stair target is a room id
   *  from the site being published, so it has no meaning once the picker rebinds
   *  `targetSiteId` to a different one. See the watches below that clear it on a site
   *  change or an unpublished close, so a resolution never carries into a plan for
   *  another site (which `createDoor` would then fail against the door-endpoint guard). */
  const stairTargets = ref<Record<CellKey, string>>({});
  const publishing = ref(false);
  const error = ref<string | null>(null);

  const mapId = computed(() => opts.map()?.id ?? null);
  const { data: publishedSitesData } = usePublishedSites(computed(() => mapId.value ?? ""));

  // Every site-tier location, for the picker shown when nothing has been
  // published yet, and for the header's "Change place…".
  const { data: allLocationsData } = useAllLocations();
  const siteOptions = computed(() =>
    (allLocationsData.value ?? [])
      .filter((l) => isSiteType(l.location_type))
      .map((l) => ({ id: l.id, name: l.name })),
  );

  // Preselect from `?publishTo=` once the map has loaded (consumed once —
  // the query is stripped straight back out so a later remount doesn't
  // reopen the modal), else the first place this map already publishes to.
  let consumedPublishToQuery = false;
  watch(
    () => [mapId.value, route.query.publishTo, publishedSitesData.value] as const,
    ([id, publishTo, published]) => {
      if (!id) return;
      if (typeof publishTo === "string" && publishTo && !consumedPublishToQuery) {
        consumedPublishToQuery = true;
        targetSiteId.value = publishTo;
        open.value = true;
        const rest = { ...route.query };
        delete rest.publishTo;
        void router.replace({ query: rest });
        return;
      }
      if (!targetSiteId.value && published && published.length > 0) {
        targetSiteId.value = published[0]!.id;
      }
    },
    { immediate: true },
  );

  // Changing target site invalidates any stair resolutions the DM already
  // made — they name rooms in the *old* site. Closing the modal without
  // publishing clears them too (a successful publish already does, below;
  // this covers Cancel/Escape so a stale resolution can't survive to the
  // next time the modal opens).
  watch(targetSiteId, () => {
    stairTargets.value = {};
  });
  watch(open, (isOpen) => {
    if (!isOpen) stairTargets.value = {};
  });

  const { data: targetSiteData } = useLocation(computed(() => targetSiteId.value));
  const targetSite = computed(() => targetSiteData.value ?? null);

  const { data: siteChildrenData } = useLocations(computed(() => targetSiteId.value || null));
  const siteChildren = computed(() => siteChildrenData.value ?? []);
  const bindableChildren = computed(() => bindableSpaces(siteChildren.value));
  const spaceNameById = computed(() => new Map(siteChildren.value.map((c) => [c.id, c.name])));
  /** Nested sites among this site's children — the only valid far end for a stair. */
  const stairTargetOptions = computed(() =>
    bindableChildren.value.filter((c) => isSiteType(c.location_type)).map((c) => ({ id: c.id, name: c.name })),
  );

  const spaceIds = computed(() => bindableChildren.value.map((c) => c.id));
  const { data: regionsData } = useLocationMapRegions(computed(() => targetSiteId.value));
  const { data: doorsData } = useSiteDoors(spaceIds);
  const { data: placementsData } = useSitePlacements(spaceIds);

  const inputs = computed<PublishInputs | null>(() => {
    if (!targetSiteId.value) return null;
    return {
      siteId: targetSiteId.value,
      derived: opts.structure(),
      spaces: bindableChildren.value.map((c) => ({ id: c.id, name: c.name, location_type: c.location_type })),
      regions: regionsData.value ?? [],
      doors: doorsData.value ?? [],
      placements: placementsData.value ?? [],
      stairTargets: stairTargets.value,
    };
  });

  const plan = computed<PublishPlan | null>(() => (inputs.value ? planPublish(inputs.value) : null));

  const bakedDims = computed(() => {
    const map = opts.map();
    return map ? computeBakedDimensions(map) : null;
  });

  // ── Mutations ─────────────────────────────────────────────────────────
  const updateLocationMapUrl = useUpdateLocationMapUrl();
  const updateLocationGridCalibration = useUpdateLocationGridCalibration();
  const updateLocation = useUpdateLocation();
  const createLocation = useCreateLocation();
  const createRegion = useCreateLocationMapRegion();
  const updateRegion = useUpdateLocationMapRegion();
  const createDoor = useCreateLocationDoor();
  const updateDoor = useUpdateLocationDoor();
  const createPlacement = useCreateLocationPlacement();
  const updatePlacement = useUpdateEntityPlacement();

  function resolveWayEndpoint(id: string, spaceKeyToLocationId: ReadonlyMap<string, string>): string {
    if (!isCreatedRef(id)) return id;
    const key = createdRefKey(id);
    const real = spaceKeyToLocationId.get(key);
    if (!real) throw new Error(`Publish: no room resolved for created space "${key}"`);
    return real;
  }

  function resolveSpaceRef(spaceRef: SpaceRef, spaceKeyToLocationId: ReadonlyMap<string, string>): string {
    if (spaceRef.kind === "existing") return spaceRef.spaceId;
    const real = spaceKeyToLocationId.get(spaceRef.spaceKey);
    if (!real) throw new Error(`Publish: no room resolved for created space "${spaceRef.spaceKey}"`);
    return real;
  }

  async function publish(): Promise<void> {
    if (publishing.value) return;
    const map = opts.map();
    const currentPlan = plan.value;
    if (!map || !targetSiteId.value || !currentPlan) return;

    publishing.value = true;
    error.value = null;
    try {
      // (a) Bake the picture and write it + calibration + the rev the DM is publishing.
      const blob = await bakeMap(map, opts.runtimes(), {}, opts.glyphs());
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");
      const url = await uploadToBucket({ bucket: "locationImages", blob, userId: user.id, contentType: "image/webp" });
      if (!url) throw new Error("Upload failed");
      await updateLocationMapUrl.mutateAsync({ id: targetSiteId.value, mapUrl: url, sourceMapId: map.id });
      const dims = computeBakedDimensions(map);
      await updateLocationGridCalibration.mutateAsync({
        id: targetSiteId.value,
        calibration: {
          cells_per_image_width: dims.cols,
          origin_x_pct: 0,
          origin_y_pct: 0,
          origin_cell_x: dims.originCellX,
          origin_cell_y: dims.originCellY,
        },
      });
      await updateLocation.mutateAsync({ id: targetSiteId.value, update: { map_published_rev: map.rev } });

      // (b) Spaces — create rooms + bind fresh regions; reshape existing ones;
      // clear an orphan's geometry without touching the room it still names.
      const spaceKeyToLocationId = new Map<string, string>();
      for (const change of currentPlan.spaces) {
        if (change.kind === "create") {
          const room = await createLocation.mutateAsync({
            name: change.proposedName,
            location_type: "room",
            parent_id: targetSiteId.value,
            campaign_id: targetSite.value?.campaign_id ?? null,
            description: null,
            notes: null,
            tags: [],
            image_url: null,
            map_url: null,
            map_pins: [],
            is_map_shared: false,
            player_visible_to: [],
            player_summary: null,
            is_description_shared: false,
            is_npcs_shared: false,
            is_inventory_shared: false,
            npc_owner_id: null,
            related_location_ids: [],
            source_map_id: null,
            is_battle_map: false,
            grid_calibration: null,
            era_start: null,
            era_end: null,
          });
          spaceKeyToLocationId.set(change.space.key, room.id);
          await createRegion.mutateAsync({
            site_location_id: targetSiteId.value,
            space_location_id: room.id,
            cells: change.space.cells,
            cell_signature: change.space.signature,
            region_role: "space",
            derived_from: change.space.nameSource === "annotation" ? "annotation" : "floodfill",
          });
        } else if (change.kind === "update") {
          spaceKeyToLocationId.set(change.space.key, change.region.space_location_id!);
          await updateRegion.mutateAsync({
            id: change.region.id,
            update: { cells: change.space.cells, cell_signature: change.space.signature },
          });
        } else if (change.kind === "skip" || change.kind === "held") {
          spaceKeyToLocationId.set(change.space.key, change.region.space_location_id!);
        } else if (change.kind === "orphan") {
          await updateRegion.mutateAsync({ id: change.region.id, update: { cells: [], cell_signature: null } });
        }
      }

      // (c) Zones — same create/update shape, tagged `region_role: "zone"`.
      for (const change of currentPlan.zones) {
        if (change.kind === "create") {
          await createRegion.mutateAsync({
            site_location_id: targetSiteId.value,
            region_role: "zone",
            zone_kind: change.zone.kind,
            label: change.zone.label,
            cells: change.zone.cells,
            cell_signature: change.zone.signature,
            derived_from: "floodfill",
          });
        } else if (change.kind === "update" && change.region) {
          await updateRegion.mutateAsync({
            id: change.region.id,
            update: {
              cells: change.zone.cells,
              cell_signature: change.zone.signature,
              zone_kind: change.zone.kind,
              label: change.zone.label,
            },
          });
        }
      }

      // (d) Ways — doors, arches and newly-resolved stairs. Held and skipped
      // rows, and stairs still unresolved, write nothing.
      for (const change of currentPlan.ways) {
        if (change.kind === "create") {
          await createDoor.mutateAsync({
            from_location_id: resolveWayEndpoint(change.fromSpaceId, spaceKeyToLocationId),
            to_location_id: resolveWayEndpoint(change.toSpaceId, spaceKeyToLocationId),
            door_kind: change.way.kind,
            source_edge_key: change.way.edgeKey,
          });
        } else if (change.kind === "update") {
          await updateDoor.mutateAsync({ id: change.door.id, update: { door_kind: change.after } });
        } else if (change.kind === "create-stair") {
          // A stair is never re-matched by edge key on a later publish — it
          // has none — so this is a one-time write, same as a hand-made door.
          await createDoor.mutateAsync({
            from_location_id: resolveWayEndpoint(change.fromSpaceId, spaceKeyToLocationId),
            to_location_id: resolveWayEndpoint(change.toSpaceId, spaceKeyToLocationId),
            door_kind: "stair",
            source_edge_key: null,
          });
        }
      }

      // (e) Placements — new trap/feature links, and re-anchors to whichever
      // room now holds their cell.
      for (const change of currentPlan.placements) {
        if (change.kind === "create") {
          const locationId = resolveSpaceRef(change.spaceRef, spaceKeyToLocationId);
          await createPlacement.mutateAsync({
            location_id: locationId,
            ...(change.target.kind === "trap"
              ? { trap_id: change.target.id }
              : { dungeon_feature_id: change.target.id }),
            source_cell_key: change.link.cellKey,
          });
        } else if (change.kind === "reanchor") {
          const locationId = resolveSpaceRef(change.spaceRef, spaceKeyToLocationId);
          const cellKey =
            change.placement.source_cell_key ??
            findReanchorCellKey(change.placement, opts.structure(), spaceKeyToLocationId, targetSiteId.value);
          await updatePlacement.mutateAsync({
            id: change.placement.id,
            update: { location_id: locationId, source_cell_key: cellKey },
          });
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["location-map-regions"] }),
        queryClient.invalidateQueries({ queryKey: ["location-doors"] }),
        queryClient.invalidateQueries({ queryKey: ["site-doors"] }),
        queryClient.invalidateQueries({ queryKey: ["location-placements"] }),
        queryClient.invalidateQueries({ queryKey: ["locations"] }),
        queryClient.invalidateQueries({ queryKey: ["published-sites"] }),
      ]);

      open.value = false;
      stairTargets.value = {};
    } catch (e) {
      error.value = publishErrorMessage(e);
    } finally {
      publishing.value = false;
    }
  }

  // Bundled for the modal, which is a pure display of these two groups —
  // "who am I publishing to" and "what will happen" — rather than 8 loose
  // props the view would otherwise have to wire one at a time.
  const siteContext = computed<PublishSiteContext>(() => ({
    options: siteOptions.value,
    target: targetSite.value,
    spaceNameById: spaceNameById.value,
    stairTargetOptions: stairTargetOptions.value,
  }));
  const review = computed<PublishReview>(() => ({
    plan: plan.value,
    bakedDims: bakedDims.value,
    mapRev: opts.map()?.rev ?? 0,
    publishing: publishing.value,
    error: error.value,
  }));

  return { open, targetSiteId, stairTargets, siteContext, review, publish };
}
