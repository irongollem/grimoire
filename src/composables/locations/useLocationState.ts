import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { DOOR_STATE_FACTS, LOCATION_STATE_FACTS } from "@/types/locationState.types";
import type {
  DoorStateFact,
  LocationState,
  LocationStateEvent,
  LocationStateEventInsert,
  LocationStateFact,
} from "@/types/locationState.types";

/**
 * Exported because moving the party invalidates it from outside this module.
 * A database trigger records the party's first arrival somewhere as an
 * `explored` assertion (#790), so rows appear that the client never asked for
 * and cannot infer — without an explicit invalidation the DM moves the party,
 * the room really is explored, and the UI keeps saying it is not until a
 * reload. See `useSetCampaignLocation`.
 */
export const LOCATION_STATE_QUERY_KEY = "location-state";
const QUERY_KEY = LOCATION_STATE_QUERY_KEY;

async function fetchLocationState(locationIds: readonly string[]): Promise<LocationState[]> {
  if (!locationIds.length) return [];
  const { data, error } = await supabase
    .from("location_state")
    .select("*")
    .in("location_id", locationIds);
  if (error) throw error;
  return data as LocationState[];
}

async function fetchDoorState(siteId: string): Promise<LocationState[]> {
  const { data, error } = await supabase
    .from("location_state")
    .select("*")
    .eq("location_id", siteId)
    .not("door_id", "is", null);
  if (error) throw error;
  return data as LocationState[];
}

async function insertLocationStateEvent(insert: LocationStateEventInsert): Promise<LocationStateEvent> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("location_state_events")
    .insert({ ...insert, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as LocationStateEvent;
}

// ── Pure derivation ───────────────────────────────────────────────────────────

/**
 * Indexes rows by location, then by fact — the shape both `stateOf` helpers
 * below read from. A fact absent from the inner record means "never
 * asserted"; callers must not coerce that into `{ value: false }`, which is
 * a different, explicit claim.
 *
 * `location_state` is already `distinct on (location_id, fact)` newest-first,
 * so two rows should never collide on the same key here — but this function
 * is the one place that invariant would break silently if it ever did (a
 * batched query merging rows for several rooms, a future optimistic-update
 * path), so a collision resolves to whichever row asserts more recently
 * rather than to array order.
 */
export type LocationFactRow = LocationState & { fact: LocationStateFact; door_id: null };

export function isLocationFactRow(row: LocationState): row is LocationFactRow {
  return row.door_id === null && (LOCATION_STATE_FACTS as readonly string[]).includes(row.fact);
}

export function buildLocationStateIndex(
  rows: readonly LocationState[],
): Map<string, Partial<Record<LocationStateFact, LocationState>>> {
  const index = new Map<string, Partial<Record<LocationStateFact, LocationState>>>();
  for (const row of rows) {
    // Door facts (#868) share the log and the view but are keyed by door, not
    // by location; they have their own reader. Indexing them here would let a
    // site's two "found" doors overwrite each other under one key.
    if (!isLocationFactRow(row)) continue;
    const forLocation = index.get(row.location_id) ?? {};
    const existing = forLocation[row.fact];
    // Strictly greater, not >=: the view already returns newest-first (it orders
    // by the log's `seq`), so on equal timestamps the row seen FIRST is the newer
    // one and must be kept. `>=` would silently prefer the older of two assertions
    // written in the same transaction — the same tiebreak bug the migration fixed
    // in SQL by ordering on a sequence instead of a timestamp.
    if (!existing || new Date(row.asserted_at).getTime() > new Date(existing.asserted_at).getTime()) {
      forLocation[row.fact] = row;
    }
    index.set(row.location_id, forLocation);
  }
  return index;
}

/**
 * A door fact (#868) — `unlocked` / `found` — keyed by `door_id` rather than
 * `location_id`. The two fact families share one log and one view, but a
 * door's `location_id` is the SITE its two spaces share, so indexing door
 * rows the same way `buildLocationStateIndex` indexes location rows would
 * merge every door of a site under one key.
 */
export type DoorFactRow = LocationState & { fact: DoorStateFact; door_id: string };

export function isDoorFactRow(row: LocationState): row is DoorFactRow {
  return row.door_id !== null && (DOOR_STATE_FACTS as readonly string[]).includes(row.fact);
}

/** Same collision rule as `buildLocationStateIndex` — keeps the newest row
 *  per (door, fact) rather than trusting array order. */
export function buildDoorStateIndex(
  rows: readonly LocationState[],
): Map<string, Partial<Record<DoorStateFact, LocationState>>> {
  const index = new Map<string, Partial<Record<DoorStateFact, LocationState>>>();
  for (const row of rows) {
    if (!isDoorFactRow(row)) continue;
    const forDoor = index.get(row.door_id) ?? {};
    const existing = forDoor[row.fact];
    if (!existing || new Date(row.asserted_at).getTime() > new Date(existing.asserted_at).getTime()) {
      forDoor[row.fact] = row;
    }
    index.set(row.door_id, forDoor);
  }
  return index;
}

// ── Public composables ─────────────────────────────────────────────────────────

/**
 * One location's current answer for each fact. `stateOf(fact)` returns
 * `undefined` when the fact has never been asserted — render that as
 * "unknown", visually distinct from a row whose `value` is explicitly
 * `false`.
 */
export function useLocationState(locationId: string | Ref<string>) {
  const idRef = isRef(locationId) ? locationId : ref(locationId);
  const query = useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value]),
    queryFn: () => fetchLocationState([idRef.value]),
    enabled: () => !!idRef.value,
  });
  const index = computed(() => buildLocationStateIndex(query.data.value ?? []));
  function stateOf(fact: LocationStateFact): LocationState | undefined {
    return index.value.get(idRef.value)?.[fact];
  }
  return { ...query, stateOf };
}

