import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { placementKind } from "@/types/locationPlacement.types";
import type {
  LocationPlacement,
  LocationPlacementInsert,
  LocationPlacementKind,
  LocationPlacementUpdate,
} from "@/types/locationPlacement.types";
import type { LocationType } from "@/types/location.types";

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

/**
 * A placement row joined to the location it sits in — the reverse of
 * `LocationPlacementWithEntity`, read from a trap/feature/table's own page
 * (#802). `location` is nullable for the same reason the forward join's four
 * entity columns are: `locations` SELECT is owner-scoped, so a row can in
 * principle outlive the caller's ability to read its location (never expected
 * in practice, since placing something requires owning the location at
 * insert time — but the type stays honest about it rather than assuming).
 */
export interface LocationPlacementWithLocation extends LocationPlacement {
  location: { id: string; name: string; location_type: LocationType } | null;
}

const QUERY_KEY = "location-placements";

/**
 * Resolves the (kind, id) of an insert/update/delete payload's exclusive-arc
 * target without re-deriving `placementKind`'s own logic: the four fields are
 * simply defaulted to `null` for the ones an insert never set (they're
 * `undefined`, not `null`, on `LocationPlacementInsert`), then handed to the
 * one function that actually interprets them.
 */
function targetOf(row: {
  trap_id?: string | null;
  dungeon_feature_id?: string | null;
  roll_table_id?: string | null;
  loot_table_id?: string | null;
}): { kind: LocationPlacementKind; id: string } {
  const normalized = {
    trap_id: row.trap_id ?? null,
    dungeon_feature_id: row.dungeon_feature_id ?? null,
    roll_table_id: row.roll_table_id ?? null,
    loot_table_id: row.loot_table_id ?? null,
  };
  const kind = placementKind(normalized);
  return { kind, id: normalized[`${kind}_id`] as string };
}

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

/** Everywhere one entity (a trap, feature, roll table or loot table) has been
 *  placed — the reverse of `fetchLocationPlacements`, keyed on the exclusive-
 *  arc column that names `kind` rather than on `location_id`. */
async function fetchEntityPlacements(
  kind: LocationPlacementKind,
  entityId: string,
): Promise<LocationPlacementWithLocation[]> {
  const { data, error } = await supabase
    .from("location_placements")
    .select("*, location:locations(id, name, location_type)")
    .eq(`${kind}_id`, entityId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as LocationPlacementWithLocation[];
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

/** Deletes and returns the removed row — the caller needs its exclusive-arc
 *  columns and `location_id` to invalidate both the forward and reverse
 *  queries, and a plain `.delete()` with no `.select()` returns nothing. */
async function deleteLocationPlacement(id: string): Promise<LocationPlacement> {
  const { data, error } = await supabase.from("location_placements").delete().eq("id", id).select().single();
  if (error) throw error;
  return data as LocationPlacement;
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

/** Everywhere one trap / feature / roll table / loot table has been placed,
 *  joined to each location's display name (#802 — the reverse of
 *  `useLocationPlacements`, read from the entity's own page). `kind` is not
 *  reactive: every call site mounts one `EntityPlacements` per fixed kind. */
export function useEntityPlacements(kind: LocationPlacementKind, entityId: string | Ref<string>) {
  const idRef = isRef(entityId) ? entityId : ref(entityId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "entity", kind, idRef.value]),
    queryFn: () => fetchEntityPlacements(kind, idRef.value),
    enabled: () => !!idRef.value,
  });
}

export function useCreateLocationPlacement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createLocationPlacement,
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, vars.location_id] });
      const { kind, id } = targetOf(vars);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "entity", kind, id] });
    },
  });
}

/** Updates the DM note on a placement — the only field a DM edits after the
 *  fact. Called from the forward panel (`LocationPlacements`), which is
 *  always looking at one fixed location; invalidation still also reaches the
 *  entity side (derived from the row TanStack gets back), since the same note
 *  is what `EntityPlacements` shows on the entity's own page. */
export function useUpdateLocationPlacement(locationId: Ref<string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: LocationPlacementUpdate }) =>
      updateLocationPlacement(id, update),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, locationId.value] });
      const { kind, id } = targetOf(data);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "entity", kind, id] });
    },
  });
}

/** Same update, called from the entity's own page (`EntityPlacements`). That
 *  panel spans placements across many different locations at once, so there
 *  is no single fixed `locationId` to close over — both invalidation targets
 *  are derived from the row the mutation gets back instead. */
export function useUpdateEntityPlacement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: LocationPlacementUpdate }) =>
      updateLocationPlacement(id, update),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, data.location_id] });
      const { kind, id } = targetOf(data);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "entity", kind, id] });
    },
  });
}

/** Removes a placement — unlinks the entity from this room, does not delete the
 *  trap / feature / table itself. Called from the forward panel. */
export function useDeleteLocationPlacement(locationId: Ref<string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLocationPlacement,
    onSuccess: (deleted) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, locationId.value] });
      const { kind, id } = targetOf(deleted);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "entity", kind, id] });
    },
  });
}

/** Same removal, called from the entity's own page — see `useUpdateEntityPlacement`
 *  for why this can't close over one fixed `locationId` the way the forward
 *  panel's version can. */
export function useDeleteEntityPlacement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLocationPlacement,
    onSuccess: (deleted) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, deleted.location_id] });
      const { kind, id } = targetOf(deleted);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "entity", kind, id] });
    },
  });
}
