import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { resolveDoorEndpoints } from "@/lib/locations/doors";
import type { LocationDoor } from "@/types/locationDoor.types";
import type {
  LocationMapRegion,
  LocationMapRegionInsert,
  LocationMapRegionUpdate,
} from "@/types/locationMapRegion.types";

const QUERY_KEY = "location-map-regions";

async function fetchSiteRegions(siteId: string): Promise<LocationMapRegion[]> {
  const { data, error } = await supabase
    .from("location_map_regions")
    .select("*")
    .eq("site_location_id", siteId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as LocationMapRegion[];
}

async function createLocationMapRegion(insert: LocationMapRegionInsert): Promise<LocationMapRegion> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("location_map_regions")
    .insert({ ...insert, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as LocationMapRegion;
}

async function updateLocationMapRegion(id: string, update: LocationMapRegionUpdate): Promise<LocationMapRegion> {
  const { data, error } = await supabase
    .from("location_map_regions")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as LocationMapRegion;
}

/** Selects the deleted row back (`site_location_id` in particular) so the
 *  caller can re-derive that site's doors without a second round trip — see
 *  `reconcileSiteDoorEndpoints` below. */
async function deleteLocationMapRegion(id: string): Promise<{ site_location_id: string }> {
  const { data, error } = await supabase
    .from("location_map_regions")
    .delete()
    .eq("id", id)
    .select("site_location_id")
    .single();
  if (error) throw error;
  return data as { site_location_id: string };
}

// ── Re-deriving door endpoints off a region change (#884, Build step 5) ─────
//
// "A door becomes an edge on the plan, and its endpoints are derived from the
// traced regions either side of it" only holds if that derivation re-runs
// whenever the plan changes underneath an already-placed door — a region
// created, reshaped, bound, unbound or deleted. One place, off every region
// mutation below, rather than each caller remembering to ask.

async function fetchSiteSpaceIds(siteId: string): Promise<string[]> {
  const { data, error } = await supabase.from("locations").select("id").eq("parent_id", siteId);
  if (error) throw error;
  return (data ?? []).map((row) => row.id as string);
}

/** Every door of this site that has actually been placed (`edge_key` set) —
 *  the only ones whose endpoints anything derives from a plan edge. A door's
 *  `from_location_id` is always a direct child of the site whose plan it sits
 *  on (the endpoint guard requires both sides to share one parent), so
 *  filtering on that is exhaustive, the same reasoning `useSiteDoors` already
 *  documents. */
async function fetchPlacedSiteDoors(spaceIds: readonly string[]): Promise<LocationDoor[]> {
  if (!spaceIds.length) return [];
  const { data, error } = await supabase
    .from("location_doors")
    .select("*")
    .in("from_location_id", spaceIds)
    .not("edge_key", "is", null);
  if (error) throw error;
  return data as LocationDoor[];
}

/**
 * Re-derives every placed door's endpoints against this site's current
 * regions and writes only the ones that actually changed. Returns how many
 * were written, so a caller only pays for a door-query invalidation when
 * there's something new to show.
 *
 * Endpoints are re-derived unconditionally, regardless of `derived_from` — a
 * door's endpoints are never authored, only ever a fact about where it sits
 * on the plan, so there is no "DM edit" for a re-publish (or a region change)
 * to hold back here, unlike `door_kind`/the authored flags.
 */
export async function reconcileSiteDoorEndpoints(siteId: string): Promise<number> {
  const [regions, spaceIds] = await Promise.all([fetchSiteRegions(siteId), fetchSiteSpaceIds(siteId)]);
  const doors = await fetchPlacedSiteDoors(spaceIds);
  if (!doors.length) return 0;

  const resolutions = resolveDoorEndpoints(doors, regions);
  const byId = new Map(doors.map((d) => [d.id, d]));
  const changed = resolutions.filter(({ doorId, endpoints }) => {
    if (!endpoints) return false; // ambiguous derivation — leave the existing door alone
    const door = byId.get(doorId);
    return !!door && (door.from_location_id !== endpoints.fromLocationId || door.to_location_id !== endpoints.toLocationId);
  });

  await Promise.all(
    changed.map(({ doorId, endpoints }) =>
      supabase
        .from("location_doors")
        .update({ from_location_id: endpoints!.fromLocationId, to_location_id: endpoints!.toLocationId })
        .eq("id", doorId),
    ),
  );
  return changed.length;
}

async function afterRegionMutation(siteId: string, queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  const changed = await reconcileSiteDoorEndpoints(siteId);
  if (changed > 0) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["location-doors"] }),
      queryClient.invalidateQueries({ queryKey: ["site-doors"] }),
    ]);
  }
}

/**
 * A DM edit always wins over the next re-publish (#868, frame 01: "a DM edit
 * to a name, a bind or a door always wins over the next re-publish —
 * provenance is `derived_from`, and once touched it reads 'dm'"). A freshly
 * created region already gets that column default from the DB — see
 * `20260908215640_a_region_has_a_role.sql` — so only an UPDATE to a region
 * the Cartographer might have derived (floodfill/annotation) needs this;
 * spread it onto any update a DM's own rename, bind/unbind, paint stroke, pen
 * ring or template drop makes, so a re-publish never overwrites it.
 */
export function dmEdit(update: LocationMapRegionUpdate): LocationMapRegionUpdate {
  return { ...update, derived_from: "dm" };
}

/** A site's traced regions — bound and unbound alike. The viewer decides how
 *  to group them against the site's rooms; this composable just returns the
 *  rows. */
export function useLocationMapRegions(siteId: string | Ref<string>) {
  const idRef = isRef(siteId) ? siteId : ref(siteId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value] as const),
    queryFn: ({ queryKey: [, siteId] }) => fetchSiteRegions(siteId),
    enabled: () => !!idRef.value,
  });
}

export function useCreateLocationMapRegion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createLocationMapRegion,
    onSuccess: async (region) => {
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      await afterRegionMutation(region.site_location_id, queryClient);
    },
  });
}

export function useUpdateLocationMapRegion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: LocationMapRegionUpdate }) =>
      updateLocationMapRegion(id, update),
    onSuccess: async (region) => {
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      await afterRegionMutation(region.site_location_id, queryClient);
    },
  });
}

export function useDeleteLocationMapRegion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLocationMapRegion,
    onSuccess: async (deleted) => {
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      await afterRegionMutation(deleted.site_location_id, queryClient);
    },
  });
}
