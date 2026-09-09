import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
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

async function deleteLocationMapRegion(id: string): Promise<void> {
  const { error } = await supabase.from("location_map_regions").delete().eq("id", id);
  if (error) throw error;
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
    queryKey: computed(() => [QUERY_KEY, idRef.value]),
    queryFn: () => fetchSiteRegions(idRef.value),
    enabled: () => !!idRef.value,
  });
}

export function useCreateLocationMapRegion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createLocationMapRegion,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateLocationMapRegion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: LocationMapRegionUpdate }) =>
      updateLocationMapRegion(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useDeleteLocationMapRegion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLocationMapRegion,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
