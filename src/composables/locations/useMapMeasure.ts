import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";
import { useHotkeys } from "@/composables/useHotkeys";
import { summarizeRoute, type RoutePoint } from "@/lib/locations/mapRoute";
import { DEFAULT_TRAVEL_PACE, type TravelPaceId } from "@/rules/travelPace";
import type { ImageSize } from "@/lib/locations/mapScale";
import type { MapScale } from "@/types/location.types";

/**
 * The Atlas map's Measure tool state (#932): whether it is on, the waypoints
 * tapped so far, the pace, and what they add up to.
 *
 * A route is scratch work. It is not saved anywhere and leaving the tool throws
 * it away; the travel event the DM writes onto the calendar is the record. So
 * this is plain component-scoped state, not a store or a query.
 *
 * `size` is a getter, not a value, because the image's natural size arrives
 * after the map mounts: it returns null until then.
 */
export function useMapMeasure(options: {
  scale: MaybeRefOrGetter<MapScale | null>;
  size: () => ImageSize | null;
}) {
  const measuring = ref(false);
  const points = ref<RoutePoint[]>([]);
  const paceId = ref<TravelPaceId>(DEFAULT_TRAVEL_PACE);

  const summary = computed(() => {
    const scale = toValue(options.scale);
    const size = options.size();
    return scale && size ? summarizeRoute(points.value, scale, size, paceId.value) : null;
  });

  function start() {
    measuring.value = true;
  }

  /** Leaves the tool and drops the route. */
  function stop() {
    measuring.value = false;
    points.value = [];
  }

  function toggle() {
    if (measuring.value) stop();
    else start();
  }

  function addPoint(point: RoutePoint) {
    points.value = [...points.value, point];
  }

  function undo() {
    points.value = points.value.slice(0, -1);
  }

  function clear() {
    points.value = [];
  }

  // Escape is the way out of any modal tool. Page layer, so an open dialog
  // (overlay layer) still gets it first.
  useHotkeys(
    [{ combo: "escape", description: "Leave measure mode", handler: stop, hidden: true }],
    { enabled: measuring },
  );

  return { measuring, points, paceId, summary, start, stop, toggle, addPoint, undo, clear };
}

export type MapMeasure = ReturnType<typeof useMapMeasure>;