/**
 * Many locations' current answers in one query, so a rooms list can show
 * markers without one query per row — `SiteRoomsPanel`'s reason for existing.
 */
export function useLocationStateForRooms(roomIds: Ref<string[]>) {
  // Sorted so the query key is stable across re-renders that reorder the same
  // set of ids (a drag-reorder of the rooms list must not refetch this).
  const sortedIds = computed(() => [...roomIds.value].sort());
  const query = useQuery({
    queryKey: computed(() => [QUERY_KEY, "rooms", sortedIds.value]),
    queryFn: () => fetchLocationState(roomIds.value),
    enabled: () => roomIds.value.length > 0,
  });
  const index = computed(() => buildLocationStateIndex(query.data.value ?? []));
  function stateOf(locationId: string, fact: LocationStateFact): LocationState | undefined {
    return index.value.get(locationId)?.[fact];
  }
  return { ...query, stateOf };
}

/**
 * A site's door facts (#868) in one query — `unlocked` and `found` — so
 * `SiteWaysOutPanel` can show every door's play state without one query per
 * row, the same reason `useLocationStateForRooms` batches room facts.
 * `siteId` is the SITE the doors' two spaces share, not any one door or room.
 */
export function useDoorStateForSite(siteId: string | Ref<string>) {
  const idRef = isRef(siteId) ? siteId : ref(siteId);
  const query = useQuery({
    queryKey: computed(() => [QUERY_KEY, "doors", idRef.value]),
    queryFn: () => fetchDoorState(idRef.value),
    enabled: () => !!idRef.value,
  });
  const index = computed(() => buildDoorStateIndex(query.data.value ?? []));
  function stateOf(doorId: string, fact: DoorStateFact): LocationState | undefined {
    return index.value.get(doorId)?.[fact];
  }
  return { ...query, stateOf };
}

/**
 * Appends one assertion. Undo is calling this again with the opposite
 * `value` for the same fact — there is no update or delete path, by design:
 * the log is append-only at the database level too.
 */
export function useAssertLocationState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: insertLocationStateEvent,
    // Invalidates both the single-location and the batched-rooms shape, the
    // same "invalidate the whole key" choice `useLocationDoors` makes for the
    // same reason: one assertion can be visible from more than one mounted
    // query at once (a room's own controls and its site's rooms-list markers).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

/** A door-fact assertion — `location_id` is the SITE the door's two spaces
 *  share, per the DB guard, not the door itself. */
export interface DoorStateAssertion {
  location_id: string;
  door_id: string;
  fact: DoorStateFact;
  value: boolean;
  note?: string | null;
}

/**
 * Typed convenience over `useAssertLocationState` (#868) for door facts
 * specifically — same mutation, same invalidation — narrowed so a caller
 * asserting a door's `unlocked`/`found` fact can't accidentally build a
 * payload shaped like a location fact (`door_id` omitted) and land the wrong
 * branch of `LocationStateEventInsert`.
 */
export function useAssertDoorState() {
  const mutation = useAssertLocationState();
  return {
    ...mutation,
    mutate: (input: DoorStateAssertion, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate(input, options),
    mutateAsync: (input: DoorStateAssertion) => mutation.mutateAsync(input),
  };
}
