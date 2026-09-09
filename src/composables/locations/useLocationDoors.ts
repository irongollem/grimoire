import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { LocationDoor, LocationDoorInsert, LocationDoorUpdate } from "@/types/locationDoor.types";
import { doorsFromRoomPerspective } from "@/lib/locations/doors";
import type { RoomDoorView as GenericRoomDoorView } from "@/lib/locations/doors";

/**
 * A door joined to both endpoints' names — needed because a door is read from
 * whichever room's "Ways out" panel is open, and that room may be either the
 * `from` or the `to` side (see `doorsFromRoomPerspective` below).
 */
export interface LocationDoorWithRooms extends LocationDoor {
  from_location: { id: string; name: string } | null;
  to_location: { id: string; name: string } | null;
}

/** One door, as seen from a specific room: which room is at the other end,
 *  regardless of whether *this* room is the door's `from` or `to` side. */
export type RoomDoorView = GenericRoomDoorView<LocationDoorWithRooms>;

/** Re-exported from `lib/locations/doors.ts` (#868), which now owns the one
 *  implementation this composable and the site-wide "Ways out" panel both
 *  read from — see that module for the merge rule. */
export { doorsFromRoomPerspective };

const QUERY_KEY = "location-doors";

async function fetchRoomDoors(roomId: string): Promise<LocationDoorWithRooms[]> {
  const { data, error } = await supabase
    .from("location_doors")
    .select(
      "*, from_location:locations!from_location_id(id, name), to_location:locations!to_location_id(id, name)",
    )
    // A room's ways out are its own outgoing doors, plus any door leading IN
    // from another room that isn't one-way — a one-way door into this room is
    // not a way out of it, so it's excluded here rather than filtered later.
    .or(`from_location_id.eq.${roomId},and(to_location_id.eq.${roomId},is_one_way.eq.false)`)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as LocationDoorWithRooms[];
}

/** Accepts `door_kind` and `dungeon_feature_id` (#868) through `LocationDoorInsert`
 *  like every other field here — nothing about the create path is kind-specific,
 *  so a stair or a feature-governed secret door is created exactly like a plain
 *  one. */
async function createLocationDoor(insert: LocationDoorInsert): Promise<LocationDoor> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("location_doors")
    .insert({ ...insert, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as LocationDoor;
}

async function updateLocationDoor(id: string, update: LocationDoorUpdate): Promise<LocationDoor> {
  const { data, error } = await supabase
    .from("location_doors")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as LocationDoor;
}

async function deleteLocationDoor(id: string): Promise<void> {
  const { error } = await supabase.from("location_doors").delete().eq("id", id);
  if (error) throw error;
}

// ── Public composables ─────────────────────────────────────────────────────────

/** A room's ways out, merged from this room's point of view. See
 *  `doorsFromRoomPerspective` for the merge rule. */
export function useLocationDoors(roomId: string | Ref<string>) {
  const idRef = isRef(roomId) ? roomId : ref(roomId);
  const query = useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value]),
    queryFn: () => fetchRoomDoors(idRef.value),
    enabled: () => !!idRef.value,
  });
  const doors = computed(() => doorsFromRoomPerspective(query.data.value ?? [], idRef.value));
  return { ...query, doors };
}

export function useCreateLocationDoor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createLocationDoor,
    // A door touches two rooms at once; invalidating the whole key rather
    // than just the room this panel is mounted on also refreshes the other
    // endpoint's panel if it happens to be mounted too (AtlasPlacePane keeps
    // one instance alive across selections).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateLocationDoor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: LocationDoorUpdate }) => updateLocationDoor(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useDeleteLocationDoor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLocationDoor,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
