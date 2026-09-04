import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type {
  LocationPlacement,
  LocationPlacementInsert,
  LocationPlacementUpdate,
} from "@/types/locationPlacement.types";

/**
 * A placement row joined to the one referenced entity's display name — never
 * more than one of the four is non-null, mirroring the exclusive-arc FKs on
 * the row itself (see `placementKind` in the types file).
 *
 * Resolving the name via an embedded select rather than cross-referencing
 * `useTraps()` / `useDungeonFeatures()` / etc. means a placement still
 * displays correctly even when its target has since been scoped out of the
 * active campaign (traps and roll/loot tables can be re-scoped after the
 * fact) — RLS on the joined tables is owner-scoped, not campaign-scoped, so
 * the join always resolves for a row this DM can see at all.
 */
export interface LocationPlacementWithEntity extends LocationPlacement {
  trap: { id: string; name: string } | null;
  dungeon_feature: { id: string; name: string } | null;
  roll_table: { id: string; name: string } | null;
  loot_table: { id: string; name: string } | null;
}

const QUERY_KEY = "location-placements";

async function fetchLocationPlacements(locationId: string): Promise<LocationPlacementWithEntity[]> {
  const { data, error } = await supabase
    .from("location_placements")
    .select(
      "*, trap:traps(id, name), dungeon_feature:dungeon_features(id, name), roll_table:roll_tables(id, name), loot_table:loot_tables(id, name)",
    )
    .eq("location_id", locationId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as LocationPlacementWithEntity[];
}

async function createLocationPlacement(insert: LocationPlacementInsert): Promise<LocationPlacement> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("location_placements")
    .insert({ ...insert, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as LocationPlacement;
}

async function updateLocationPlacement(id: string, update: LocationPlacementUpdate): Promise<LocationPlacement> {
  const { data, error } = await supabase
    .from("location_placements")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as LocationPlacement;
}

async function deleteLocationPlacement(id: string): Promise<void> {
  const { error } = await supabase.from("location_placements").delete().eq("id", id);
  if (error) throw error;
}

// ── Public composables ─────────────────────────────────────────────────────────

/** Everything prepared in one location, joined to each target's display name. */
export function useLocationPlacements(locationId: string | Ref<string>) {
  const idRef = isRef(locationId) ? locationId : ref(locationId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value]),
    queryFn: () => fetchLocationPlacements(idRef.value),
    enabled: () => !!idRef.value,
  });
}

export function useCreateLocationPlacement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createLocationPlacement,
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, vars.location_id] });
    },
  });
}

/** Updates the DM note on a placement — the only field a DM edits after the fact. */
export function useUpdateLocationPlacement(locationId: Ref<string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: LocationPlacementUpdate }) =>
      updateLocationPlacement(id, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, locationId.value] });
    },
  });
}

/** Removes a placement — unlinks the entity from this room, does not delete the
 *  trap / feature / table itself. */
export function useDeleteLocationPlacement(locationId: Ref<string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLocationPlacement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, locationId.value] });
    },
  });
}
