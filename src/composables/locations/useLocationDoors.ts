import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { LocationDoor, LocationDoorInsert, LocationDoorUpdate } from "@/types/locationDoor.types";

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
export interface RoomDoorView {
  door: LocationDoorWithRooms;
  otherRoomId: string;
  otherRoomName: string;
}

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

// ── Pure derivation ───────────────────────────────────────────────────────────

function compareDoorViews(a: RoomDoorView, b: RoomDoorView): number {
  if (a.door.sort_order !== b.door.sort_order) {
    if (a.door.sort_order === null) return 1;
    if (b.door.sort_order === null) return -1;
    return a.door.sort_order - b.door.sort_order;
  }
  return a.otherRoomName.localeCompare(b.otherRoomName);
}

/**
 * Merges a room's outgoing doors with its bidirectional incoming doors into
 * one "ways out" list, told from that room's point of view.
 *
 * Re-checks the `is_one_way` exclusion that `fetchRoomDoors` already applies
 * server-side, so this function is correct for any row set handed to it —
 * including a test fixture that (deliberately) includes a one-way row leading
 * in, to prove it gets dropped rather than merely never fetched.
 */
export function doorsFromRoomPerspective(
  rows: readonly LocationDoorWithRooms[],
  roomId: string,
): RoomDoorView[] {
  const views: RoomDoorView[] = [];
  for (const door of rows) {
    if (door.from_location_id === roomId) {
      views.push({ door, otherRoomId: door.to_location_id, otherRoomName: door.to_location?.name ?? "???" });
    } else if (door.to_location_id === roomId && !door.is_one_way) {
      views.push({ door, otherRoomId: door.from_location_id, otherRoomName: door.from_location?.name ?? "???" });
    }
  }
  return views.sort(compareDoorViews);
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
