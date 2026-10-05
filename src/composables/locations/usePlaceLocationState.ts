import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useLocations } from "@/composables/locations/useLocations";
import { useLocationStateForRooms } from "@/composables/locations/useLocationState";
import { stateReadScope } from "@/lib/locations/stateReadScope";
import type { LocationState, LocationStateFact } from "@/types/locationState.types";

/**
 * One place's current answer for each fact, read together with its interior
 * spaces' so the Progress toggles and the Rooms list share a single request
 * (`stateReadScope`, #972). `stateOf(fact)` returns `undefined` when the fact
 * has never been asserted — render that as "unknown", visually distinct from
 * a row whose `value` is explicitly `false`.
 *
 * Its own file, not `useLocationState.ts`: that module is imported at boot
 * (`useCampaigns` reads its query key), and importing `useLocations` there
 * dragged the whole locations composable into the entry chunk.
 */
export function usePlaceLocationState(locationId: string | Ref<string>) {
  const idRef = isRef(locationId) ? locationId : ref(locationId);
  const { data: children } = useLocations(idRef);
  const scope = computed(() => (idRef.value ? stateReadScope(idRef.value, children.value) : []));
  const query = useLocationStateForRooms(scope);
  function stateOf(fact: LocationStateFact): LocationState | undefined {
    return query.stateOf(idRef.value, fact);
  }
  return { ...query, stateOf };
}
