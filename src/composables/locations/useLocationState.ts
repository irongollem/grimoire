import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { LocationState, LocationStateEvent, LocationStateEventInsert, LocationStateFact } from "@/types/locationState.types";

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
export function buildLocationStateIndex(
  rows: readonly LocationState[],
): Map<string, Partial<Record<LocationStateFact, LocationState>>> {
  const index = new Map<string, Partial<Record<LocationStateFact, LocationState>>>();
  for (const row of rows) {
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
